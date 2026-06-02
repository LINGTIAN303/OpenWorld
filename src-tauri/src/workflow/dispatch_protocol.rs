//! 派发协议类型
//!
//! Rust ↔ TS 双向通信的统一消息格式。`v` 字段是协议版本号（目前固定 `1`），
//! 后续要换 schema 时 bump 到 `2` 并保留双版本解析。
//!
//! 三种消息：
//!   * `NodeDispatchRequest` — Rust → TS，请求执行节点
//!   * `NodeDispatchResult`  — TS → Rust，sync 节点最终结果
//!   * `NodeDispatchChunk`   — TS → Rust，stream 节点中间增量
//!
//! serde JSON 派生；所有字段 snake_case 跨语言一致。

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// 协议版本号。改 schema 时 bump 此值并加双版本兼容。
pub const PROTOCOL_VERSION: u32 = 1;

/// 协议层 envelope trait — 所有出/入站消息都带 `v` + `type`
pub trait ProtocolEnvelope {
    const MSG_TYPE: &'static str;
    fn v(&self) -> u32 {
        PROTOCOL_VERSION
    }
    fn msg_type(&self) -> &'static str {
        Self::MSG_TYPE
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// NodeProtocol — sync / stream 二选一
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeProtocol {
    /// 一次性：等整个结果返回
    Sync,
    /// 流式：边跑边推 chunk，最后一个 chunk 携带 `done: true`
    Stream,
}

// ─────────────────────────────────────────────────────────────────────────────
// NodeDispatchRequest — Rust → TS
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NodeDispatchRequest {
    /// 协议版本
    pub v: u32,
    /// 消息类型（恒为 `"node_dispatch_request"`）
    #[serde(rename = "type")]
    pub msg_type: String,
    /// 唯一请求 id（run_id + node_id + 序号）
    pub request_id: String,
    /// 工作流运行 id
    pub run_id: String,
    /// 节点定义 id
    pub node_id: String,
    /// 节点类型（start / skill / end / ...）
    #[serde(rename = "node_type")]
    pub node_type: String,
    /// 同步还是流式
    pub protocol: NodeProtocol,
    /// 节点静态 config（来自 WorkflowDefinition.nodes[i].config）
    pub config: Value,
    /// 来自上游节点的输出
    pub inputs: Value,
    /// 节点可选超时（ms）
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub timeout_ms: Option<u64>,
}

impl NodeDispatchRequest {
    pub fn new(
        request_id: impl Into<String>,
        run_id: impl Into<String>,
        node_id: impl Into<String>,
        node_type: impl Into<String>,
        protocol: NodeProtocol,
        config: Value,
        inputs: Value,
        timeout_ms: Option<u64>,
    ) -> Self {
        Self {
            v: PROTOCOL_VERSION,
            msg_type: "node_dispatch_request".to_string(),
            request_id: request_id.into(),
            run_id: run_id.into(),
            node_id: node_id.into(),
            node_type: node_type.into(),
            protocol,
            config,
            inputs,
            timeout_ms,
        }
    }
}

impl ProtocolEnvelope for NodeDispatchRequest {
    const MSG_TYPE: &'static str = "node_dispatch_request";
}

// ─────────────────────────────────────────────────────────────────────────────
// NodeDispatchResult — TS → Rust (sync 终态 / stream 终态)
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NodeDispatchResult {
    pub v: u32,
    #[serde(rename = "type")]
    pub msg_type: String,
    pub request_id: String,
    pub run_id: String,
    pub node_id: String,
    /// 最终输出
    pub output: Value,
    /// 错误信息（成功时 None）
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub error: Option<String>,
    /// 进度 0.0~1.0（终态通常为 1.0）
    pub progress: f32,
    /// 节点总耗时（ms，TS 端自己测）
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub elapsed_ms: Option<u64>,
}

impl NodeDispatchResult {
    pub fn success(
        request_id: impl Into<String>,
        run_id: impl Into<String>,
        node_id: impl Into<String>,
        output: Value,
        elapsed_ms: Option<u64>,
    ) -> Self {
        Self {
            v: PROTOCOL_VERSION,
            msg_type: "node_dispatch_result".to_string(),
            request_id: request_id.into(),
            run_id: run_id.into(),
            node_id: node_id.into(),
            output,
            error: None,
            progress: 1.0,
            elapsed_ms,
        }
    }

    pub fn failure(
        request_id: impl Into<String>,
        run_id: impl Into<String>,
        node_id: impl Into<String>,
        error: impl Into<String>,
        elapsed_ms: Option<u64>,
    ) -> Self {
        Self {
            v: PROTOCOL_VERSION,
            msg_type: "node_dispatch_result".to_string(),
            request_id: request_id.into(),
            run_id: run_id.into(),
            node_id: node_id.into(),
            output: Value::Null,
            error: Some(error.into()),
            progress: 0.0,
            elapsed_ms,
        }
    }

    pub fn is_ok(&self) -> bool {
        self.error.is_none()
    }
}

impl ProtocolEnvelope for NodeDispatchResult {
    const MSG_TYPE: &'static str = "node_dispatch_result";
}

// ─────────────────────────────────────────────────────────────────────────────
// NodeDispatchChunk — TS → Rust (stream 中间增量)
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NodeDispatchChunk {
    pub v: u32,
    #[serde(rename = "type")]
    pub msg_type: String,
    pub request_id: String,
    pub run_id: String,
    pub node_id: String,
    /// 单帧序号（0-based，TS 端递增；乱序到达也允许，receiver 排序）
    pub seq: u32,
    /// 增量 payload（必须可序列化）
    pub delta: Value,
    /// 累计进度 0.0~1.0
    pub progress: f32,
    /// 是否最后一帧（true 时 receiver 关闭流）
    pub done: bool,
}

impl NodeDispatchChunk {
    pub fn new(
        request_id: impl Into<String>,
        run_id: impl Into<String>,
        node_id: impl Into<String>,
        seq: u32,
        delta: Value,
        progress: f32,
        done: bool,
    ) -> Self {
        Self {
            v: PROTOCOL_VERSION,
            msg_type: "node_dispatch_chunk".to_string(),
            request_id: request_id.into(),
            run_id: run_id.into(),
            node_id: node_id.into(),
            seq,
            delta,
            progress,
            done,
        }
    }
}

impl ProtocolEnvelope for NodeDispatchChunk {
    const MSG_TYPE: &'static str = "node_dispatch_chunk";
}

// ─────────────────────────────────────────────────────────────────────────────
// NodeDispatchMessage — 通用 envelope（接收端用）
// ─────────────────────────────────────────────────────────────────────────────

/// 接收端用来分发到正确反序列化器的判别枚举。
/// 避免上游做大量 JSON 二次解析。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum NodeDispatchMessage {
    NodeDispatchRequest(NodeDispatchRequest),
    NodeDispatchResult(NodeDispatchResult),
    NodeDispatchChunk(NodeDispatchChunk),
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn request_roundtrip() {
        let req = NodeDispatchRequest::new(
            "r1",
            "run-1",
            "n2",
            "skill",
            NodeProtocol::Sync,
            json!({ "echo": "hi" }),
            json!({ "from_n1": "ok" }),
            Some(5000),
        );
        let s = serde_json::to_string(&req).unwrap();
        let de: NodeDispatchRequest = serde_json::from_str(&s).unwrap();
        assert_eq!(req, de);
        assert_eq!(req.v, 1);
        assert_eq!(req.msg_type, "node_dispatch_request");
    }

    #[test]
    fn result_success_roundtrip() {
        let r = NodeDispatchResult::success(
            "r1",
            "run-1",
            "n2",
            json!({ "out": 42 }),
            Some(123),
        );
        let s = serde_json::to_string(&r).unwrap();
        let de: NodeDispatchResult = serde_json::from_str(&s).unwrap();
        assert_eq!(r, de);
        assert!(r.is_ok());
        assert!(de.error.is_none());
    }

    #[test]
    fn result_failure_carries_error() {
        let r = NodeDispatchResult::failure("r2", "run-1", "n3", "boom", Some(10));
        assert!(!r.is_ok());
        let s = serde_json::to_string(&r).unwrap();
        let de: NodeDispatchResult = serde_json::from_str(&s).unwrap();
        assert_eq!(de.error.as_deref(), Some("boom"));
    }

    #[test]
    fn chunk_roundtrip() {
        let c = NodeDispatchChunk::new(
            "r1",
            "run-1",
            "n2",
            7,
            json!({ "text": "hello" }),
            0.5,
            false,
        );
        let s = serde_json::to_string(&c).unwrap();
        let de: NodeDispatchChunk = serde_json::from_str(&s).unwrap();
        assert_eq!(c, de);
        assert_eq!(de.seq, 7);
    }

    #[test]
    fn chunk_done_flag() {
        let c = NodeDispatchChunk::new("r1", "run-1", "n2", 99, Value::Null, 1.0, true);
        assert!(c.done);
        assert_eq!(c.progress, 1.0);
    }

    #[test]
    fn message_dispatches_by_type_tag() {
        let req = NodeDispatchRequest::new(
            "r1",
            "run-1",
            "n2",
            "skill",
            NodeProtocol::Stream,
            json!({}),
            json!({}),
            None,
        );
        let s = serde_json::to_string(&req).unwrap();
        let msg: NodeDispatchMessage = serde_json::from_str(&s).unwrap();
        match msg {
            NodeDispatchMessage::NodeDispatchRequest(r) => {
                assert_eq!(r.request_id, "r1");
                assert_eq!(r.protocol, NodeProtocol::Stream);
            }
            _ => panic!("expected NodeDispatchRequest"),
        }
    }

    #[test]
    fn protocol_version_constant() {
        assert_eq!(PROTOCOL_VERSION, 1);
        assert_eq!(NodeDispatchRequest::MSG_TYPE, "node_dispatch_request");
        assert_eq!(NodeDispatchResult::MSG_TYPE, "node_dispatch_result");
        assert_eq!(NodeDispatchChunk::MSG_TYPE, "node_dispatch_chunk");
    }

    #[test]
    fn unknown_field_ignored_for_forward_compat() {
        // 多余字段应被忽略（`serde` 默认行为是 allow unknown）
        let s = r#"{
            "v": 1,
            "type": "node_dispatch_request",
            "request_id": "r1",
            "run_id": "run-1",
            "node_id": "n1",
            "node_type": "skill",
            "protocol": "sync",
            "config": {},
            "inputs": {},
            "future_field": "ignored"
        }"#;
        let r: NodeDispatchRequest = serde_json::from_str(s).unwrap();
        assert_eq!(r.request_id, "r1");
    }

    #[test]
    fn request_omits_none_timeout() {
        let req = NodeDispatchRequest::new(
            "r1",
            "run-1",
            "n1",
            "start",
            NodeProtocol::Sync,
            json!({}),
            json!({}),
            None,
        );
        let s = serde_json::to_string(&req).unwrap();
        assert!(!s.contains("timeout_ms"));
    }
}
