//! 工作流定义相关命令（CRUD + export/import）
//!
//! Task 1.6：7 个命令全部接入 `WorkflowStore`，通过 `State<AppState>` 共享主 `SqliteStore`。
//!   * `workflow_list`   — 列表（category / keyword / limit 过滤）
//!   * `workflow_get`    — 取最新版本
//!   * `workflow_create` — 校验 + 保存（version 不自增，沿用 body 传入）
//!   * `workflow_update` — version 自增 + 校验 + 保存
//!   * `workflow_delete` — 业务层守护（有 runs 引用则拒绝）
//!   * `workflow_export` — YAML / JSON 序列化
//!   * `workflow_import` — 解析 + 校验 + 保存

use serde::Serialize;
use tauri::State;
use worldsmith_core::storage::workflow::WorkflowStore;
use worldsmith_core::workflow::parser::{parse_definition, serialize_definition, ParseFormat};
use worldsmith_core::workflow::types::WorkflowDefinition;
use worldsmith_core::workflow::validator::validate_definition;

use crate::workflow::commands::CommandResult;
use crate::workflow::error::WorkflowError;
use crate::AppState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowSummaryDto {
    pub id: String,
    pub latest_version: u32,
    pub name: String,
    pub category: String,
    pub description: Option<String>,
    pub updated_at: i64,
}

#[tauri::command]
pub async fn workflow_list(
    state: State<'_, AppState>,
    category: Option<String>,
    keyword: Option<String>,
    limit: Option<u32>,
) -> CommandResult<Vec<WorkflowSummaryDto>> {
    let category_ref = category.as_deref();
    let keyword_ref = keyword.as_deref();
    let limit = limit.unwrap_or(50);
    let summaries = state
        .db
        .lock()
        .map_err(|e| WorkflowError::StorageError(e.to_string()))?
        .with_conn(|c| WorkflowStore::new(c).list(category_ref, keyword_ref, limit))?;
    Ok(summaries
        .into_iter()
        .map(|s| WorkflowSummaryDto {
            id: s.id,
            latest_version: s.latest_version,
            name: s.name,
            category: s.category,
            description: s.description,
            updated_at: s.updated_at,
        })
        .collect())
}

#[tauri::command]
pub async fn workflow_get(
    state: State<'_, AppState>,
    id: String,
) -> CommandResult<serde_json::Value> {
    let def = state
        .db
        .lock()
        .map_err(|e| WorkflowError::StorageError(e.to_string()))?
        .with_conn(|c| WorkflowStore::new(c).get(&id))?;
    serde_json::to_value(def).map_err(|e| WorkflowError::InternalError(e.to_string()))
}

#[tauri::command]
pub async fn workflow_create(
    state: State<'_, AppState>,
    definition: serde_json::Value,
) -> CommandResult<serde_json::Value> {
    let def: WorkflowDefinition = serde_json::from_value(definition)
        .map_err(|e| WorkflowError::InvalidDefinition(format!("反序列化失败: {e}")))?;
    validate_definition(&def)
        .map_err(|e| WorkflowError::ValidationFailed(vec![e.to_string()]))?;
    state
        .db
        .lock()
        .map_err(|e| WorkflowError::StorageError(e.to_string()))?
        .with_conn(|c| WorkflowStore::new(c).save(&def))?;
    serde_json::to_value(def).map_err(|e| WorkflowError::InternalError(e.to_string()))
}

#[tauri::command]
pub async fn workflow_update(
    state: State<'_, AppState>,
    id: String,
    definition: serde_json::Value,
) -> CommandResult<serde_json::Value> {
    let mut def: WorkflowDefinition = serde_json::from_value(definition)
        .map_err(|e| WorkflowError::InvalidDefinition(format!("反序列化失败: {e}")))?;
    if def.id != id {
        return Err(WorkflowError::InvalidDefinition(format!(
            "id 不一致: path={id}, body={}",
            def.id
        )));
    }

    // 锁内取最新 version + 写库（一次锁内完成，避免并发自增冲突）
    let db = state
        .db
        .lock()
        .map_err(|e| WorkflowError::StorageError(e.to_string()))?;
    let next_version = db
        .with_conn(|c| WorkflowStore::new(c).list_versions(&id))?
        .first()
        .map(|v| v + 1)
        .unwrap_or(1);
    def.version = next_version;
    validate_definition(&def)
        .map_err(|e| WorkflowError::ValidationFailed(vec![e.to_string()]))?;
    db.with_conn(|c| WorkflowStore::new(c).save(&def))?;
    drop(db);
    serde_json::to_value(def).map_err(|e| WorkflowError::InternalError(e.to_string()))
}

#[tauri::command]
pub async fn workflow_delete(state: State<'_, AppState>, id: String) -> CommandResult<()> {
    state
        .db
        .lock()
        .map_err(|e| WorkflowError::StorageError(e.to_string()))?
        .with_conn(|c| WorkflowStore::new(c).delete(&id))?;
    Ok(())
}

#[tauri::command]
pub async fn workflow_export(
    state: State<'_, AppState>,
    id: String,
    format: String,
) -> CommandResult<String> {
    let def = state
        .db
        .lock()
        .map_err(|e| WorkflowError::StorageError(e.to_string()))?
        .with_conn(|c| WorkflowStore::new(c).get(&id))?;
    let fmt = match format.as_str() {
        "json" => ParseFormat::Json,
        "yaml" => ParseFormat::Yaml,
        _ => return Err(WorkflowError::InvalidDefinition(format!("未知格式: {format}"))),
    };
    serialize_definition(&def, fmt).map_err(Into::into)
}

#[tauri::command]
pub async fn workflow_import(
    state: State<'_, AppState>,
    source: String,
    format: Option<String>,
) -> CommandResult<serde_json::Value> {
    let fmt = match format.as_deref() {
        Some("json") => ParseFormat::Json,
        Some("yaml") => ParseFormat::Yaml,
        _ => ParseFormat::Auto,
    };
    let def = parse_definition(&source, fmt)?;
    validate_definition(&def)
        .map_err(|e| WorkflowError::ValidationFailed(vec![e.to_string()]))?;
    state
        .db
        .lock()
        .map_err(|e| WorkflowError::StorageError(e.to_string()))?
        .with_conn(|c| WorkflowStore::new(c).save(&def))?;
    serde_json::to_value(def).map_err(|e| WorkflowError::InternalError(e.to_string()))
}
