//! 节点回调命令
//!
//! Phase 2.4 之前是 no-op；Phase 5 端到端贯通：TS 端 execute 完节点后 invoke 这些 command，
//! 我们查 AppState.dispatcher_registry 找到对应 DispatchHandle，把结果 send 到 result_tx，
//! 让阻塞在 `dispatch_blocking` 里的 executor 立即拿到。
//!
//! 4 个 command：
//!   * `workflow_node_result`    — sync 节点终态（或 stream 节点 done=true 时直接收口）
//!   * `workflow_node_chunk`     — stream 节点中间 chunk（累加到 chunk_acc，done=true 时收口）
//!   * `workflow_node_heartbeat` — 心跳（更新 last_heartbeat_at_ms，护栏 I）
//!   * `workflow_node_cancel_ack`— TS 端确认 cancel（设 handle.cancel=true，dispatch_blocking 立即返 Cancelled）

use std::sync::atomic::Ordering;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;

use crate::workflow::commands::CommandResult;
use crate::workflow::dispatch_protocol::{NodeDispatchChunk, NodeDispatchResult};
use crate::workflow::error::WorkflowError;
use crate::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeResultPayload {
    pub request_id: String,
    pub output: Value,
    #[serde(default)]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeChunkPayload {
    pub request_id: String,
    pub seq: u32,
    pub delta: String,
    #[serde(default)]
    pub progress: Option<f32>,
    pub done: bool,
    #[serde(default)]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeHeartbeatPayload {
    pub request_id: String,
    /// 可选：心跳时上报部分输出（一般空）
    #[serde(default)]
    pub progress: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeCancelAckPayload {
    pub request_id: String,
    /// 可选：cancel 原因
    #[serde(default)]
    pub reason: Option<String>,
}

/// 终态回调：sync 节点直接收口；stream 节点若 done=true 同样收口
#[tauri::command]
pub async fn workflow_node_result(
    state: State<'_, AppState>,
    payload: NodeResultPayload,
) -> CommandResult<()> {
    let registry = state.dispatcher_registry.clone();
    let handle = {
        let mut map = registry
            .lock()
            .map_err(|e| WorkflowError::InternalError(format!("registry lock poisoned: {e}")))?;
        map.remove(&payload.request_id)
    };
    let Some(handle) = handle else {
        // 可能已经超时 / cancel / finalize 完 handle 已被清，幂等返回
        return Ok(());
    };
    let result = if let Some(err_msg) = payload.error.as_deref() {
        NodeDispatchResult::failure(
            &handle.request_id,
            &handle.run_id,
            &handle.node_id,
            err_msg,
            None,
        )
    } else {
        NodeDispatchResult::success(
            &handle.request_id,
            &handle.run_id,
            &handle.node_id,
            payload.output,
            None,
        )
    };
    if let Some(tx) = handle
        .result_tx
        .lock()
        .map_err(|e| WorkflowError::InternalError(format!("result_tx lock poisoned: {e}")))?
        .take()
    {
        // sender drop 后再 send 不会 panic，sync_channel bounded=1 立即返
        let _ = tx.send(result);
    }
    Ok(())
}

/// Stream 中间 chunk
#[tauri::command]
pub async fn workflow_node_chunk(
    state: State<'_, AppState>,
    payload: NodeChunkPayload,
) -> CommandResult<()> {
    let registry = state.dispatcher_registry.clone();
    let handle = {
        let map = registry
            .lock()
            .map_err(|e| WorkflowError::InternalError(format!("registry lock poisoned: {e}")))?;
        map.get(&payload.request_id).cloned()
    };
    let Some(handle) = handle else {
        return Ok(());
    };
    // 护栏 H：chunk 大小校验
    if payload.delta.len() > crate::workflow::executor::dispatcher::MAX_CHUNK_BYTES {
        return Err(WorkflowError::InternalError(format!(
            "chunk 超过 {} 字节（实际 {}）",
            crate::workflow::executor::dispatcher::MAX_CHUNK_BYTES,
            payload.delta.len()
        )));
    }
    // 累加
    let mut acc = handle
        .chunk_acc
        .lock()
        .map_err(|e| WorkflowError::InternalError(format!("chunk_acc lock poisoned: {e}")))?;
    // 错误信息约定：若 payload.error 有值，把它编码进 delta（Value::Object { __error__ }）
    let delta = match payload.error.as_deref() {
        Some(err) => serde_json::json!({ "__error__": err }),
        None => serde_json::Value::String(payload.delta),
    };
    let done_now = acc
        .push(NodeDispatchChunk::new(
            handle.request_id.clone(),
            handle.run_id.clone(),
            handle.node_id.clone(),
            payload.seq,
            delta,
            payload.progress.unwrap_or(0.0),
            payload.done,
        ))
        .map_err(WorkflowError::from)?;
    if !done_now {
        return Ok(());
    }
    // done=true 且 seq 连续：构造 final NodeDispatchResult
    // 错误检测：final_result 是 Object 且含 "__error__" key 视为失败
    let final_val = acc.final_result().cloned();
    let last_seq_u64 = acc.last_seq().map(|s| s as u64);
    let (output, error_msg) = match &final_val {
        Some(serde_json::Value::Object(map)) => match map
            .get("__error__")
            .and_then(|v| v.as_str().map(|s| s.to_string()))
        {
            Some(err) => (serde_json::Value::Null, Some(err)),
            None => (final_val.unwrap_or(serde_json::Value::Null), None),
        },
        Some(v) => (v.clone(), None),
        None => (serde_json::Value::Null, None),
    };
    let result = if let Some(err_msg) = error_msg.as_deref() {
        NodeDispatchResult::failure(
            &handle.request_id,
            &handle.run_id,
            &handle.node_id,
            err_msg,
            last_seq_u64,
        )
    } else {
        NodeDispatchResult::success(
            &handle.request_id,
            &handle.run_id,
            &handle.node_id,
            output,
            last_seq_u64,
        )
    };
    drop(acc);
    if let Some(tx) = handle
        .result_tx
        .lock()
        .map_err(|e| WorkflowError::InternalError(format!("result_tx lock poisoned: {e}")))?
        .take()
    {
        let _ = tx.send(result);
    }
    // 移除 registry（callback 端走完生命周期，dispatch_blocking 拿到 result 后再 remove 是幂等的）
    let mut map = registry
        .lock()
        .map_err(|e| WorkflowError::InternalError(format!("registry lock poisoned: {e}")))?;
    map.remove(&payload.request_id);
    Ok(())
}

/// 心跳：仅更新 last_heartbeat_at_ms（dispatcher watchdog / 调试用）
#[tauri::command]
pub async fn workflow_node_heartbeat(
    state: State<'_, AppState>,
    payload: NodeHeartbeatPayload,
) -> CommandResult<()> {
    let registry = state.dispatcher_registry.clone();
    let handle = {
        let map = registry
            .lock()
            .map_err(|e| WorkflowError::InternalError(format!("registry lock poisoned: {e}")))?;
        map.get(&payload.request_id).cloned()
    };
    let Some(handle) = handle else {
        return Ok(());
    };
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    handle
        .last_heartbeat_at_ms
        .store(now, Ordering::SeqCst);
    Ok(())
}

/// Cancel ack：TS 端确认 cancel 收到。设 handle.cancel=true 让 dispatch_blocking 立即返
#[tauri::command]
pub async fn workflow_node_cancel_ack(
    state: State<'_, AppState>,
    payload: NodeCancelAckPayload,
) -> CommandResult<()> {
    let registry = state.dispatcher_registry.clone();
    let handle = {
        let map = registry
            .lock()
            .map_err(|e| WorkflowError::InternalError(format!("registry lock poisoned: {e}")))?;
        map.get(&payload.request_id).cloned()
    };
    let Some(handle) = handle else {
        return Ok(());
    };
    handle.cancel.store(true, Ordering::SeqCst);
    Ok(())
}
