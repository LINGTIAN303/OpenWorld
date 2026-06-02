//! 工作流 Tauri Command 统一错误类型
//!
//! `serde(tag = "type")` 让前端可以按 `err.type === "validation_failed"` 这类 discriminator 处理。
//! `From<CoreError>` 桥接 `worldsmith-core` 的错误体系。

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WorkflowError {
    #[error("未找到: {0}")]
    NotFound(String),

    #[error("无效定义: {0}")]
    InvalidDefinition(String),

    #[error("校验失败: {0:?}")]
    ValidationFailed(Vec<String>),

    #[error("已在运行: {0}")]
    AlreadyRunning(String),

    #[error("未在运行: {0}")]
    NotRunning(String),

    #[error("已取消")]
    Cancelled,

    #[error("节点 {node_id} 执行超时: 等待 {elapsed_ms}ms, 超过 {timeout_ms}ms")]
    Timeout {
        node_id: String,
        elapsed_ms: u64,
        timeout_ms: u64,
    },

    #[error("协议不匹配: request_id={request_id}, expected={expected}, got={got}")]
    ProtocolMismatch {
        request_id: String,
        expected: String,
        got: String,
    },

    #[error("节点输出无效: {type_}: {reason}")]
    NodeOutputInvalid { type_: String, reason: String },

    #[error("存储错误: {0}")]
    StorageError(String),

    #[error("内部错误: {0}")]
    InternalError(String),
}

impl From<worldsmith_core::error::CoreError> for WorkflowError {
    fn from(err: worldsmith_core::error::CoreError) -> Self {
        match err {
            worldsmith_core::error::CoreError::NotFound(s) => WorkflowError::NotFound(s),
            worldsmith_core::error::CoreError::InvalidArgument(s) => {
                WorkflowError::InvalidDefinition(s)
            }
            other => WorkflowError::StorageError(other.to_string()),
        }
    }
}
