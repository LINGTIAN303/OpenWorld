//! 工作流运行相关命令
//!
//! - Task 1.5：占位返回；Task 2.1+ 接入 `WorkflowEngine`
//! - Task 2.6：`workflow_run` 调 `engine.start_executor` 真正 spawn executor
//!
//! 设计要点：
//!   * `workflow_run` 异步返回 run_id；executor 在后台线程跑
//!   * `workflow_run_sync` 同步等 run 结束（用于 Phase 2.6 端到端验证 + 调试）
//!   * 其它命令（status/cancel/list）从 engine + store 读
//!   * `AppState.wf_db_path` 用于 spawn 时开新 Sqlite 连接（避免跨线程锁）

use std::sync::Arc;
use tauri::{AppHandle, State};

use worldsmith_core::storage::sqlite::SqliteStore;
use worldsmith_core::storage::workflow::WorkflowStore;
use worldsmith_core::workflow::types::WorkflowDefinition;

use crate::workflow::commands::CommandResult;
use crate::workflow::engine::WorkflowEngine;
use crate::workflow::error::WorkflowError;

#[derive(serde::Serialize, Clone)]
pub struct RunStatusInfo {
    pub run_id: String,
    pub status: String,
    pub current_node_id: Option<String>,
}

/// AppState 公共访问 trait — 避免 commands 把 AppState 字段全 expose
pub trait WorkflowAppState {
    fn engine(&self) -> &Arc<WorkflowEngine>;
    fn store(&self) -> std::sync::MutexGuard<'_, SqliteStore>;
    fn db_path(&self) -> String;
    fn app_handle(&self) -> Option<AppHandle>;
}

/// 在 Tauri 里我们用 `crate::AppState`（src/lib.rs 定义）。这里给 helper
/// 拿到 `Arc<WorkflowEngine>` 和 `wf_db_path`，避免 commands 重复 boilerplate。
pub(crate) fn engine_from_state(state: &State<'_, crate::AppState>) -> Arc<WorkflowEngine> {
    Arc::clone(&state.wf_engine)
}

pub(crate) fn store_from_state<'a>(
    state: &'a State<'_, crate::AppState>,
) -> Result<std::sync::MutexGuard<'a, SqliteStore>, WorkflowError> {
    state
        .db
        .lock()
        .map_err(|e| WorkflowError::InternalError(format!("db lock poisoned: {e}")))
}

pub(crate) fn db_path_from_state(
    state: &State<'_, crate::AppState>,
) -> Result<String, WorkflowError> {
    state
        .wf_db_path
        .lock()
        .map_err(|e| WorkflowError::InternalError(format!("wf_db_path lock poisoned: {e}")))
        .map(|p| p.clone())
}

// ─────────────────────────────────────────────────────────────────────────────
// 真实命令
// ─────────────────────────────────────────────────────────────────────────────

/// 启动工作流（异步，返回 run_id）
#[tauri::command]
pub async fn workflow_run(
    state: State<'_, crate::AppState>,
    app: AppHandle,
    id: String,
    version: Option<u32>,
    params: serde_json::Value,
    triggered_by: String,
) -> CommandResult<String> {
    let engine = engine_from_state(&state);
    let store = store_from_state(&state)?;
    let db_path = db_path_from_state(&state)?;

    // 1. 取定义
    let def: WorkflowDefinition = store
        .with_conn(|c| {
            if let Some(v) = version {
                WorkflowStore::new(c).get_version(&id, v)
            } else {
                WorkflowStore::new(c).get(&id)
            }
        })
        .map_err(WorkflowError::from)?;

    // 2. spawn executor
    let run_id = engine.start_executor(
        &store,
        def,
        params,
        &triggered_by,
        move || match SqliteStore::open(&db_path) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[workflow_run] 重新打开 Sqlite 失败: {e}");
                // fallback：开一个内存 store（保证不 panic，但会丢部分 log）
                SqliteStore::open_in_memory().unwrap_or_else(|e2| {
                    panic!("Sqlite 内存也开不了: {e2}")
                })
            }
        },
        Some(app),
        state.dispatcher_registry.clone(),
    )?;
    Ok(run_id)
}

/// 启动并等结束（仅用于端到端验证 / 调试，不推荐生产用）
#[tauri::command]
pub async fn workflow_run_sync(
    state: State<'_, crate::AppState>,
    app: AppHandle,
    id: String,
    version: Option<u32>,
    params: serde_json::Value,
    triggered_by: String,
) -> CommandResult<serde_json::Value> {
    let engine = engine_from_state(&state);
    let run_id = workflow_run(state.clone(), app, id, version, params, triggered_by).await?;

    // 轮询 status 直到终态（每次重新取 store 锁，避免跨 await 持锁）
    let terminal_states = ["completed", "failed", "cancelled"];
    let max_wait_ms = 60_000u64;
    let started = std::time::Instant::now();
    loop {
        if started.elapsed().as_millis() as u64 > max_wait_ms {
            return Err(WorkflowError::InternalError(format!(
                "workflow_run_sync 超时 {max_wait_ms}ms (run_id={run_id})"
            )));
        }
        let status = {
            let store = store_from_state(&state)?;
            engine
                .get_status(&store, &run_id)
                .ok_or_else(|| WorkflowError::NotFound(format!("run {run_id}")))?
        };
        if terminal_states.contains(&status.status.as_str()) {
            return Ok(serde_json::to_value(&status).unwrap_or(serde_json::Value::Null));
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
}

#[tauri::command]
pub async fn workflow_pause(_run_id: String) -> CommandResult<()> {
    // Phase 3 接入；当前 no-op
    Ok(())
}

#[tauri::command]
pub async fn workflow_resume(
    _run_id: String,
    _decision: Option<serde_json::Value>,
) -> CommandResult<()> {
    Ok(())
}

/// 取消运行：设 cancel flag
#[tauri::command]
pub async fn workflow_cancel(
    state: State<'_, crate::AppState>,
    run_id: String,
) -> CommandResult<bool> {
    let engine = engine_from_state(&state);
    let cancelled = engine.request_cancel(&run_id)?;
    Ok(cancelled)
}

#[tauri::command]
pub async fn workflow_skip_to(_run_id: String, _target_node_id: String) -> CommandResult<()> {
    Ok(())
}

/// 取运行状态
#[tauri::command]
pub async fn workflow_status(
    state: State<'_, crate::AppState>,
    run_id: String,
) -> CommandResult<Option<RunStatusInfo>> {
    let engine = engine_from_state(&state);
    let store = store_from_state(&state)?;
    let status = engine
        .get_status(&store, &run_id)
        .map(|s| RunStatusInfo {
            run_id: s.run_id,
            status: s.status,
            current_node_id: s.current_node_id,
        });
    Ok(status)
}

/// 列运行记录
#[tauri::command]
pub async fn workflow_list_runs(
    state: State<'_, crate::AppState>,
    workflow_id: Option<String>,
    status: Option<String>,
    limit: Option<u32>,
) -> CommandResult<Vec<serde_json::Value>> {
    let store = store_from_state(&state)?;
    let runs = store
        .with_conn(|c| {
            WorkflowStore::new(c).list_runs(
                workflow_id.as_deref(),
                status.as_deref(),
                limit.unwrap_or(50),
            )
        })
        .map_err(WorkflowError::from)?;
    let json = runs
        .into_iter()
        .map(|r| serde_json::to_value(r).unwrap_or(serde_json::Value::Null))
        .collect();
    Ok(json)
}

/// 取单条 run
#[tauri::command]
pub async fn workflow_get_run(
    state: State<'_, crate::AppState>,
    run_id: String,
) -> CommandResult<serde_json::Value> {
    let store = store_from_state(&state)?;
    let run = store
        .with_conn(|c| WorkflowStore::new(c).get_run(&run_id))
        .map_err(WorkflowError::from)?;
    Ok(serde_json::to_value(run).unwrap_or(serde_json::Value::Null))
}
