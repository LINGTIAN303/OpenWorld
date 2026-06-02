//! 工作流服务：Tauri Command 注册入口
//!
//! Task 1.5：仅占位，所有命令返回 `not implemented` / 空值。
//! Task 1.6：引入 `WorkflowServiceState`（持有 `Arc<SqliteStore>`），把 definitions 命令真实 wire-up。
//! Task 2.x：注入 `WorkflowEngine` 替换 runs / dispatch 命令的占位。

use tauri::AppHandle;

/// 注册所有工作流相关 Tauri Command（Phase 1 占位）
///
/// 注意：当前实现是 no-op。所有 workflow 命令在 [`crate::workflow::commands`] 下已经
/// 用 `#[tauri::command]` 宏定义好，由 `src-tauri/src/lib.rs` 的 `tauri::generate_handler!`
/// 列表统一注册（避免双注册）。
#[allow(dead_code)]
pub fn register_commands(_app: &AppHandle) {
    // Phase 1: 无需注册逻辑；Phase 1.6 会在此 manage WorkflowServiceState
}
