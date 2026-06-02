//! 工作流 Tauri 后端模块
//!
//! 包含 service / error / commands。Phase 2 还会引入 engine / executor / dispatch_protocol。
//!
//! 设计要点：
//!   * `WorkflowError` 通过 `serde(tag = "type")` 暴露给前端 → 业务层可按 variant 分类处理
//!   * `commands::*` 中的 `#[tauri::command]` 入口在 `service::register_commands` 集中导出
//!   * `service::WorkflowServiceState` 在 Task 1.6 引入，Task 1.5 仅占位

pub mod commands;
pub mod dispatch_protocol;
pub mod engine;
pub mod error;
pub mod executor;
pub mod node_meta;
pub mod service;

pub use error::WorkflowError;
