//! 节点元数据命令
//!
//! Phase 3.1：返回 14 个 builtin 节点的元数据 + configSchema 给前端。
//! - `workflow_list_node_types` — 全量列表（供 NodePalette 用）
//! - `workflow_get_node_schema` — 单个节点的 configSchema（供 NodeInspector 表单用）
//!
//! Phase 4.6：plugin 通过 `workflow_register_node_type` / `workflow_unregister_node_type`
//! 注入自己的节点类型到 `AppState.plugin_node_metas` 内存表。
//! `workflow_list_node_types` / `workflow_get_node_schema` 现在合并返回 builtin + plugin。

use std::collections::BTreeMap;
use tauri::State;

use crate::workflow::commands::CommandResult;
use crate::workflow::error::WorkflowError;
use crate::workflow::node_meta::{builtin_node_metadata, NodeCategory, NodeMetadata};
use crate::AppState;

/// Phase 4.6：plugin 端 register 调用时传的 payload（与 TS 端 `plugin_bridge.ts` 1:1 对齐）
#[derive(Debug, Clone, serde::Deserialize)]
pub struct RegisterNodeTypePayload {
    #[serde(rename = "type")]
    pub type_: String,
    pub plugin_id: String,
    pub label: String,
    pub category: String, // "builtin" | "plugin"
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
    pub description: String,
    #[serde(default)]
    pub config_schema: BTreeMap<String, crate::workflow::node_meta::NodeConfigFieldSchema>,
}

#[tauri::command]
pub async fn workflow_list_node_types(
    state: State<'_, AppState>,
) -> CommandResult<Vec<NodeMetadata>> {
    let mut list = builtin_node_metadata();
    if let Ok(map) = state.plugin_node_metas.lock() {
        list.extend(map.values().cloned());
    }
    Ok(list)
}

#[tauri::command]
pub async fn workflow_get_node_schema(
    state: State<'_, AppState>,
    type_: String,
) -> CommandResult<NodeMetadata> {
    // 优先查 plugin（plugin 可覆盖同名 builtin）
    if let Ok(map) = state.plugin_node_metas.lock() {
        if let Some(meta) = map.get(&type_) {
            return Ok(meta.clone());
        }
    }
    builtin_node_metadata()
        .into_iter()
        .find(|n| n.r#type == type_)
        .ok_or_else(|| WorkflowError::NotFound(format!("节点类型 {type_} 不存在")))
}

/// Phase 4.6：注册一个 plugin 节点类型。返回注册后的元数据。
#[tauri::command]
pub async fn workflow_register_node_type(
    state: State<'_, AppState>,
    payload: RegisterNodeTypePayload,
) -> CommandResult<NodeMetadata> {
    let category = if payload.category == "builtin" {
        NodeCategory::Builtin
    } else {
        NodeCategory::Plugin
    };
    let meta = NodeMetadata {
        r#type: payload.type_,
        category,
        label: payload.label,
        icon: payload.icon.unwrap_or_else(|| "puzzle".to_string()),
        color: payload.color.unwrap_or_else(|| "#64748b".to_string()),
        plugin_id: payload.plugin_id,
        description: payload.description,
        config_schema: payload.config_schema,
    };
    let mut map = state
        .plugin_node_metas
        .lock()
        .map_err(|e| WorkflowError::InternalError(format!("plugin_node_metas lock poisoned: {e}")))?;
    map.insert(meta.r#type.clone(), meta.clone());
    Ok(meta)
}

/// Phase 4.6：反注册一个 plugin 节点类型。返回是否成功删除。
#[tauri::command]
pub async fn workflow_unregister_node_type(
    state: State<'_, AppState>,
    type_: String,
) -> CommandResult<bool> {
    let mut map = state
        .plugin_node_metas
        .lock()
        .map_err(|e| WorkflowError::InternalError(format!("plugin_node_metas lock poisoned: {e}")))?;
    Ok(map.remove(&type_).is_some())
}
