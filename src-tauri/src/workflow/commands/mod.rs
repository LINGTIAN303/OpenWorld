//! Tauri Command handlers
//!
//! 按职责拆 4 个子模块：
//!   * `definitions` — workflow 定义 CRUD + export/import（Task 1.6 接入 store）
//!   * `runs`        — workflow 运行控制（Task 2.x 接入 engine）
//!   * `dispatch`    — TS 节点回调（Task 2.4 接入 dispatcher）
//!   * `settings`    — 保留天数、purge 等（Task 1.5 占位，Task 4.4 接入设置面板）

pub mod definitions;
pub mod dispatch;
pub mod dry_run;
pub mod node_meta;
pub mod runs;
pub mod settings;

use crate::workflow::error::WorkflowError;

/// 统一命令返回类型
pub type CommandResult<T> = Result<T, WorkflowError>;
