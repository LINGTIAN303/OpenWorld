//! 工作流 dry-run（仅校验）
//!
//! Phase 4.4：拉定义 + 走 validator + 返回 errors 列表，不实际启动 executor。
//! 给 Agent 的 "工作流预演" 工具用：在用户运行前告诉他定义有没有问题。

use serde::Serialize;
use tauri::State;
use worldsmith_core::storage::workflow::WorkflowStore;
use worldsmith_core::workflow::validator::validate_definition;

use crate::workflow::commands::CommandResult;
use crate::workflow::error::WorkflowError;
use crate::AppState;

#[derive(Debug, Clone, Serialize)]
pub struct DryRunResult {
    pub ok: bool,
    pub errors: Vec<String>,
    pub workflow_id: String,
    pub version: u32,
    pub node_count: usize,
    pub edge_count: usize,
}

#[tauri::command]
pub async fn workflow_dry_run(
    state: State<'_, AppState>,
    id: String,
) -> CommandResult<DryRunResult> {
    let store = state
        .db
        .lock()
        .map_err(|e| WorkflowError::InternalError(format!("db lock poisoned: {e}")))?;

    // 1. 拉定义
    let def = store.with_conn(|c| WorkflowStore::new(c).get(&id)).map_err(WorkflowError::from)?;

    // 2. 校验
    let errors: Vec<String> = match validate_definition(&def) {
        Ok(()) => vec![],
        Err(e) => vec![e.to_string()],
    };

    Ok(DryRunResult {
        ok: errors.is_empty(),
        errors,
        workflow_id: def.id,
        version: def.version,
        node_count: def.nodes.len(),
        edge_count: def.edges.len(),
    })
}
