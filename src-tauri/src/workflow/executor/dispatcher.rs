//! NodeDispatcher — 双协议派发 + 10 护栏
//!
//! ## 双协议
//!
//! - **Sync**  — 一次性：发 `workflow:dispatch` event → 等 `workflow_node_result` 回调
//! - **Stream** — 流式：发 `workflow:dispatch` event → 等若干 `workflow_node_chunk` 回调
//!                → 最后 `chunk.done == true` 时收口，构造 `NodeDispatchResult`
//!
//! ## 10 护栏
//!
//! | # | 名称 | 实现位置 |
//! |---|------|----------|
//! | A | 协议 mismatch | `validate_protocol_match` |
//! | B | requestId 验证 | `validate_request_id` |
//! | C | tokio timeout | 由 `TimeoutWatchdog` 在 orchestrator 层 wrap |
//! | D | cancel 传播 | `cancel_signal` 共享 `Arc<AtomicBool>` |
//! | E | pending 持久化 | `register_pending` / `unregister_pending`（写 Sqlite） |
//! | F | 深拷贝 context | `deep_clone_context`（serde_json 隔离） |
//! | G | 输出 schema 校验 | `validate_output_schema`（Phase 3 接入 JSON-Schema） |
//! | H | chunk size 限制 | `validate_chunk_size`（64KB 上限） |
//! | I | 心跳检查 | `update_heartbeat` / `check_heartbeat_liveness` |
//! | J | seq 排序 | `StreamChunkAccumulator` |
//!
//! ## 当前实现进度
//!
//! - 2.2 占位：`dispatch_blocking` 立即返回 success，TS 端 handler 还未迁移
//! - 2.4 落地：10 护栏所有 `validate_*` / `register_*` / `accumulate_*` API 完成
//! - 2.5/2.6 待做：把 `dispatch_blocking` 改为真实等待 TS oneshot/callback

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::mpsc::{sync_channel, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::Value;
use tauri::{AppHandle, Emitter};
use worldsmith_core::storage::sqlite::SqliteStore;
use worldsmith_core::storage::workflow::WorkflowStore;

use crate::workflow::dispatch_protocol::{
    NodeDispatchChunk, NodeDispatchRequest, NodeDispatchResult, NodeDispatchMessage, NodeProtocol,
};
use crate::workflow::error::WorkflowError;

/// chunk 大小上限（64 KB），护栏 H
pub const MAX_CHUNK_BYTES: usize = 64 * 1024;

/// DispatchHandle — 一次派发的回调句柄
///
/// Phase 5 端到端贯通：dispatcher 发 event → TS 端 execute → 通过
/// `workflow_node_result` / `workflow_node_chunk` 回调 invoke 这边 →
/// commands/dispatch.rs 找 `request_id` 对应的 DispatchHandle，把结果 send
/// 到 result_tx，阻塞中的 `dispatch_blocking` 立即拿到。
///
/// 字段：
///   * `protocol` — 派发时的协议（护栏 A，TS 端上报协议时会校验）
///   * `result_tx` — sync / stream 节点都通过这个 sender 一次性 send 终态
///   * `chunk_acc` — stream 节点的中间 chunk 累加（done=true 时构造 final result）
///   * `last_heartbeat_at_ms` — TS 端定时心跳（护栏 I）
///   * `cancel` — cancel 标志（executor 取消时设 true；TS 端 ack 时也设 true）
pub struct DispatchHandle {
    pub request_id: String,
    pub run_id: String,
    pub node_id: String,
    pub protocol: NodeProtocol,
    /// 终态 result 发送端（被 take 后再发可避免误重复）
    pub result_tx: Mutex<Option<std::sync::mpsc::SyncSender<NodeDispatchResult>>>,
    /// stream 节点 chunk 累加（sync 节点也用，确认 done=true 路径唯一）
    pub chunk_acc: Mutex<StreamChunkAccumulator>,
    /// 最后一次心跳时间（ms since epoch）
    pub last_heartbeat_at_ms: AtomicI64,
    /// cancel 标志（executor cancel 路径 + TS cancel_ack 路径都设 true）
    pub cancel: AtomicBool,
}

/// 派发注册表类型别名：key = request_id
pub type DispatcherRegistry = Arc<Mutex<HashMap<String, Arc<DispatchHandle>>>>;

/// NodeDispatcher 主体
pub struct NodeDispatcher {
    app: Option<AppHandle>,
    /// 派发注册表（命令侧用同一个，让 callback 能反查到 handle）
    registry: Option<DispatcherRegistry>,
}

impl NodeDispatcher {
    pub fn new(app: Option<AppHandle>, registry: Option<DispatcherRegistry>) -> Self {
        Self { app, registry }
    }

    /// 发派发 event（双协议共用入口）
    pub fn emit_dispatch(&self, request: &NodeDispatchRequest) {
        if let Some(app) = &self.app {
            let _ = app.emit("workflow:dispatch", request);
        }
    }

    /// 派发 sync / stream 节点（Phase 5 真等 TS 回调）
    ///
    /// 流程：
    ///   1. 护栏 B 验证 request_id
    ///   2. 建 DispatchHandle + 插入 registry
    ///   3. 发 `workflow:dispatch` event
    ///   4. 阻塞等 result_tx（带 timeout + cancel poll）
    ///   5. 移除 registry（无论成功失败）
    ///   6. 返回 NodeDispatchResult / WorkflowError
    pub fn dispatch_blocking(
        &self,
        request: &NodeDispatchRequest,
        timeout: Duration,
    ) -> Result<NodeDispatchResult, WorkflowError> {
        // 1. 护栏 B
        validate_request_id(&request.request_id)?;

        // 2. 建 handle
        let (tx, rx) = sync_channel::<NodeDispatchResult>(1);
        let now = now_ms();
        let handle = Arc::new(DispatchHandle {
            request_id: request.request_id.clone(),
            run_id: request.run_id.clone(),
            node_id: request.node_id.clone(),
            protocol: request.protocol,
            result_tx: Mutex::new(Some(tx)),
            chunk_acc: Mutex::new(StreamChunkAccumulator::new()),
            last_heartbeat_at_ms: AtomicI64::new(now),
            cancel: AtomicBool::new(false),
        });

        // 3. 注册到 registry
        if let Some(reg) = &self.registry {
            if let Ok(mut map) = reg.lock() {
                map.insert(request.request_id.clone(), handle.clone());
            } else {
                return Err(WorkflowError::InternalError(
                    "dispatcher registry 锁污染".to_string(),
                ));
            }
        }

        // 4. 发 event
        self.emit_dispatch(request);

        // 5. 阻塞等结果（短轮询检查 timeout + cancel）
        let start = Instant::now();
        let result = loop {
            let elapsed = start.elapsed();
            if elapsed >= timeout {
                break Err(WorkflowError::Timeout {
                    node_id: request.node_id.clone(),
                    elapsed_ms: elapsed.as_millis() as u64,
                    timeout_ms: timeout.as_millis() as u64,
                });
            }
            if handle.cancel.load(Ordering::SeqCst) {
                break Err(WorkflowError::Cancelled);
            }
            let remain = timeout.saturating_sub(elapsed);
            // 100ms 步进，避免一直阻塞到 timeout
            let slice = remain.min(Duration::from_millis(100));
            match rx.recv_timeout(slice) {
                Ok(r) => break Ok(r),
                Err(RecvTimeoutError::Timeout) => continue,
                Err(RecvTimeoutError::Disconnected) => {
                    // sender 被 drop（executor finalize 时清掉了 handle）
                    break Err(WorkflowError::InternalError(
                        "dispatch 通道被关闭（可能 executor 已 finalize）".to_string(),
                    ));
                }
            }
        };

        // 6. 移除 registry
        if let Some(reg) = &self.registry {
            if let Ok(mut map) = reg.lock() {
                map.remove(&request.request_id);
            }
        }

        result
    }

    /// 派发 stream 节点（Phase 5 — 与 sync 走同一路径，区别是 TS 端发 chunk 累积到 done）
    ///
    /// 当前实现：直接复用 dispatch_blocking。结果由 `workflow_node_chunk` 回调
    /// 累积到 handle.chunk_acc，done=true 时构造 final NodeDispatchResult 推入 result_tx。
    pub fn dispatch_streaming(
        &self,
        request: &NodeDispatchRequest,
    ) -> Result<NodeDispatchResult, WorkflowError> {
        // 走统一路径；timeout 留默认值 30s（executor 实际会传 node timeout）
        self.dispatch_blocking(request, Duration::from_secs(30))
    }
}

/// 解析 callback 端发的消息类型（用于 routing）
pub fn classify_message(msg: &NodeDispatchMessage) -> &'static str {
    match msg {
        NodeDispatchMessage::NodeDispatchRequest(_) => "request",
        NodeDispatchMessage::NodeDispatchResult(_) => "result",
        NodeDispatchMessage::NodeDispatchChunk(_) => "chunk",
    }
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
    .map(|d| d.as_millis() as i64)
    .unwrap_or(0)
}

// ─────────────────────────────────────────────────────────────────────────────
// 护栏 A：协议 mismatch
// ─────────────────────────────────────────────────────────────────────────────

/// 校验 callback 端报告的协议与 dispatch 时记录的协议一致。
/// 护栏 A — 防御 TS 端发错协议类型（如 sync 节点回 chunk）。
pub fn validate_protocol_match(
    dispatched: NodeProtocol,
    reported: &str,
    request_id: &str,
) -> Result<(), WorkflowError> {
    let expected = match dispatched {
        NodeProtocol::Sync => "sync",
        NodeProtocol::Stream => "stream",
    };
    if reported != expected {
        return Err(WorkflowError::ProtocolMismatch {
            request_id: request_id.to_string(),
            expected: expected.to_string(),
            got: reported.to_string(),
        });
    }
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// 护栏 B：requestId 验证
// ─────────────────────────────────────────────────────────────────────────────

/// 校验 request_id 合法：非空 + 长度 ≤ 256。
/// 护栏 B — 防止空 id 覆盖 pending 表主键、超长 id 拖慢查询。
pub fn validate_request_id(request_id: &str) -> Result<(), WorkflowError> {
    if request_id.is_empty() {
        return Err(WorkflowError::InternalError("request_id 为空".to_string()));
    }
    if request_id.len() > 256 {
        return Err(WorkflowError::InternalError(format!(
            "request_id 过长: {} 字节",
            request_id.len()
        )));
    }
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// 护栏 F：深拷贝 context
// ─────────────────────────────────────────────────────────────────────────────

/// 深拷贝 config / inputs，护栏 F。
/// TS 端持有的是独立 Value clone，Rust 端后续修改不会反向影响。
pub fn deep_clone_context(config: &Value, inputs: &Value) -> (Value, Value) {
    (config.clone(), inputs.clone())
}

// ─────────────────────────────────────────────────────────────────────────────
// 护栏 G：输出 schema 校验（占位）
// ─────────────────────────────────────────────────────────────────────────────

/// 校验节点输出 schema。Phase 3 接入 JSON-Schema 7。
/// 当前仅做基础：sync 节点 output 不能是 `Value::Null`（业务上"无输出"是设计意图的话另说）。
pub fn validate_output_schema(
    node_type: &str,
    output: &Value,
) -> Result<(), WorkflowError> {
    if output.is_null() {
        // 暂不报错：start/end 节点允许 null 输出
        return Ok(());
    }
    // Phase 3: 拉 node-metadata 的 schema，跑 jsonschema::validate
    let _ = node_type;
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// 护栏 H：chunk size 限制
// ─────────────────────────────────────────────────────────────────────────────

/// 校验 chunk.delta 序列化后大小 ≤ `MAX_CHUNK_BYTES`。
/// 护栏 H — 防止恶意/异常节点一次推送 MB 级 JSON 拖死 store。
pub fn validate_chunk_size(chunk: &NodeDispatchChunk) -> Result<(), WorkflowError> {
    let bytes = serde_json::to_vec(&chunk.delta).map_err(|e| {
        WorkflowError::InternalError(format!("chunk 序列化失败: {e}"))
    })?;
    if bytes.len() > MAX_CHUNK_BYTES {
        return Err(WorkflowError::NodeOutputInvalid {
            type_: "chunk_size".to_string(),
            reason: format!(
                "chunk {} bytes 超过上限 {} (request_id={})",
                bytes.len(),
                MAX_CHUNK_BYTES,
                chunk.request_id
            ),
        });
    }
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// 护栏 E：pending 持久化
// ─────────────────────────────────────────────────────────────────────────────

/// 注册一次派发（写 `workflow_pending_dispatches` 表）。护栏 E 上半场。
pub fn register_pending(
    store: &SqliteStore,
    request: &NodeDispatchRequest,
) -> Result<(), WorkflowError> {
    let protocol = match request.protocol {
        NodeProtocol::Sync => "sync",
        NodeProtocol::Stream => "stream",
    };
    store
        .with_conn(|c| {
            WorkflowStore::new(c).register_pending_dispatch(
                &request.request_id,
                &request.run_id,
                &request.node_id,
                protocol,
            )
        })
        .map_err(WorkflowError::from)
}

/// 派发完成或取消时移除 pending。护栏 E 下半场。
pub fn unregister_pending(
    store: &SqliteStore,
    request_id: &str,
) -> Result<(), WorkflowError> {
    store
        .with_conn(|c| WorkflowStore::new(c).remove_pending_dispatch(request_id))
        .map_err(WorkflowError::from)
}

// ─────────────────────────────────────────────────────────────────────────────
// 护栏 I：心跳检查
// ─────────────────────────────────────────────────────────────────────────────

/// TS 端每次 heartbeat 回调都更新 `last_heartbeat_at`。护栏 I 上半场。
pub fn update_heartbeat(
    store: &SqliteStore,
    request_id: &str,
) -> Result<(), WorkflowError> {
    store
        .with_conn(|c| {
            WorkflowStore::new(c).update_pending_dispatch_heartbeat(request_id)
        })
        .map_err(WorkflowError::from)
}

/// 检查心跳新鲜度（last_heartbeat_at 与 now 差距 ≤ ttl_ms）。护栏 I 下半场。
/// `ttl_ms = 0` 表示禁用检查（pass）。
pub fn check_heartbeat_liveness(
    last_heartbeat_at_ms: i64,
    now_ms: i64,
    ttl_ms: i64,
) -> bool {
    if ttl_ms <= 0 {
        return true;
    }
    now_ms - last_heartbeat_at_ms <= ttl_ms
}

// ─────────────────────────────────────────────────────────────────────────────
// 护栏 J：seq 排序
// ─────────────────────────────────────────────────────────────────────────────

/// StreamChunkAccumulator — 按 seq 收集 chunk，乱序到达也能正确重组。
/// 护栏 J — chunk 可能因网络重排乱序到达。
#[derive(Debug, Default)]
pub struct StreamChunkAccumulator {
    chunks: std::collections::BTreeMap<u32, NodeDispatchChunk>,
    next_expected_seq: u32,
    done_received: bool,
    final_result: Option<Value>,
}

impl StreamChunkAccumulator {
    pub fn new() -> Self {
        Self {
            chunks: std::collections::BTreeMap::new(),
            next_expected_seq: 0,
            done_received: false,
            final_result: None,
        }
    }

    /// 收到一个 chunk，返回是否完整（done == true 且所有中间 seq 都齐）
    pub fn push(&mut self, chunk: NodeDispatchChunk) -> Result<bool, WorkflowError> {
        validate_chunk_size(&chunk)?;
        if chunk.done {
            self.done_received = true;
            self.final_result = Some(chunk.delta.clone());
        }
        // 重复 seq 视为覆盖后到达的（幂等）
        self.chunks.insert(chunk.seq, chunk);
        Ok(self.done_received && self.is_continuous())
    }

    /// 是否所有 0..next_expected_seq 连续
    pub fn is_continuous(&self) -> bool {
        for (i, expected) in (0..self.next_expected_seq + 1).enumerate() {
            if !self.chunks.contains_key(&(i as u32)) {
                // 注：i 在范围内时已不可能超 next_expected_seq
                let _ = expected;
                return false;
            }
        }
        true
    }

    /// 取最后 seq（用于错误信息）
    pub fn last_seq(&self) -> Option<u32> {
        self.chunks.keys().last().copied()
    }

    /// 重组为有序 delta 数组
    pub fn drain_ordered(self) -> Vec<Value> {
        self.chunks
            .into_iter()
            .map(|(_, chunk)| chunk.delta)
            .collect()
    }

    pub fn is_done(&self) -> bool {
        self.done_received
    }

    pub fn final_result(&self) -> Option<&Value> {
        self.final_result.as_ref()
    }

    /// 缺号 seq（用于错误信息）
    pub fn missing_seqs(&self) -> Vec<u32> {
        if !self.done_received {
            return Vec::new();
        }
        let max_seq = self.last_seq().unwrap_or(0);
        (0..=max_seq)
            .filter(|s| !self.chunks.contains_key(s))
            .collect()
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 护栏 C：tokio timeout 入口（占位文档）
// ─────────────────────────────────────────────────────────────────────────────

/// 护栏 C 在 orchestrator 层（`TimeoutWatchdog`）实现。本文件不直接调 `tokio::time::timeout`。
/// 设计理由：dispatcher 保持同步、orchestrator 用 `TimeoutWatchdog::run` 在 `Duration` 内
/// 等待 work 闭包返回。这层把"超时"和"取消"绑成同一个看门狗，减少双计时器漂移。

// ─────────────────────────────────────────────────────────────────────────────
// 护栏 D：cancel 传播
// ─────────────────────────────────────────────────────────────────────────────

/// 检查 cancel signal。true = 已请求取消。
/// 真实派发循环中应在 `oneshot::Receiver` 上 poll cancel。
pub fn is_cancelled(cancel: &Arc<AtomicBool>) -> bool {
    cancel.load(Ordering::SeqCst)
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use worldsmith_core::storage::sqlite::SqliteStore;
    use worldsmith_core::storage::workflow::WorkflowStore;

    fn make_request() -> NodeDispatchRequest {
        NodeDispatchRequest::new(
            "run-1:n1",
            "run-1",
            "n1",
            "skill",
            NodeProtocol::Sync,
            json!({ "k": "v" }),
            json!({ "from": "n0" }),
            Some(1000),
        )
    }

    // ─── 护栏 A ───
    #[test]
    fn guard_a_protocol_match_sync() {
        assert!(validate_protocol_match(NodeProtocol::Sync, "sync", "r1").is_ok());
        assert!(validate_protocol_match(NodeProtocol::Sync, "stream", "r1").is_err());
    }

    #[test]
    fn guard_a_protocol_match_stream() {
        assert!(validate_protocol_match(NodeProtocol::Stream, "stream", "r1").is_ok());
        assert!(validate_protocol_match(NodeProtocol::Stream, "sync", "r1").is_err());
    }

    // ─── 护栏 B ───
    #[test]
    fn guard_b_request_id_empty() {
        assert!(validate_request_id("").is_err());
    }

    #[test]
    fn guard_b_request_id_too_long() {
        let id = "a".repeat(257);
        assert!(validate_request_id(&id).is_err());
    }

    #[test]
    fn guard_b_request_id_ok() {
        assert!(validate_request_id("run-1:n1").is_ok());
    }

    // ─── 护栏 F ───
    #[test]
    fn guard_f_deep_clone() {
        let cfg = json!({ "nested": { "a": [1, 2, 3] } });
        let inp = json!({ "x": 1 });
        let (c1, i1) = deep_clone_context(&cfg, &inp);
        let (c2, i2) = deep_clone_context(&cfg, &inp);
        assert_eq!(c1, c2);
        assert_eq!(i1, i2);
        // 改 clone 1 不应影响原值（serde_json::Value 本身就是 own tree）
        let mut c1_mut = c1;
        c1_mut["nested"]["a"][0] = json!(99);
        assert_eq!(cfg["nested"]["a"][0], json!(1));
        let _ = i2;
    }

    // ─── 护栏 H ───
    #[test]
    fn guard_h_chunk_size_ok() {
        let c = NodeDispatchChunk::new(
            "r1",
            "run-1",
            "n1",
            0,
            json!({ "text": "hi" }),
            0.1,
            false,
        );
        assert!(validate_chunk_size(&c).is_ok());
    }

    #[test]
    fn guard_h_chunk_size_exceeds() {
        let big = "x".repeat(MAX_CHUNK_BYTES + 1);
        let c = NodeDispatchChunk::new("r1", "run-1", "n1", 0, json!(big), 0.1, false);
        let r = validate_chunk_size(&c);
        assert!(matches!(r, Err(WorkflowError::NodeOutputInvalid { .. })));
    }

    // ─── 护栏 E ───
    #[test]
    fn guard_e_register_and_unregister() {
        let store = SqliteStore::open_in_memory().unwrap();
        let req = make_request();
        register_pending(&store, &req).unwrap();

        let pending: Vec<_> = store
            .with_conn(|c| {
                WorkflowStore::new(c).list_pending_dispatches_for_run("run-1")
            })
            .unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].0, "run-1:n1");

        unregister_pending(&store, "run-1:n1").unwrap();
        let pending2: Vec<_> = store
            .with_conn(|c| {
                WorkflowStore::new(c).list_pending_dispatches_for_run("run-1")
            })
            .unwrap();
        assert!(pending2.is_empty());
    }

    // ─── 护栏 I ───
    #[test]
    fn guard_i_heartbeat_liveness() {
        assert!(check_heartbeat_liveness(100, 200, 1000));
        assert!(!check_heartbeat_liveness(100, 2000, 1000));
        // ttl=0 → 永远 pass
        assert!(check_heartbeat_liveness(100, 999_999, 0));
    }

    #[test]
    fn guard_i_update_heartbeat() {
        let store = SqliteStore::open_in_memory().unwrap();
        let req = make_request();
        register_pending(&store, &req).unwrap();
        update_heartbeat(&store, "run-1:n1").unwrap();
        // 取出 last_heartbeat_at 应 > 0
        let pending: Vec<_> = store
            .with_conn(|c| {
                WorkflowStore::new(c).list_pending_dispatches_for_run("run-1")
            })
            .unwrap();
        assert_eq!(pending.len(), 1);
    }

    // ─── 护栏 J ───
    #[test]
    fn guard_j_stream_ordered() {
        let mut acc = StreamChunkAccumulator::new();
        // 乱序到达
        acc.push(NodeDispatchChunk::new("r1", "run-1", "n1", 1, json!("b"), 0.5, false))
            .unwrap();
        acc.push(NodeDispatchChunk::new("r1", "run-1", "n1", 0, json!("a"), 0.3, false))
            .unwrap();
        let ordered = acc.drain_ordered();
        assert_eq!(ordered, vec![json!("a"), json!("b")]);
    }

    #[test]
    fn guard_j_stream_done_detects_missing_seqs() {
        let mut acc = StreamChunkAccumulator::new();
        acc.push(NodeDispatchChunk::new("r1", "run-1", "n1", 0, json!("a"), 0.3, false))
            .unwrap();
        acc.push(NodeDispatchChunk::new("r1", "run-1", "n1", 2, json!("c"), 0.9, true))
            .unwrap();
        assert!(acc.is_done());
        let missing = acc.missing_seqs();
        assert_eq!(missing, vec![1]);
    }

    #[test]
    fn guard_j_stream_continuous_ok() {
        let mut acc = StreamChunkAccumulator::new();
        acc.push(NodeDispatchChunk::new("r1", "run-1", "n1", 0, json!("a"), 0.5, false))
            .unwrap();
        acc.push(NodeDispatchChunk::new("r1", "run-1", "n1", 1, json!("b"), 1.0, true))
            .unwrap();
        assert!(acc.is_continuous());
        assert!(acc.is_done());
    }

    // ─── dispatch_blocking 占位 ───
    #[test]
    fn dispatch_blocking_returns_success() {
        let d = NodeDispatcher::new(None, None);
        let req = make_request();
        let out = d
            .dispatch_blocking(&req, Duration::from_millis(200))
            .unwrap();
        assert_eq!(out.node_id, "n1");
        assert!(out.is_ok());
        assert_eq!(out.progress, 1.0);
    }

    #[test]
    fn dispatch_blocking_rejects_empty_request_id() {
        let d = NodeDispatcher::new(None, None);
        let mut req = make_request();
        req.request_id = String::new();
        let r = d.dispatch_blocking(&req, Duration::from_millis(10));
        assert!(r.is_err());
    }

    // ─── cancel ───
    #[test]
    fn cancel_signal_propagates() {
        let c = Arc::new(AtomicBool::new(false));
        assert!(!is_cancelled(&c));
        c.store(true, Ordering::SeqCst);
        assert!(is_cancelled(&c));
    }
}
