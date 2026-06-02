use std::sync::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::io::{BufRead, BufReader, Write};
use tauri::Emitter;

use serde::{Deserialize, Serialize};
use tauri::State;
use worldsmith_core::error::CoreError;
use worldsmith_core::models::entity::Entity;
use worldsmith_core::models::pack::WorldSmithPack;
use worldsmith_core::models::relation::Relation;
use worldsmith_core::models::plugin::{PluginManifest, validate_manifest};
use worldsmith_core::storage::sqlite::SqliteStore;
use worldsmith_core::validate::entity::{validate_entity, ValidationReport};
use worldsmith_core::validate::pack::validate_pack;
use worldsmith_core::validate::reference::check_references_report;
use worldsmith_core::migrate::engine::migrate_pack;
use worldsmith_core::doctor::diagnostics::run_diagnostics;
use worldsmith_core::doctor::storage::check_storage_health;
use worldsmith_core::doctor::plugin::check_plugin_health;
use worldsmith_core::retrofit::RetrofitEngine;
use worldsmith_core::retrofit::catalog::CapabilityCatalog;
use worldsmith_core::retrofit::executor::ConflictReport;
use worldsmith_core::retrofit::guard::SafetyReport;
use worldsmith_core::retrofit::intent::RetrofitIntent;
use worldsmith_core::retrofit::session::SessionPhase;
use worldsmith_core::retrofit::{ConfirmResult, ApplyResult};
use worldsmith_core::retrofit::patch::{JsonPatch, JsonPatchDiff};
use worldsmith_core::algo::spatial::rtree::{SpatialIndex, SpatialItem, PointItem};
use worldsmith_core::algo::geometry::line::{Point2D, Segment2D, find_all_intersections};
use worldsmith_core::algo::geometry::polygon::{Polygon2D, point_in_polygon, convex_hull, chaikin_smooth, find_shared_edges, find_line_polygon_intersections, polygon_split, polygon_augment};
use worldsmith_core::algo::geometry::bbox::{AABB2D, OBB2D};
use worldsmith_core::algo::graph::pathfind::{WeightedGraph, dijkstra, dijkstra_path, astar, k_shortest_paths};
use worldsmith_core::algo::graph::topology::{topological_sort, connected_components, tarjan_scc, find_dangling_references};
use worldsmith_core::algo::graph::layout::{force_directed_layout, ForceLayoutConfig};
use worldsmith_core::algo::collab::crdt::{LWWRegister, ORSet, RGA, VectorClock};
use worldsmith_core::algo::terrain::terrain::{NoiseConfig, HeightMap, value_noise_2d, marching_squares};
use worldsmith_core::algo::draft::constraint::ConstraintSystem;
use worldsmith_core::algo::draft::dxf_io;
use worldsmith_core::algo::geometry::boolean;
use worldsmith_core::algo::graph::community;
use worldsmith_core::algo::terrain::erosion;

pub mod workflow;

struct AppState {
    db: Mutex<SqliteStore>,
    retrofit: Mutex<RetrofitEngine>,
    spatial: Mutex<SpatialIndex>,
    schema: Mutex<worldsmith_core::schema::SchemaRegistry>,
    mcp_processes: Mutex<std::collections::HashMap<String, std::process::Child>>,
    pty_processes: Mutex<std::collections::HashMap<String, PtyProcess>>,
    /// 工作流引擎单例（Phase 2.1+）
    wf_engine: std::sync::Arc<crate::workflow::engine::WorkflowEngine>,
    /// 工作流 Sqlite 数据库路径（spawn executor 时用于开新连接）
    wf_db_path: std::sync::Mutex<String>,
    plugin_node_metas: std::sync::Mutex<std::collections::HashMap<String, crate::workflow::node_meta::NodeMetadata>>,
    dispatcher_registry: std::sync::Arc<std::sync::Mutex<std::collections::HashMap<String, std::sync::Arc<crate::workflow::executor::DispatchHandle>>>>,
}

struct PtyProcess {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn std::io::Write + Send>,
    _child: Box<dyn portable_pty::Child + Send + Sync>,
    kill_tx: std::sync::Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
}

#[tauri::command]
fn cmd_init_db(state: State<AppState>, path: String) -> Result<(), CoreError> {
    let store = SqliteStore::open(&path)?;
    *state.db.lock().map_err(|e| CoreError::Lock(e.to_string()))? = store;
    Ok(())
}

#[tauri::command]
fn cmd_put_entity(state: State<AppState>, entity_json: String) -> Result<(), CoreError> {
    let entity: Entity = serde_json::from_str(&entity_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let db = state.db.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    db.put_entity(&entity)?;
    Ok(())
}

#[tauri::command]
fn cmd_get_entity(state: State<AppState>, id: String) -> Result<Option<Entity>, CoreError> {
    let db = state.db.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    db.get_entity(&id).map_err(|e| CoreError::storage(e.to_string()))
}

#[tauri::command]
fn cmd_get_all_entities(state: State<AppState>) -> Result<Vec<Entity>, CoreError> {
    let db = state.db.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    db.get_all_entities().map_err(|e| CoreError::storage(e.to_string()))
}

#[tauri::command]
fn cmd_get_entities_by_type(state: State<AppState>, entity_type: String) -> Result<Vec<Entity>, CoreError> {
    let db = state.db.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    db.get_entities_by_type(&entity_type).map_err(|e| CoreError::storage(e.to_string()))
}

#[tauri::command]
fn cmd_update_entity(state: State<AppState>, id: String, changes_json: String) -> Result<bool, CoreError> {
    let changes: serde_json::Value = serde_json::from_str(&changes_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let db = state.db.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    db.update_entity(&id, &changes).map_err(|e| CoreError::storage(e.to_string()))
}

#[tauri::command]
fn cmd_delete_entity(state: State<AppState>, id: String) -> Result<bool, CoreError> {
    let db = state.db.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    db.delete_entity(&id).map_err(|e| CoreError::storage(e.to_string()))
}

#[tauri::command]
fn cmd_count_entities_by_type(state: State<AppState>) -> Result<Vec<(String, usize)>, CoreError> {
    let db = state.db.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    db.count_entities_by_type().map_err(|e| CoreError::storage(e.to_string()))
}

#[tauri::command]
fn cmd_put_relation(state: State<AppState>, relation_json: String) -> Result<(), CoreError> {
    let relation: Relation = serde_json::from_str(&relation_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let db = state.db.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    db.put_relation(&relation)?;
    Ok(())
}

#[tauri::command]
fn cmd_get_all_relations(state: State<AppState>) -> Result<Vec<Relation>, CoreError> {
    let db = state.db.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    db.get_all_relations().map_err(|e| CoreError::storage(e.to_string()))
}

#[tauri::command]
fn cmd_get_relations_by_entity(state: State<AppState>, entity_id: String) -> Result<Vec<Relation>, CoreError> {
    let db = state.db.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    db.get_relations_by_entity(&entity_id).map_err(|e| CoreError::storage(e.to_string()))
}

#[tauri::command]
fn cmd_delete_relation(state: State<AppState>, id: String) -> Result<bool, CoreError> {
    let db = state.db.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    db.delete_relation(&id).map_err(|e| CoreError::storage(e.to_string()))
}

#[tauri::command]
fn cmd_delete_relations_by_entity(state: State<AppState>, entity_id: String) -> Result<usize, CoreError> {
    let db = state.db.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    db.delete_relations_by_entity(&entity_id).map_err(|e| CoreError::storage(e.to_string()))
}

#[tauri::command]
fn cmd_import_entities(state: State<AppState>, entities_json: String) -> Result<usize, CoreError> {
    let entities: Vec<Entity> = serde_json::from_str(&entities_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let db = state.db.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    db.import_entities(&entities).map_err(|e| CoreError::storage(e.to_string()))
}

#[tauri::command]
fn cmd_import_relations(state: State<AppState>, relations_json: String) -> Result<usize, CoreError> {
    let relations: Vec<Relation> = serde_json::from_str(&relations_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let db = state.db.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    db.import_relations(&relations).map_err(|e| CoreError::storage(e.to_string()))
}

#[tauri::command]
fn cmd_update_relation(state: State<AppState>, id: String, changes_json: String) -> Result<bool, CoreError> {
    let changes: serde_json::Value = serde_json::from_str(&changes_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let db = state.db.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    db.update_relation(&id, &changes).map_err(|e| CoreError::storage(e.to_string()))
}

#[tauri::command]
fn cmd_clear_entities(state: State<AppState>) -> Result<(), CoreError> {
    let db = state.db.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    db.clear_entities().map_err(|e| CoreError::storage(e.to_string()))
}

#[tauri::command]
fn cmd_clear_relations(state: State<AppState>) -> Result<(), CoreError> {
    let db = state.db.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    db.clear_relations().map_err(|e| CoreError::storage(e.to_string()))
}

#[tauri::command]
fn cmd_kv_get(state: State<AppState>, key: String) -> Result<Option<String>, CoreError> {
    let db = state.db.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    db.kv_get(&key).map_err(|e| CoreError::storage(e.to_string()))
}

#[tauri::command]
fn cmd_kv_set(state: State<AppState>, key: String, value: String) -> Result<(), CoreError> {
    let db = state.db.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    db.kv_set(&key, &value).map_err(|e| CoreError::storage(e.to_string()))
}

#[tauri::command]
fn cmd_kv_get_all(state: State<AppState>) -> Result<Vec<(String, String)>, CoreError> {
    let db = state.db.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    db.kv_get_all().map_err(|e| CoreError::storage(e.to_string()))
}

#[tauri::command]
fn cmd_validate_entity(
    entity_json: String,
    schema_json: Option<String>,
) -> Result<ValidationReport, CoreError> {
    let entity: Entity = serde_json::from_str(&entity_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let schema = schema_json
        .as_deref()
        .and_then(|s| serde_json::from_str::<worldsmith_core::models::entity::EntityTypeSchema>(s).ok());
    Ok(validate_entity(&entity, schema.as_ref()))
}

#[tauri::command]
fn cmd_validate_entities(
    entities_json: String,
    schemas_json: Option<String>,
) -> Result<ValidationReport, CoreError> {
    let entities: Vec<Entity> = serde_json::from_str(&entities_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let schemas: Vec<worldsmith_core::models::entity::EntityTypeSchema> = schemas_json
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();
    let schema_map: std::collections::HashMap<String, worldsmith_core::models::entity::EntityTypeSchema> = schemas
        .iter()
        .map(|s| (s.type_name.clone(), s.clone()))
        .collect();
    let mut combined = ValidationReport::new();
    for entity in &entities {
        let schema = schema_map.get(&entity.entity_type);
        let report = validate_entity(entity, schema);
        combined.errors.extend(report.errors);
        if !report.valid {
            combined.valid = false;
        }
    }
    Ok(combined)
}

#[tauri::command]
fn cmd_validate_pack(pack_json: String) -> Result<ValidationReport, CoreError> {
    let pack: WorldSmithPack = serde_json::from_str(&pack_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    Ok(validate_pack(&pack))
}

#[tauri::command]
fn cmd_check_references(
    entities_json: String,
    relations_json: String,
) -> Result<ValidationReport, CoreError> {
    let entities: Vec<Entity> = serde_json::from_str(&entities_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let relations: Vec<Relation> = serde_json::from_str(&relations_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    Ok(check_references_report(&entities, &relations))
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MigrateOutput {
    result: worldsmith_core::migrate::engine::MigrationResult,
    data: serde_json::Value,
}

#[tauri::command]
fn cmd_migrate(pack_json: String, from_version: u32) -> Result<MigrateOutput, CoreError> {
    let mut pack_data: serde_json::Value = serde_json::from_str(&pack_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let result = migrate_pack(&mut pack_data, from_version);
    Ok(MigrateOutput { result, data: pack_data })
}

#[tauri::command]
fn cmd_run_diagnostics(
    entities_json: String,
    relations_json: String,
    schemas_json: Option<String>,
) -> Result<worldsmith_core::doctor::diagnostics::DiagnosticSummary, CoreError> {
    let entities: Vec<Entity> = serde_json::from_str(&entities_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let relations: Vec<Relation> = serde_json::from_str(&relations_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let schemas: Vec<worldsmith_core::models::entity::EntityTypeSchema> = schemas_json
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();
    Ok(run_diagnostics(&entities, &relations, Some(&schemas)))
}

#[tauri::command]
fn cmd_check_storage_health(state: State<AppState>) -> Result<worldsmith_core::doctor::storage::StorageHealthReport, CoreError> {
    let db = state.db.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    Ok(check_storage_health(&*db))
}

#[tauri::command]
fn cmd_validate_plugin_manifest(manifest_json: String) -> Result<worldsmith_core::models::plugin::ManifestValidationResult, CoreError> {
    let manifest: PluginManifest = serde_json::from_str(&manifest_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    Ok(validate_manifest(&manifest))
}

#[tauri::command]
fn cmd_check_plugin_health(
    manifests_json: String,
    active_ids_json: String,
) -> Result<worldsmith_core::doctor::plugin::PluginHealthReport, CoreError> {
    let manifests: Vec<PluginManifest> = serde_json::from_str(&manifests_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let active_ids: Vec<String> = serde_json::from_str(&active_ids_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    Ok(check_plugin_health(&manifests, &active_ids))
}

#[tauri::command]
fn cmd_retrofit_begin_session(
    state: State<AppState>,
    session_id: String,
    catalog_json: Option<String>,
) -> Result<(), CoreError> {
    let catalog = catalog_json
        .as_deref()
        .and_then(|s| serde_json::from_str::<CapabilityCatalog>(s).ok())
        .unwrap_or_else(CapabilityCatalog::permissive);
    let mut engine = state.retrofit.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    engine.begin_session(&session_id, catalog)?;
    Ok(())
}

#[tauri::command]
fn cmd_retrofit_submit_intent(
    state: State<AppState>,
    intent_json: String,
) -> Result<SafetyReport, CoreError> {
    let intent: RetrofitIntent = serde_json::from_str(&intent_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let mut engine = state.retrofit.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    engine.submit_intent(intent)
}

#[tauri::command]
fn cmd_retrofit_confirm_and_stage(
    state: State<AppState>,
) -> Result<ConfirmResult, CoreError> {
    let mut engine = state.retrofit.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    engine.confirm_and_stage()
}

#[tauri::command]
fn cmd_retrofit_apply_next(
    state: State<AppState>,
    before_json: String,
    after_json: String,
) -> Result<Option<ApplyResult>, CoreError> {
    let before: serde_json::Value = serde_json::from_str(&before_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let after: serde_json::Value = serde_json::from_str(&after_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let db = state.db.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    let mut engine = state.retrofit.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    let mut storage_exec = worldsmith_core::retrofit::executor::StorageExecutor::new(&*db as &dyn worldsmith_core::storage::StorageBackend);
    engine.apply_next_with_executor(&mut storage_exec, before, after)
}

#[tauri::command]
fn cmd_retrofit_verify_and_accept(
    state: State<AppState>,
    entity_count: usize,
    relation_count: usize,
) -> Result<worldsmith_core::retrofit::RetrofitResult, CoreError> {
    let mut engine = state.retrofit.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    engine.verify_and_accept(entity_count, relation_count)
}

#[tauri::command]
fn cmd_retrofit_request_repair(
    state: State<AppState>,
    message: String,
) -> Result<(), CoreError> {
    let mut engine = state.retrofit.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    engine.request_repair(&message)
}

#[tauri::command]
fn cmd_retrofit_redirect(
    state: State<AppState>,
    message: String,
) -> Result<(), CoreError> {
    let mut engine = state.retrofit.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    engine.redirect(&message)
}

#[tauri::command]
fn cmd_retrofit_rollback_last(
    state: State<AppState>,
) -> Result<Option<String>, CoreError> {
    let mut engine = state.retrofit.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    engine.rollback_last()
}

#[tauri::command]
fn cmd_retrofit_abort(
    state: State<AppState>,
) -> Result<Vec<String>, CoreError> {
    let mut engine = state.retrofit.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    engine.abort()
}

#[tauri::command]
fn cmd_retrofit_session_phase(
    state: State<AppState>,
) -> Result<Option<SessionPhase>, CoreError> {
    let engine = state.retrofit.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    Ok(engine.session().map(|s| s.phase))
}

#[tauri::command]
fn cmd_retrofit_patch_diff(
    before_json: String,
    after_json: String,
) -> Result<serde_json::Value, CoreError> {
    let before: serde_json::Value = serde_json::from_str(&before_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let after: serde_json::Value = serde_json::from_str(&after_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let patch = JsonPatchDiff::diff(&before, &after);
    let estimate = JsonPatchDiff::estimate_token_saving(&before, &after);
    Ok(serde_json::json!({
        "operations": patch.operations,
        "tokenEstimate": estimate,
    }))
}

#[tauri::command]
fn cmd_retrofit_patch_apply(
    doc_json: String,
    patch_json: String,
) -> Result<String, CoreError> {
    let doc: serde_json::Value = serde_json::from_str(&doc_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let patch: JsonPatch = serde_json::from_str(&patch_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let result = patch.apply(&doc)?;
    serde_json::to_string(&result).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_retrofit_detect_conflicts(
    state: State<AppState>,
) -> Result<Option<ConflictReport>, CoreError> {
    let engine = state.retrofit.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    Ok(engine.detect_conflicts())
}

#[tauri::command]
fn cmd_retrofit_end_session(
    state: State<AppState>,
) -> Result<bool, CoreError> {
    let mut engine = state.retrofit.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    Ok(engine.end_session().is_some())
}

// ── 空间索引命令 ──

#[tauri::command]
fn cmd_spatial_insert_rect(
    state: State<AppState>,
    item_json: String,
) -> Result<(), CoreError> {
    let item: SpatialItem = serde_json::from_str(&item_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let mut idx = state.spatial.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    idx.insert_rect(item);
    Ok(())
}

#[tauri::command]
fn cmd_spatial_insert_point(
    state: State<AppState>,
    item_json: String,
) -> Result<(), CoreError> {
    let item: PointItem = serde_json::from_str(&item_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let mut idx = state.spatial.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    idx.insert_point(item);
    Ok(())
}

#[tauri::command]
fn cmd_spatial_query_range(
    state: State<AppState>,
    min_json: String,
    max_json: String,
) -> Result<Vec<SpatialItem>, CoreError> {
    let min: [f64; 2] = serde_json::from_str(&min_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let max: [f64; 2] = serde_json::from_str(&max_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let idx = state.spatial.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    Ok(idx.query_rect_in_range(min, max).into_iter().cloned().collect())
}

#[tauri::command]
fn cmd_spatial_query_at_point(
    state: State<AppState>,
    point_json: String,
) -> Result<Vec<SpatialItem>, CoreError> {
    let point: [f64; 2] = serde_json::from_str(&point_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let idx = state.spatial.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    Ok(idx.query_rect_at_point(point).into_iter().cloned().collect())
}

#[tauri::command]
fn cmd_spatial_nearest_point(
    state: State<AppState>,
    query_json: String,
) -> Result<Option<PointItem>, CoreError> {
    let query: [f64; 2] = serde_json::from_str(&query_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let idx = state.spatial.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    Ok(idx.nearest_point(query).cloned())
}

#[tauri::command]
fn cmd_spatial_k_nearest(
    state: State<AppState>,
    query_json: String,
    k: usize,
) -> Result<Vec<PointItem>, CoreError> {
    let query: [f64; 2] = serde_json::from_str(&query_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let idx = state.spatial.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    Ok(idx.k_nearest_points(query, k).into_iter().cloned().collect())
}

#[tauri::command]
fn cmd_spatial_query_by_category(
    state: State<AppState>,
    category: String,
) -> Result<Vec<SpatialItem>, CoreError> {
    let idx = state.spatial.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    Ok(idx.query_rects_by_category(&category).into_iter().cloned().collect())
}

#[tauri::command]
fn cmd_spatial_remove_rect(
    state: State<AppState>,
    item_json: String,
) -> Result<bool, CoreError> {
    let item: SpatialItem = serde_json::from_str(&item_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let mut idx = state.spatial.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    Ok(idx.remove_rect(&item))
}

#[tauri::command]
fn cmd_spatial_clear(state: State<AppState>) -> Result<(), CoreError> {
    let mut idx = state.spatial.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    idx.clear();
    Ok(())
}

#[tauri::command]
fn cmd_spatial_counts(state: State<AppState>) -> Result<serde_json::Value, CoreError> {
    let idx = state.spatial.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    Ok(serde_json::json!({
        "rectCount": idx.rect_count(),
        "pointCount": idx.point_count(),
    }))
}

// ── 几何算法命令（无状态） ──

#[tauri::command]
fn cmd_algo_segment_intersect(
    seg1_json: String,
    seg2_json: String,
) -> Result<bool, CoreError> {
    let s1: Segment2D = serde_json::from_str(&seg1_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let s2: Segment2D = serde_json::from_str(&seg2_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    Ok(s1.intersects(s2))
}

#[tauri::command]
fn cmd_algo_segment_intersection_point(
    seg1_json: String,
    seg2_json: String,
) -> Result<Option<Point2D>, CoreError> {
    let s1: Segment2D = serde_json::from_str(&seg1_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let s2: Segment2D = serde_json::from_str(&seg2_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    Ok(s1.intersection_point(s2))
}

#[tauri::command]
fn cmd_algo_find_all_intersections(
    segments_json: String,
) -> Result<serde_json::Value, CoreError> {
    let segments: Vec<Segment2D> = serde_json::from_str(&segments_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let results = find_all_intersections(&segments);
    Ok(serde_json::to_value(&results).map_err(|e| CoreError::serialize(e.to_string()))?)
}

#[tauri::command]
fn cmd_algo_point_in_polygon(
    point_json: String,
    vertices_json: String,
) -> Result<bool, CoreError> {
    let point: Point2D = serde_json::from_str(&point_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let vertices: Vec<Point2D> = serde_json::from_str(&vertices_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    Ok(point_in_polygon(point, &vertices))
}

#[tauri::command]
fn cmd_algo_polygon_area(vertices_json: String) -> Result<f64, CoreError> {
    let poly: Polygon2D = serde_json::from_str(&vertices_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    Ok(poly.area())
}

#[tauri::command]
fn cmd_algo_polygon_centroid(vertices_json: String) -> Result<Option<Point2D>, CoreError> {
    let poly: Polygon2D = serde_json::from_str(&vertices_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    Ok(poly.centroid())
}

#[tauri::command]
fn cmd_algo_convex_hull(points_json: String) -> Result<Vec<Point2D>, CoreError> {
    let points: Vec<Point2D> = serde_json::from_str(&points_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    Ok(convex_hull(&points))
}

#[tauri::command]
fn cmd_algo_aabb_intersects(
    a_json: String,
    b_json: String,
) -> Result<bool, CoreError> {
    let a: AABB2D = serde_json::from_str(&a_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let b: AABB2D = serde_json::from_str(&b_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    Ok(a.intersects(b))
}

#[tauri::command]
fn cmd_algo_obb_intersects(
    a_json: String,
    b_json: String,
) -> Result<bool, CoreError> {
    let a: OBB2D = serde_json::from_str(&a_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let b: OBB2D = serde_json::from_str(&b_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    Ok(a.intersects(b))
}

// ── 图算法命令（无状态） ──

#[tauri::command]
fn cmd_algo_dijkstra(
    graph_json: String,
    source: String,
) -> Result<serde_json::Value, CoreError> {
    let graph: WeightedGraph = serde_json::from_str(&graph_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let result = dijkstra(&graph, &source);
    serde_json::to_value(&result).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_algo_dijkstra_path(
    graph_json: String,
    source: String,
    target: String,
) -> Result<serde_json::Value, CoreError> {
    let graph: WeightedGraph = serde_json::from_str(&graph_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let result = dijkstra_path(&graph, &source, &target);
    serde_json::to_value(&result).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_algo_astar(
    graph_json: String,
    source: String,
    target: String,
    heuristic_json: String,
) -> Result<serde_json::Value, CoreError> {
    let graph: WeightedGraph = serde_json::from_str(&graph_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let heuristic_map: std::collections::HashMap<String, f64> = serde_json::from_str(&heuristic_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let result = astar(&graph, &source, &target, |node| {
        heuristic_map.get(node).copied().unwrap_or(f64::INFINITY)
    });
    serde_json::to_value(&result).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_algo_k_shortest_paths(
    graph_json: String,
    source: String,
    target: String,
    k: usize,
) -> Result<serde_json::Value, CoreError> {
    let graph: WeightedGraph = serde_json::from_str(&graph_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let result = k_shortest_paths(&graph, &source, &target, k);
    serde_json::to_value(&result).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_algo_topological_sort(
    graph_json: String,
) -> Result<serde_json::Value, CoreError> {
    let graph: WeightedGraph = serde_json::from_str(&graph_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let result = topological_sort(&graph);
    serde_json::to_value(&result).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_algo_connected_components(
    graph_json: String,
) -> Result<serde_json::Value, CoreError> {
    let graph: WeightedGraph = serde_json::from_str(&graph_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let result = connected_components(&graph);
    serde_json::to_value(&result).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_algo_tarjan_scc(
    graph_json: String,
) -> Result<serde_json::Value, CoreError> {
    let graph: WeightedGraph = serde_json::from_str(&graph_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let result = tarjan_scc(&graph);
    serde_json::to_value(&result).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_algo_find_dangling(
    graph_json: String,
) -> Result<serde_json::Value, CoreError> {
    let graph: WeightedGraph = serde_json::from_str(&graph_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let result = find_dangling_references(&graph);
    serde_json::to_value(&result).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_algo_force_layout(
    graph_json: String,
    config_json: Option<String>,
) -> Result<serde_json::Value, CoreError> {
    let graph: WeightedGraph = serde_json::from_str(&graph_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let config: ForceLayoutConfig = config_json
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();
    let result = force_directed_layout(&graph, &config);
    serde_json::to_value(&result).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_algo_crdt_lww_new(
    value: String,
    node_id: String,
) -> Result<String, CoreError> {
    let reg = LWWRegister::new(value, node_id);
    serde_json::to_string(&reg).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_algo_crdt_lww_set(
    register_json: String,
    value: String,
    timestamp: u64,
) -> Result<String, CoreError> {
    let mut reg: LWWRegister<String> = serde_json::from_str(&register_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    reg.set(value, timestamp);
    serde_json::to_string(&reg).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_algo_crdt_lww_merge(
    register_json: String,
    other_json: String,
) -> Result<String, CoreError> {
    let mut reg: LWWRegister<String> = serde_json::from_str(&register_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let other: LWWRegister<String> = serde_json::from_str(&other_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    reg.merge(&other);
    serde_json::to_string(&reg).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_algo_crdt_orset_new(
    node_id: String,
) -> Result<String, CoreError> {
    let set = ORSet::<String>::new(node_id);
    serde_json::to_string(&set).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_algo_crdt_orset_add(
    set_json: String,
    element: String,
) -> Result<String, CoreError> {
    let mut set: ORSet<String> = serde_json::from_str(&set_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    set.add(element);
    serde_json::to_string(&set).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_algo_crdt_orset_remove(
    set_json: String,
    element: String,
) -> Result<String, CoreError> {
    let mut set: ORSet<String> = serde_json::from_str(&set_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    set.remove(&element);
    serde_json::to_string(&set).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_algo_crdt_orset_merge(
    set_json: String,
    other_json: String,
) -> Result<String, CoreError> {
    let mut set: ORSet<String> = serde_json::from_str(&set_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let other: ORSet<String> = serde_json::from_str(&other_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    set.merge(&other);
    serde_json::to_string(&set).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_algo_crdt_orset_elements(
    set_json: String,
) -> Result<serde_json::Value, CoreError> {
    let set: ORSet<String> = serde_json::from_str(&set_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let elements: Vec<&String> = set.elements();
    serde_json::to_value(&elements).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_algo_crdt_rga_new(
    node_id: String,
) -> Result<String, CoreError> {
    let rga = RGA::new(node_id);
    serde_json::to_string(&rga).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_algo_crdt_rga_insert(
    rga_json: String,
    index: usize,
    content: String,
) -> Result<serde_json::Value, CoreError> {
    let mut rga: RGA = serde_json::from_str(&rga_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let inserted_id = rga.insert(index, content);
    Ok(serde_json::json!({
        "rga": rga,
        "insertedId": inserted_id,
    }))
}

#[tauri::command]
fn cmd_algo_crdt_rga_delete(
    rga_json: String,
    id: String,
) -> Result<String, CoreError> {
    let mut rga: RGA = serde_json::from_str(&rga_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    rga.delete(&id);
    serde_json::to_string(&rga).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_algo_crdt_rga_merge(
    rga_json: String,
    other_json: String,
) -> Result<String, CoreError> {
    let mut rga: RGA = serde_json::from_str(&rga_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let other: RGA = serde_json::from_str(&other_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    rga.merge(&other);
    serde_json::to_string(&rga).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_algo_crdt_rga_text(
    rga_json: String,
) -> Result<String, CoreError> {
    let rga: RGA = serde_json::from_str(&rga_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    Ok(rga.text())
}

#[tauri::command]
fn cmd_algo_crdt_vc_compare(
    clock_a_json: String,
    clock_b_json: String,
) -> Result<serde_json::Value, CoreError> {
    let a: VectorClock = serde_json::from_str(&clock_a_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let b: VectorClock = serde_json::from_str(&clock_b_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    Ok(serde_json::json!({
        "happensBefore": a.happens_before(&b),
        "isConcurrent": a.is_concurrent(&b),
    }))
}

#[tauri::command]
fn cmd_algo_terrain_noise(
    x: f64,
    y: f64,
    config_json: Option<String>,
) -> Result<f64, CoreError> {
    let config: NoiseConfig = config_json
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();
    Ok(value_noise_2d(x, y, &config))
}

#[tauri::command]
fn cmd_algo_terrain_heightmap_generate(
    config_json: Option<String>,
    width: usize,
    height: usize,
    offset_x: f64,
    offset_y: f64,
) -> Result<String, CoreError> {
    let config: NoiseConfig = config_json
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();
    let map = HeightMap::generate(&config, width, height, offset_x, offset_y);
    serde_json::to_string(&map).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_algo_terrain_heightmap_slope(
    heightmap_json: String,
    x: usize,
    y: usize,
) -> Result<serde_json::Value, CoreError> {
    let map: HeightMap = serde_json::from_str(&heightmap_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let (dx, dy) = map.slope_at(x, y);
    let magnitude = map.slope_magnitude_at(x, y);
    Ok(serde_json::json!({
        "dx": dx,
        "dy": dy,
        "magnitude": magnitude,
    }))
}

#[tauri::command]
fn cmd_algo_terrain_heightmap_aspect(
    heightmap_json: String,
    x: usize,
    y: usize,
) -> Result<f64, CoreError> {
    let map: HeightMap = serde_json::from_str(&heightmap_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    Ok(map.aspect_at(x, y))
}

#[tauri::command]
fn cmd_algo_terrain_marching_squares(
    heightmap_json: String,
    levels_json: String,
) -> Result<serde_json::Value, CoreError> {
    let map: HeightMap = serde_json::from_str(&heightmap_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let levels: Vec<f64> = serde_json::from_str(&levels_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let contours = marching_squares(&map, &levels);
    serde_json::to_value(&contours).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_algo_constraint_solve(
    system_json: String,
    max_iterations: usize,
    tolerance: f64,
) -> Result<serde_json::Value, CoreError> {
    let mut system: ConstraintSystem = serde_json::from_str(&system_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let result = system.solve(max_iterations, tolerance);
    Ok(serde_json::json!({
        "result": result,
        "system": system,
    }))
}

#[tauri::command]
fn cmd_algo_dxf_parse(content: String) -> Result<serde_json::Value, CoreError> {
    let result = dxf_io::parse_dxf(&content).map_err(|e| CoreError::deserialize(e.to_string()))?;
    serde_json::to_value(&result).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_algo_dxf_generate(entities_json: String) -> Result<String, CoreError> {
    let entities: Vec<dxf_io::DxfEntity> = serde_json::from_str(&entities_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    dxf_io::generate_dxf(&entities).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_algo_dxf_extract_constraints(system_json: String) -> Result<serde_json::Value, CoreError> {
    let system: worldsmith_core::algo::draft::constraint::ConstraintSystem = serde_json::from_str(&system_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let constraints = dxf_io::extract_horizontal_vertical_constraints(&system);
    serde_json::to_value(&constraints).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_algo_polygon_boolean(op: String, a_json: String, b_json: String) -> Result<serde_json::Value, CoreError> {
    let boolean_op = match op.as_str() {
        "union" => boolean::BooleanOp::Union,
        "intersection" => boolean::BooleanOp::Intersection,
        "difference" => boolean::BooleanOp::Difference,
        "xor" => boolean::BooleanOp::Xor,
        _ => return Err(CoreError::deserialize("op must be union/intersection/difference/xor".to_string())),
    };
    let a: boolean::Polygon2DResult = serde_json::from_str(&a_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let b: boolean::Polygon2DResult = serde_json::from_str(&b_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let result = boolean::polygon_boolean_op(&boolean_op, &a.exterior, &a.interiors, &b.exterior, &b.interiors);
    serde_json::to_value(&result).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_algo_polygon_offset(polygon_json: String, delta: f64) -> Result<String, CoreError> {
    let poly: boolean::Polygon2DResult = serde_json::from_str(&polygon_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let result = boolean::polygon_offset(&poly.exterior, &poly.interiors, delta);
    serde_json::to_string(&result).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_algo_polygon_simplify(polygon_json: String, epsilon: f64) -> Result<String, CoreError> {
    let poly: boolean::Polygon2DResult = serde_json::from_str(&polygon_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let result = boolean::polygon_simplify(&poly.exterior, &poly.interiors, epsilon);
    serde_json::to_string(&result).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_algo_line_length(points_json: String) -> Result<f64, CoreError> {
    let points: Vec<worldsmith_core::algo::geometry::line::Point2D> = serde_json::from_str(&points_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    Ok(boolean::line_length(&points))
}

#[tauri::command]
fn cmd_algo_pagerank(graph_json: String, damping: f64, max_iterations: usize, tolerance: f64) -> Result<serde_json::Value, CoreError> {
    let graph = serde_json::from_str::<worldsmith_core::algo::graph::pathfind::WeightedGraph>(&graph_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let result = community::pagerank(&graph, damping, max_iterations, tolerance);
    serde_json::to_value(&result).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_algo_community_detection(graph_json: String) -> Result<serde_json::Value, CoreError> {
    let graph = serde_json::from_str::<worldsmith_core::algo::graph::pathfind::WeightedGraph>(&graph_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let result = community::louvain_communities(&graph);
    serde_json::to_value(&result).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_algo_betweenness_centrality(graph_json: String) -> Result<serde_json::Value, CoreError> {
    let graph = serde_json::from_str::<worldsmith_core::algo::graph::pathfind::WeightedGraph>(&graph_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let result = community::betweenness_centrality(&graph);
    serde_json::to_value(&result).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_algo_hydraulic_erosion(heightmap_json: String, config_json: Option<String>) -> Result<String, CoreError> {
    let mut map = serde_json::from_str::<worldsmith_core::algo::terrain::terrain::HeightMap>(&heightmap_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let config: erosion::ErosionConfig = config_json
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();
    erosion::hydraulic_erosion(&mut map, &config);
    serde_json::to_string(&map).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_algo_viewshed(heightmap_json: String, observer_x: usize, observer_y: usize, observer_height: f64, radius: f64) -> Result<serde_json::Value, CoreError> {
    let map = serde_json::from_str::<worldsmith_core::algo::terrain::terrain::HeightMap>(&heightmap_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let result = erosion::viewshed(&map, observer_x, observer_y, observer_height, radius);
    serde_json::to_value(&result).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_algo_chaikin_smooth(vertices_json: String, iterations: usize) -> Result<String, CoreError> {
    let vertices: Vec<Point2D> = serde_json::from_str(&vertices_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let result = chaikin_smooth(&vertices, iterations);
    serde_json::to_string(&result).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_algo_find_shared_edges(vertices_a_json: String, vertices_b_json: String, threshold: f64) -> Result<serde_json::Value, CoreError> {
    let a: Vec<Point2D> = serde_json::from_str(&vertices_a_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let b: Vec<Point2D> = serde_json::from_str(&vertices_b_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let result = find_shared_edges(&a, &b, threshold);
    serde_json::to_value(&result).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_algo_find_line_polygon_intersections(line_json: String, polygon_json: String) -> Result<serde_json::Value, CoreError> {
    let line: Vec<Point2D> = serde_json::from_str(&line_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let polygon: Vec<Point2D> = serde_json::from_str(&polygon_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let result = find_line_polygon_intersections(&line, &polygon);
    serde_json::to_value(&result).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_algo_polygon_split(polygon_json: String, cutting_line_json: String) -> Result<serde_json::Value, CoreError> {
    let polygon: Vec<Point2D> = serde_json::from_str(&polygon_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let cutting: Vec<Point2D> = serde_json::from_str(&cutting_line_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let result = polygon_split(&polygon, &cutting);
    serde_json::to_value(&result).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_algo_polygon_augment(polygon_json: String, adding_line_json: String) -> Result<String, CoreError> {
    let polygon: Vec<Point2D> = serde_json::from_str(&polygon_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let adding: Vec<Point2D> = serde_json::from_str(&adding_line_json)
        .map_err(|e| CoreError::deserialize(e.to_string()))?;
    let result = polygon_augment(&polygon, &adding);
    serde_json::to_string(&result).map_err(|e| CoreError::serialize(e.to_string()))
}

#[tauri::command]
fn cmd_schema_register_entity_type(state: State<AppState>, schema_json: String) -> Result<String, CoreError> {
    let schema: worldsmith_core::schema::EntityTypeSchema = serde_json::from_str(&schema_json)
        .map_err(|e| CoreError::SchemaError(format!("Invalid schema JSON: {}", e)))?;
    let mut reg = state.schema.lock().map_err(|e| CoreError::SchemaError(e.to_string()))?;
    reg.register(schema.clone()).map_err(CoreError::SchemaError)?;
    Ok(serde_json::to_string(&schema).unwrap())
}

#[tauri::command]
fn cmd_schema_unregister_entity_type(state: State<AppState>, type_key: String) -> Result<(), CoreError> {
    let mut reg = state.schema.lock().map_err(|e| CoreError::SchemaError(e.to_string()))?;
    reg.unregister(&type_key);
    Ok(())
}

#[tauri::command]
fn cmd_schema_get_entity_type(state: State<AppState>, type_key: String) -> Result<String, CoreError> {
    let reg = state.schema.lock().map_err(|e| CoreError::SchemaError(e.to_string()))?;
    let schema = reg.get(&type_key)
        .ok_or_else(|| CoreError::SchemaError(format!("Entity type '{}' not found", type_key)))?;
    Ok(serde_json::to_string(schema).unwrap())
}

#[tauri::command]
fn cmd_schema_list_entity_types(state: State<AppState>) -> Result<String, CoreError> {
    let reg = state.schema.lock().map_err(|e| CoreError::SchemaError(e.to_string()))?;
    let list = reg.list_all();
    Ok(serde_json::to_string(&list).unwrap())
}

#[tauri::command]
fn cmd_schema_update_entity_type(state: State<AppState>, type_key: String, updates_json: String) -> Result<String, CoreError> {
    let updates: worldsmith_core::schema::EntityTypeSchema = serde_json::from_str(&updates_json)
        .map_err(|e| CoreError::SchemaError(format!("Invalid updates JSON: {}", e)))?;
    let mut reg = state.schema.lock().map_err(|e| CoreError::SchemaError(e.to_string()))?;
    reg.unregister(&type_key);
    reg.register(updates.clone()).map_err(CoreError::SchemaError)?;
    Ok(serde_json::to_string(&updates).unwrap())
}

#[tauri::command]
fn cmd_schema_register_validation(state: State<AppState>, type_key: String, rule_json: String) -> Result<(), CoreError> {
    let rule: worldsmith_core::schema::ValidationRule = serde_json::from_str(&rule_json)
        .map_err(|e| CoreError::SchemaError(format!("Invalid rule JSON: {}", e)))?;
    let mut reg = state.schema.lock().map_err(|e| CoreError::SchemaError(e.to_string()))?;
    reg.add_validation(&type_key, rule).map_err(CoreError::SchemaError)
}

#[tauri::command]
fn cmd_schema_register_view(state: State<AppState>, type_key: String, view_json: String) -> Result<(), CoreError> {
    let view: worldsmith_core::schema::ViewDeclaration = serde_json::from_str(&view_json)
        .map_err(|e| CoreError::SchemaError(format!("Invalid view JSON: {}", e)))?;
    let mut reg = state.schema.lock().map_err(|e| CoreError::SchemaError(e.to_string()))?;
    reg.add_view(&type_key, view).map_err(CoreError::SchemaError)
}

#[tauri::command]
fn cmd_mcp_spawn(state: State<AppState>, server_id: String, command: String, args: Vec<String>) -> Result<(), CoreError> {
    let child = std::process::Command::new(&command)
        .args(&args)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| CoreError::InvalidArgument(format!("Failed to spawn MCP server: {}", e)))?;
    let mut processes = state.mcp_processes.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    processes.insert(server_id, child);
    Ok(())
}

#[tauri::command]
fn cmd_mcp_kill(state: State<AppState>, server_id: String) -> Result<(), CoreError> {
    let mut processes = state.mcp_processes.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    if let Some(mut child) = processes.remove(&server_id) {
        let _ = child.kill();
    }
    Ok(())
}

#[tauri::command]
fn cmd_mcp_list(state: State<AppState>) -> Result<Vec<String>, CoreError> {
    let processes = state.mcp_processes.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    Ok(processes.keys().cloned().collect())
}

#[derive(Serialize, Deserialize, Clone)]
struct SystemFontInfo {
    family: String,
    path: String,
    weight: u32,
    style: String,
    format: String,
}

#[tauri::command]
fn cmd_font_scan_system() -> Result<Vec<SystemFontInfo>, CoreError> {
    let mut fonts = Vec::new();

    #[cfg(target_os = "windows")]
    {
        let font_dir = std::path::Path::new("C:\\Windows\\Fonts");
        if font_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(font_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    let ext = path.extension()
                        .and_then(|e| e.to_str())
                        .map(|e| e.to_lowercase())
                        .unwrap_or_default();

                    if !matches!(ext.as_str(), "ttf" | "otf" | "ttc" | "woff" | "woff2") {
                        continue;
                    }

                    let file_name = path.file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("Unknown")
                        .to_string();

                    let format = match ext.as_str() {
                        "woff2" => "woff2",
                        "woff" => "woff",
                        "otf" => "opentype",
                        _ => "truetype",
                    }.to_string();

                    let family = file_name
                        .replace(['-', '_'], " ")
                        .split_whitespace()
                        .map(|w| {
                            let mut c = w.chars();
                            match c.next() {
                                None => String::new(),
                                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                            }
                        })
                        .collect::<Vec<_>>()
                        .join(" ");

                    let (weight, style) = parse_font_meta(&file_name);

                    fonts.push(SystemFontInfo {
                        family,
                        path: path.to_string_lossy().to_string(),
                        weight,
                        style,
                        format,
                    });
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        let dirs = vec![
            "/Library/Fonts",
            "/System/Library/Fonts",
        ];
        for dir_path in dirs {
            let font_dir = std::path::Path::new(dir_path);
            if font_dir.exists() {
                if let Ok(entries) = std::fs::read_dir(font_dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        let ext = path.extension()
                            .and_then(|e| e.to_str())
                            .map(|e| e.to_lowercase())
                            .unwrap_or_default();
                        if !matches!(ext.as_str(), "ttf" | "otf" | "ttc" | "woff" | "woff2") {
                            continue;
                        }
                        let file_name = path.file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or("Unknown")
                            .to_string();
                        let format = match ext.as_str() {
                            "woff2" => "woff2",
                            "woff" => "woff",
                            "otf" => "opentype",
                            _ => "truetype",
                        }.to_string();
                        let family = file_name.replace(['-', '_'], " ");
                        let (weight, style) = parse_font_meta(&file_name);
                        fonts.push(SystemFontInfo {
                            family,
                            path: path.to_string_lossy().to_string(),
                            weight,
                            style,
                            format,
                        });
                    }
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        let dirs = vec![
            "/usr/share/fonts",
            "/usr/local/share/fonts",
        ];
        for dir_path in dirs {
            let font_dir = std::path::Path::new(dir_path);
            if font_dir.exists() {
                if let Ok(entries) = std::fs::read_dir(font_dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.is_dir() { continue; }
                        let ext = path.extension()
                            .and_then(|e| e.to_str())
                            .map(|e| e.to_lowercase())
                            .unwrap_or_default();
                        if !matches!(ext.as_str(), "ttf" | "otf" | "ttc" | "woff" | "woff2") {
                            continue;
                        }
                        let file_name = path.file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or("Unknown")
                            .to_string();
                        let format = match ext.as_str() {
                            "woff2" => "woff2",
                            "woff" => "woff",
                            "otf" => "opentype",
                            _ => "truetype",
                        }.to_string();
                        let family = file_name.replace(['-', '_'], " ");
                        let (weight, style) = parse_font_meta(&file_name);
                        fonts.push(SystemFontInfo {
                            family,
                            path: path.to_string_lossy().to_string(),
                            weight,
                            style,
                            format,
                        });
                    }
                }
            }
        }
    }

    Ok(fonts)
}

fn parse_font_meta(file_name: &str) -> (u32, String) {
    let lower = file_name.to_lowercase();
    let weight = if lower.contains("thin") || lower.contains("hairline") {
        100
    } else if lower.contains("extralight") || lower.contains("ultralight") {
        200
    } else if lower.contains("light") {
        300
    } else if lower.contains("medium") {
        500
    } else if lower.contains("semibold") || lower.contains("demibold") || lower.contains("demi") {
        600
    } else if lower.contains("extrabold") || lower.contains("ultrabold") {
        800
    } else if lower.contains("black") || lower.contains("heavy") {
        900
    } else if lower.contains("bold") {
        700
    } else {
        400
    };
    let style = if lower.contains("italic") || lower.contains("oblique") {
        "italic".to_string()
    } else {
        "normal".to_string()
    };
    (weight, style)
}

#[tauri::command]
fn cmd_font_read_file(path: String) -> Result<Vec<u8>, CoreError> {
    std::fs::read(&path).map_err(|e| CoreError::storage(format!("Failed to read font file '{}': {}", path, e)))
}

#[tauri::command]
fn cmd_pty_spawn(
    app: tauri::AppHandle,
    state: State<AppState>,
    id: String,
    shell: Option<String>,
    cwd: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<(), CoreError> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: rows.unwrap_or(24),
            cols: cols.unwrap_or(80),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| CoreError::InvalidArgument(format!("PTY open failed: {}", e)))?;

    let mut cmd = CommandBuilder::new(shell.unwrap_or_else(|| {
        if cfg!(target_os = "windows") { "cmd.exe".to_string() } else { "sh".to_string() }
    }));
    if let Some(cwd) = cwd { cmd.cwd(cwd); }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| CoreError::InvalidArgument(format!("PTY spawn failed: {}", e)))?;

    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| CoreError::InvalidArgument(format!("PTY reader failed: {}", e)))?;

    let (kill_tx, mut kill_rx) = tokio::sync::oneshot::channel::<()>();
    let pty_id = id.clone();
    let app_handle = app.clone();

    std::thread::spawn(move || {
        let mut buf_reader = BufReader::new(reader);
        let mut line = String::new();
        loop {
            line.clear();
            match buf_reader.read_line(&mut line) {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    let _ = app_handle.emit(&format!("pty-output-{}", pty_id), &line);
                }
            }
            if kill_rx.try_recv().is_ok() { break; }
        }
    });

    let master = pair.master;
    let writer = master.take_writer().map_err(|e| CoreError::InvalidArgument(format!("PTY writer failed: {}", e)))?;
    let mut processes = state.pty_processes.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    processes.insert(id, PtyProcess { master, writer, _child: child, kill_tx: std::sync::Mutex::new(Some(kill_tx)) });

    Ok(())
}

#[tauri::command]
fn cmd_pty_write(state: State<AppState>, id: String, data: String) -> Result<(), CoreError> {
    let mut processes = state.pty_processes.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    let pty = processes.get_mut(&id).ok_or_else(|| CoreError::InvalidArgument("PTY not found".to_string()))?;
    pty.writer.write_all(data.as_bytes()).map_err(|e| CoreError::InvalidArgument(format!("PTY write failed: {}", e)))?;
    Ok(())
}

#[tauri::command]
fn cmd_pty_resize(state: State<AppState>, id: String, cols: u16, rows: u16) -> Result<(), CoreError> {
    let processes = state.pty_processes.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    let pty = processes.get(&id).ok_or_else(|| CoreError::InvalidArgument("PTY not found".to_string()))?;
    pty.master.resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 }).map_err(|e| CoreError::InvalidArgument(format!("PTY resize failed: {}", e)))?;
    Ok(())
}

#[tauri::command]
fn cmd_pty_kill(state: State<AppState>, id: String) -> Result<(), CoreError> {
    let mut processes = state.pty_processes.lock().map_err(|e| CoreError::Lock(e.to_string()))?;
    if let Some(pty) = processes.remove(&id) {
        if let Ok(mut tx) = pty.kill_tx.lock() {
            if let Some(sender) = tx.take() {
                let _ = sender.send(());
            }
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db = SqliteStore::open_in_memory().expect("SQLite 内存数据库初始化失败");

    let mut schema_reg = worldsmith_core::schema::SchemaRegistry::new();
    schema_reg.register(worldsmith_core::schema::EntityTypeSchema {
        type_key: "weapon".to_string(),
        label: "武器".to_string(),
        icon: "🗡️".to_string(),
        fields: vec![
            worldsmith_core::schema::FieldSchema {
                key: "name".to_string(),
                label: "名称".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: true,
                default_value: None,
                options: vec![],
                placeholder: Some("输入武器名称".to_string()),
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "type".to_string(),
                label: "类型".to_string(),
                field_type: worldsmith_core::schema::FieldType::Select,
                required: false,
                default_value: None,
                options: vec![
                    worldsmith_core::schema::SelectOption { value: "melee".to_string(), label: "近战".to_string() },
                    worldsmith_core::schema::SelectOption { value: "ranged".to_string(), label: "远程".to_string() },
                    worldsmith_core::schema::SelectOption { value: "magic".to_string(), label: "魔法".to_string() },
                    worldsmith_core::schema::SelectOption { value: "shield".to_string(), label: "盾牌".to_string() },
                ],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "rarity".to_string(),
                label: "稀有度".to_string(),
                field_type: worldsmith_core::schema::FieldType::Select,
                required: false,
                default_value: None,
                options: vec![
                    worldsmith_core::schema::SelectOption { value: "common".to_string(), label: "普通".to_string() },
                    worldsmith_core::schema::SelectOption { value: "rare".to_string(), label: "稀有".to_string() },
                    worldsmith_core::schema::SelectOption { value: "epic".to_string(), label: "史诗".to_string() },
                    worldsmith_core::schema::SelectOption { value: "legendary".to_string(), label: "传说".to_string() },
                ],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "description".to_string(),
                label: "描述".to_string(),
                field_type: worldsmith_core::schema::FieldType::Textarea,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: Some("输入武器描述".to_string()),
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "origin".to_string(),
                label: "来源".to_string(),
                field_type: worldsmith_core::schema::FieldType::EntityRef,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: Some("region".to_string()),
                auto_link: None,
                animation: None,
            },
        ],
        relations: vec![
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "evolves_from".to_string(),
                label: "进阶自".to_string(),
                source_types: vec!["weapon".to_string()],
                target_types: vec!["weapon".to_string()],
                directed: true,
            },
        ],
        validations: vec![],
        views: vec![worldsmith_core::schema::ViewDeclaration {
            view_type: worldsmith_core::schema::ViewType::List,
            config: serde_json::Value::Null,
            animation: None,
        }],
        icon_map: {
            let mut m = std::collections::HashMap::new();
            m.insert("melee".to_string(), "⚔️".to_string());
            m.insert("ranged".to_string(), "🏹".to_string());
            m.insert("magic".to_string(), "🪄".to_string());
            m.insert("shield".to_string(), "🛡️".to_string());
            m
        },
        id_prefix: "wpn-".to_string(),
        plugin_id: Some("official.weapons".to_string()),
    }).unwrap();

    schema_reg.register(worldsmith_core::schema::EntityTypeSchema {
        type_key: "species".to_string(),
        label: "物种".to_string(),
        icon: "🧬".to_string(),
        fields: vec![
            worldsmith_core::schema::FieldSchema {
                key: "name".to_string(),
                label: "名称".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: true,
                default_value: None,
                options: vec![],
                placeholder: Some("物种名称".to_string()),
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "description".to_string(),
                label: "描述".to_string(),
                field_type: worldsmith_core::schema::FieldType::Textarea,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: Some("简要描述".to_string()),
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "speciesType".to_string(),
                label: "类型".to_string(),
                field_type: worldsmith_core::schema::FieldType::Select,
                required: false,
                default_value: None,
                options: vec![
                    worldsmith_core::schema::SelectOption { value: "类人".to_string(), label: "类人".to_string() },
                    worldsmith_core::schema::SelectOption { value: "兽族".to_string(), label: "兽族".to_string() },
                    worldsmith_core::schema::SelectOption { value: "精灵".to_string(), label: "精灵".to_string() },
                    worldsmith_core::schema::SelectOption { value: "矮人".to_string(), label: "矮人".to_string() },
                    worldsmith_core::schema::SelectOption { value: "龙族".to_string(), label: "龙族".to_string() },
                    worldsmith_core::schema::SelectOption { value: "机械".to_string(), label: "机械".to_string() },
                    worldsmith_core::schema::SelectOption { value: "元素".to_string(), label: "元素".to_string() },
                    worldsmith_core::schema::SelectOption { value: "亡灵".to_string(), label: "亡灵".to_string() },
                    worldsmith_core::schema::SelectOption { value: "神话生物".to_string(), label: "神话生物".to_string() },
                    worldsmith_core::schema::SelectOption { value: "异界生物".to_string(), label: "异界生物".to_string() },
                    worldsmith_core::schema::SelectOption { value: "植物智能".to_string(), label: "植物智能".to_string() },
                    worldsmith_core::schema::SelectOption { value: "其他".to_string(), label: "其他".to_string() },
                ],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "avgLifespan".to_string(),
                label: "平均寿命".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "avgHeight".to_string(),
                label: "平均身高".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "avgWeight".to_string(),
                label: "平均体重".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "appearance".to_string(),
                label: "外貌特征".to_string(),
                field_type: worldsmith_core::schema::FieldType::Textarea,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "abilities".to_string(),
                label: "天赋能力".to_string(),
                field_type: worldsmith_core::schema::FieldType::Textarea,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "weakness".to_string(),
                label: "弱点/缺陷".to_string(),
                field_type: worldsmith_core::schema::FieldType::Textarea,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "origin".to_string(),
                label: "起源地".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "language".to_string(),
                label: "语言".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "population".to_string(),
                label: "人口/数量".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "society".to_string(),
                label: "社会结构".to_string(),
                field_type: worldsmith_core::schema::FieldType::Textarea,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "tags".to_string(),
                label: "标签".to_string(),
                field_type: worldsmith_core::schema::FieldType::Tags,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
        ],
        relations: vec![
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "originates_from".to_string(),
                label: "起源于".to_string(),
                source_types: vec!["species".to_string()],
                target_types: vec!["region".to_string()],
                directed: true,
            },
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "speaks".to_string(),
                label: "使用语言".to_string(),
                source_types: vec!["species".to_string()],
                target_types: vec!["concept".to_string()],
                directed: true,
            },
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "member_of".to_string(),
                label: "隶属组织".to_string(),
                source_types: vec!["species".to_string()],
                target_types: vec!["organization".to_string()],
                directed: true,
            },
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "related_species".to_string(),
                label: "相关物种".to_string(),
                source_types: vec!["species".to_string()],
                target_types: vec!["species".to_string()],
                directed: false,
            },
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "individual".to_string(),
                label: "个体角色".to_string(),
                source_types: vec!["species".to_string()],
                target_types: vec!["character".to_string()],
                directed: true,
            },
        ],
        validations: vec![],
        views: vec![worldsmith_core::schema::ViewDeclaration {
            view_type: worldsmith_core::schema::ViewType::List,
            config: serde_json::Value::Null,
            animation: None,
        }],
        icon_map: {
            let mut m = std::collections::HashMap::new();
            m.insert("类人".to_string(), "🧑".to_string());
            m.insert("兽族".to_string(), "🐺".to_string());
            m.insert("精灵".to_string(), "🧝".to_string());
            m.insert("矮人".to_string(), "🧔".to_string());
            m.insert("龙族".to_string(), "🐉".to_string());
            m.insert("机械".to_string(), "🤖".to_string());
            m.insert("元素".to_string(), "🔥".to_string());
            m.insert("亡灵".to_string(), "💀".to_string());
            m.insert("神话生物".to_string(), "🦄".to_string());
            m.insert("异界生物".to_string(), "👾".to_string());
            m.insert("植物智能".to_string(), "🌳".to_string());
            m
        },
        id_prefix: "spc-".to_string(),
        plugin_id: Some("official.species".to_string()),
    }).unwrap();

    schema_reg.register(worldsmith_core::schema::EntityTypeSchema {
        type_key: "combat_stat".to_string(),
        label: "战力体系".to_string(),
        icon: "⚡".to_string(),
        fields: vec![
            worldsmith_core::schema::FieldSchema {
                key: "name".to_string(),
                label: "名称".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: true,
                default_value: None,
                options: vec![],
                placeholder: Some("战力体系名称".to_string()),
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "description".to_string(),
                label: "描述".to_string(),
                field_type: worldsmith_core::schema::FieldType::Textarea,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: Some("简要描述".to_string()),
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "system".to_string(),
                label: "体系类型".to_string(),
                field_type: worldsmith_core::schema::FieldType::Select,
                required: false,
                default_value: None,
                options: vec![
                    worldsmith_core::schema::SelectOption { value: "修仙".to_string(), label: "修仙".to_string() },
                    worldsmith_core::schema::SelectOption { value: "魔法".to_string(), label: "魔法".to_string() },
                    worldsmith_core::schema::SelectOption { value: "武道".to_string(), label: "武道".to_string() },
                    worldsmith_core::schema::SelectOption { value: "异能".to_string(), label: "异能".to_string() },
                    worldsmith_core::schema::SelectOption { value: "科技".to_string(), label: "科技".to_string() },
                    worldsmith_core::schema::SelectOption { value: "混合".to_string(), label: "混合".to_string() },
                    worldsmith_core::schema::SelectOption { value: "其他".to_string(), label: "其他".to_string() },
                ],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "tier".to_string(),
                label: "等级/境界".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "realm".to_string(),
                label: "当前境界".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "promotion".to_string(),
                label: "晋升条件".to_string(),
                field_type: worldsmith_core::schema::FieldType::Textarea,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "bottleneck".to_string(),
                label: "瓶颈/限制".to_string(),
                field_type: worldsmith_core::schema::FieldType::Textarea,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "power".to_string(),
                label: "战力评估".to_string(),
                field_type: worldsmith_core::schema::FieldType::Textarea,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "culture".to_string(),
                label: "修炼文化".to_string(),
                field_type: worldsmith_core::schema::FieldType::Select,
                required: false,
                default_value: None,
                options: vec![
                    worldsmith_core::schema::SelectOption { value: "宗门".to_string(), label: "宗门".to_string() },
                    worldsmith_core::schema::SelectOption { value: "学院".to_string(), label: "学院".to_string() },
                    worldsmith_core::schema::SelectOption { value: "家族".to_string(), label: "家族".to_string() },
                    worldsmith_core::schema::SelectOption { value: "散修".to_string(), label: "散修".to_string() },
                    worldsmith_core::schema::SelectOption { value: "军旅".to_string(), label: "军旅".to_string() },
                    worldsmith_core::schema::SelectOption { value: "其他".to_string(), label: "其他".to_string() },
                ],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "tags".to_string(),
                label: "标签".to_string(),
                field_type: worldsmith_core::schema::FieldType::Tags,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
        ],
        relations: vec![
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "current_realm".to_string(),
                label: "当前境界".to_string(),
                source_types: vec!["combat_stat".to_string()],
                target_types: vec!["character".to_string()],
                directed: true,
            },
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "required_skill".to_string(),
                label: "所需技能".to_string(),
                source_types: vec!["combat_stat".to_string()],
                target_types: vec!["magic".to_string()],
                directed: true,
            },
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "training_ground".to_string(),
                label: "修炼地".to_string(),
                source_types: vec!["combat_stat".to_string()],
                target_types: vec!["region".to_string()],
                directed: true,
            },
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "breakthrough_item".to_string(),
                label: "突破物品".to_string(),
                source_types: vec!["combat_stat".to_string()],
                target_types: vec!["item".to_string()],
                directed: true,
            },
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "racial_cap".to_string(),
                label: "种族上限".to_string(),
                source_types: vec!["combat_stat".to_string()],
                target_types: vec!["species".to_string()],
                directed: true,
            },
        ],
        validations: vec![],
        views: vec![worldsmith_core::schema::ViewDeclaration {
            view_type: worldsmith_core::schema::ViewType::List,
            config: serde_json::Value::Null,
            animation: None,
        }],
        icon_map: {
            let mut m = std::collections::HashMap::new();
            m.insert("修仙".to_string(), "🧘".to_string());
            m.insert("魔法".to_string(), "🔮".to_string());
            m.insert("武道".to_string(), "🥋".to_string());
            m.insert("异能".to_string(), "⚡".to_string());
            m.insert("科技".to_string(), "🔬".to_string());
            m.insert("混合".to_string(), "🌀".to_string());
            m
        },
        id_prefix: "cbt-".to_string(),
        plugin_id: Some("official.combat_stats".to_string()),
    }).unwrap();

    schema_reg.register(worldsmith_core::schema::EntityTypeSchema {
        type_key: "magic".to_string(),
        label: "技能".to_string(),
        icon: "🔮".to_string(),
        fields: vec![
            worldsmith_core::schema::FieldSchema {
                key: "name".to_string(),
                label: "名称".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: true,
                default_value: None,
                options: vec![],
                placeholder: Some("技能名称".to_string()),
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "description".to_string(),
                label: "描述".to_string(),
                field_type: worldsmith_core::schema::FieldType::Textarea,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: Some("简要描述".to_string()),
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "magicType".to_string(),
                label: "体系".to_string(),
                field_type: worldsmith_core::schema::FieldType::Select,
                required: false,
                default_value: None,
                options: vec![
                    worldsmith_core::schema::SelectOption { value: "元素魔法".to_string(), label: "元素魔法".to_string() },
                    worldsmith_core::schema::SelectOption { value: "心灵魔法".to_string(), label: "心灵魔法".to_string() },
                    worldsmith_core::schema::SelectOption { value: "神术/圣光".to_string(), label: "神术/圣光".to_string() },
                    worldsmith_core::schema::SelectOption { value: "黑魔法/诅咒".to_string(), label: "黑魔法/诅咒".to_string() },
                    worldsmith_core::schema::SelectOption { value: "自然魔法".to_string(), label: "自然魔法".to_string() },
                    worldsmith_core::schema::SelectOption { value: "符文/附魔".to_string(), label: "符文/附魔".to_string() },
                    worldsmith_core::schema::SelectOption { value: "炼金术".to_string(), label: "炼金术".to_string() },
                    worldsmith_core::schema::SelectOption { value: "武术/战技".to_string(), label: "武术/战技".to_string() },
                    worldsmith_core::schema::SelectOption { value: "科技/异能".to_string(), label: "科技/异能".to_string() },
                    worldsmith_core::schema::SelectOption { value: "通用".to_string(), label: "通用".to_string() },
                ],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "level".to_string(),
                label: "等级/阶位".to_string(),
                field_type: worldsmith_core::schema::FieldType::Select,
                required: false,
                default_value: None,
                options: vec![
                    worldsmith_core::schema::SelectOption { value: "入门".to_string(), label: "入门".to_string() },
                    worldsmith_core::schema::SelectOption { value: "初级".to_string(), label: "初级".to_string() },
                    worldsmith_core::schema::SelectOption { value: "中级".to_string(), label: "中级".to_string() },
                    worldsmith_core::schema::SelectOption { value: "高级".to_string(), label: "高级".to_string() },
                    worldsmith_core::schema::SelectOption { value: "大师".to_string(), label: "大师".to_string() },
                    worldsmith_core::schema::SelectOption { value: "传说".to_string(), label: "传说".to_string() },
                    worldsmith_core::schema::SelectOption { value: "神级".to_string(), label: "神级".to_string() },
                ],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "cost".to_string(),
                label: "消耗".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: Some("魔力/体力/材料".to_string()),
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "castingTime".to_string(),
                label: "施法时间".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "range".to_string(),
                label: "范围/射程".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "duration".to_string(),
                label: "持续时间".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "effect".to_string(),
                label: "效果描述".to_string(),
                field_type: worldsmith_core::schema::FieldType::Textarea,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "requirements".to_string(),
                label: "学习条件".to_string(),
                field_type: worldsmith_core::schema::FieldType::Textarea,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "tags".to_string(),
                label: "标签".to_string(),
                field_type: worldsmith_core::schema::FieldType::Tags,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
        ],
        relations: vec![
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "mastered_by".to_string(),
                label: "掌握者".to_string(),
                source_types: vec!["magic".to_string()],
                target_types: vec!["character".to_string()],
                directed: true,
            },
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "racial_ability".to_string(),
                label: "种族天赋".to_string(),
                source_types: vec!["magic".to_string()],
                target_types: vec!["species".to_string()],
                directed: true,
            },
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "requires_item".to_string(),
                label: "所需物品".to_string(),
                source_types: vec!["magic".to_string()],
                target_types: vec!["item".to_string()],
                directed: true,
            },
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "based_on".to_string(),
                label: "基于概念".to_string(),
                source_types: vec!["magic".to_string()],
                target_types: vec!["concept".to_string()],
                directed: true,
            },
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "counters".to_string(),
                label: "克制".to_string(),
                source_types: vec!["magic".to_string()],
                target_types: vec!["magic".to_string()],
                directed: false,
            },
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "upgrades_to".to_string(),
                label: "进阶为".to_string(),
                source_types: vec!["magic".to_string()],
                target_types: vec!["magic".to_string()],
                directed: true,
            },
        ],
        validations: vec![],
        views: vec![worldsmith_core::schema::ViewDeclaration {
            view_type: worldsmith_core::schema::ViewType::List,
            config: serde_json::Value::Null,
            animation: None,
        }],
        icon_map: {
            let mut m = std::collections::HashMap::new();
            m.insert("元素魔法".to_string(), "🔥".to_string());
            m.insert("心灵魔法".to_string(), "🧠".to_string());
            m.insert("神术/圣光".to_string(), "✨".to_string());
            m.insert("黑魔法/诅咒".to_string(), "💀".to_string());
            m.insert("自然魔法".to_string(), "🌿".to_string());
            m.insert("符文/附魔".to_string(), "🔣".to_string());
            m.insert("炼金术".to_string(), "⚗️".to_string());
            m.insert("武术/战技".to_string(), "🥋".to_string());
            m.insert("科技/异能".to_string(), "⚡".to_string());
            m.insert("通用".to_string(), "🔮".to_string());
            m
        },
        id_prefix: "mag-".to_string(),
        plugin_id: Some("official.magic".to_string()),
    }).unwrap();

    schema_reg.register(worldsmith_core::schema::EntityTypeSchema {
        type_key: "plant".to_string(),
        label: "植物".to_string(),
        icon: "🌿".to_string(),
        fields: vec![
            worldsmith_core::schema::FieldSchema {
                key: "name".to_string(),
                label: "名称".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: true,
                default_value: None,
                options: vec![],
                placeholder: Some("植物名称".to_string()),
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "description".to_string(),
                label: "描述".to_string(),
                field_type: worldsmith_core::schema::FieldType::Textarea,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: Some("简要描述".to_string()),
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "plantType".to_string(),
                label: "类型".to_string(),
                field_type: worldsmith_core::schema::FieldType::Select,
                required: false,
                default_value: None,
                options: vec![
                    worldsmith_core::schema::SelectOption { value: "树木".to_string(), label: "树木".to_string() },
                    worldsmith_core::schema::SelectOption { value: "花卉".to_string(), label: "花卉".to_string() },
                    worldsmith_core::schema::SelectOption { value: "草药".to_string(), label: "草药".to_string() },
                    worldsmith_core::schema::SelectOption { value: "藤蔓".to_string(), label: "藤蔓".to_string() },
                    worldsmith_core::schema::SelectOption { value: "菌类".to_string(), label: "菌类".to_string() },
                    worldsmith_core::schema::SelectOption { value: "苔藓".to_string(), label: "苔藓".to_string() },
                    worldsmith_core::schema::SelectOption { value: "水生植物".to_string(), label: "水生植物".to_string() },
                    worldsmith_core::schema::SelectOption { value: "食肉植物".to_string(), label: "食肉植物".to_string() },
                    worldsmith_core::schema::SelectOption { value: "魔法植物".to_string(), label: "魔法植物".to_string() },
                    worldsmith_core::schema::SelectOption { value: "其他".to_string(), label: "其他".to_string() },
                ],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "habitat".to_string(),
                label: "栖息地".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "rarity".to_string(),
                label: "稀有度".to_string(),
                field_type: worldsmith_core::schema::FieldType::Select,
                required: false,
                default_value: None,
                options: vec![
                    worldsmith_core::schema::SelectOption { value: "常见".to_string(), label: "常见".to_string() },
                    worldsmith_core::schema::SelectOption { value: "少见".to_string(), label: "少见".to_string() },
                    worldsmith_core::schema::SelectOption { value: "稀有".to_string(), label: "稀有".to_string() },
                    worldsmith_core::schema::SelectOption { value: "极稀有".to_string(), label: "极稀有".to_string() },
                    worldsmith_core::schema::SelectOption { value: "传说".to_string(), label: "传说".to_string() },
                    worldsmith_core::schema::SelectOption { value: "已灭绝".to_string(), label: "已灭绝".to_string() },
                ],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "usage".to_string(),
                label: "用途".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "appearance".to_string(),
                label: "外观特征".to_string(),
                field_type: worldsmith_core::schema::FieldType::Textarea,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "toxicity".to_string(),
                label: "毒性/危险".to_string(),
                field_type: worldsmith_core::schema::FieldType::Textarea,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "growthCycle".to_string(),
                label: "生长周期".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "relatedProducts".to_string(),
                label: "相关产物".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "tags".to_string(),
                label: "标签".to_string(),
                field_type: worldsmith_core::schema::FieldType::Tags,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
        ],
        relations: vec![
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "native_to".to_string(),
                label: "原产于".to_string(),
                source_types: vec!["plant".to_string()],
                target_types: vec!["region".to_string()],
                directed: true,
            },
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "materials_from".to_string(),
                label: "产出材料".to_string(),
                source_types: vec!["plant".to_string()],
                target_types: vec!["item".to_string()],
                directed: true,
            },
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "used_by".to_string(),
                label: "被使用于".to_string(),
                source_types: vec!["plant".to_string()],
                target_types: vec!["species".to_string(), "character".to_string()],
                directed: true,
            },
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "magic_material".to_string(),
                label: "魔法材料".to_string(),
                source_types: vec!["plant".to_string()],
                target_types: vec!["magic".to_string()],
                directed: true,
            },
        ],
        validations: vec![],
        views: vec![worldsmith_core::schema::ViewDeclaration {
            view_type: worldsmith_core::schema::ViewType::List,
            config: serde_json::Value::Null,
            animation: None,
        }],
        icon_map: {
            let mut m = std::collections::HashMap::new();
            m.insert("树木".to_string(), "🌳".to_string());
            m.insert("花卉".to_string(), "🌸".to_string());
            m.insert("草药".to_string(), "🌿".to_string());
            m.insert("藤蔓".to_string(), "🍃".to_string());
            m.insert("菌类".to_string(), "🍄".to_string());
            m.insert("苔藓".to_string(), "🌱".to_string());
            m.insert("水生植物".to_string(), "🌊".to_string());
            m.insert("食肉植物".to_string(), "🪴".to_string());
            m.insert("魔法植物".to_string(), "✨".to_string());
            m
        },
        id_prefix: "plt-".to_string(),
        plugin_id: Some("official.plants".to_string()),
    }).unwrap();

    schema_reg.register(worldsmith_core::schema::EntityTypeSchema {
        type_key: "building".to_string(),
        label: "建筑".to_string(),
        icon: "🏛".to_string(),
        fields: vec![
            worldsmith_core::schema::FieldSchema {
                key: "name".to_string(),
                label: "名称".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: true,
                default_value: None,
                options: vec![],
                placeholder: Some("建筑名称".to_string()),
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "description".to_string(),
                label: "描述".to_string(),
                field_type: worldsmith_core::schema::FieldType::Textarea,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: Some("简要描述".to_string()),
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "buildingType".to_string(),
                label: "建筑类型".to_string(),
                field_type: worldsmith_core::schema::FieldType::Select,
                required: false,
                default_value: None,
                options: vec![
                    worldsmith_core::schema::SelectOption { value: "宫殿/城堡".to_string(), label: "宫殿/城堡".to_string() },
                    worldsmith_core::schema::SelectOption { value: "塔楼/堡垒".to_string(), label: "塔楼/堡垒".to_string() },
                    worldsmith_core::schema::SelectOption { value: "寺庙/教堂".to_string(), label: "寺庙/教堂".to_string() },
                    worldsmith_core::schema::SelectOption { value: "住宅/民居".to_string(), label: "住宅/民居".to_string() },
                    worldsmith_core::schema::SelectOption { value: "商店/市场".to_string(), label: "商店/市场".to_string() },
                    worldsmith_core::schema::SelectOption { value: "学校/学院".to_string(), label: "学校/学院".to_string() },
                    worldsmith_core::schema::SelectOption { value: "工厂/工坊".to_string(), label: "工厂/工坊".to_string() },
                    worldsmith_core::schema::SelectOption { value: "地牢/监狱".to_string(), label: "地牢/监狱".to_string() },
                    worldsmith_core::schema::SelectOption { value: "桥梁/道路".to_string(), label: "桥梁/道路".to_string() },
                    worldsmith_core::schema::SelectOption { value: "奇观/遗迹".to_string(), label: "奇观/遗迹".to_string() },
                    worldsmith_core::schema::SelectOption { value: "其他".to_string(), label: "其他".to_string() },
                ],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "style".to_string(),
                label: "建筑风格".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "era".to_string(),
                label: "建造年代".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "location".to_string(),
                label: "所在区域".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "floors".to_string(),
                label: "层数/规模".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "material".to_string(),
                label: "主要材料".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "owner".to_string(),
                label: "所有者".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "significance".to_string(),
                label: "文化意义".to_string(),
                field_type: worldsmith_core::schema::FieldType::Textarea,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "interior".to_string(),
                label: "内部布局".to_string(),
                field_type: worldsmith_core::schema::FieldType::Textarea,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "tags".to_string(),
                label: "标签".to_string(),
                field_type: worldsmith_core::schema::FieldType::Tags,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
        ],
        relations: vec![
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "located_in".to_string(),
                label: "位于".to_string(),
                source_types: vec!["building".to_string()],
                target_types: vec!["region".to_string()],
                directed: true,
            },
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "belongs_to".to_string(),
                label: "属于".to_string(),
                source_types: vec!["building".to_string()],
                target_types: vec!["organization".to_string()],
                directed: true,
            },
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "owned_by".to_string(),
                label: "拥有者".to_string(),
                source_types: vec!["building".to_string()],
                target_types: vec!["character".to_string()],
                directed: true,
            },
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "resident".to_string(),
                label: "居住者".to_string(),
                source_types: vec!["building".to_string()],
                target_types: vec!["character".to_string()],
                directed: true,
            },
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "contains".to_string(),
                label: "包含".to_string(),
                source_types: vec!["building".to_string()],
                target_types: vec!["building".to_string()],
                directed: true,
            },
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "connected_to".to_string(),
                label: "连接至".to_string(),
                source_types: vec!["building".to_string()],
                target_types: vec!["building".to_string()],
                directed: false,
            },
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "stored_at".to_string(),
                label: "存放于".to_string(),
                source_types: vec!["building".to_string()],
                target_types: vec!["item".to_string()],
                directed: true,
            },
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "event_location".to_string(),
                label: "事件地点".to_string(),
                source_types: vec!["building".to_string()],
                target_types: vec!["event".to_string()],
                directed: true,
            },
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "managed_by".to_string(),
                label: "管理者".to_string(),
                source_types: vec!["building".to_string()],
                target_types: vec!["character".to_string(), "organization".to_string()],
                directed: true,
            },
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "famous_for".to_string(),
                label: "著名于".to_string(),
                source_types: vec!["building".to_string()],
                target_types: vec!["item".to_string(), "concept".to_string(), "character".to_string()],
                directed: true,
            },
        ],
        validations: vec![],
        views: vec![worldsmith_core::schema::ViewDeclaration {
            view_type: worldsmith_core::schema::ViewType::List,
            config: serde_json::Value::Null,
            animation: None,
        }],
        icon_map: {
            let mut m = std::collections::HashMap::new();
            m.insert("宫殿/城堡".to_string(), "🏰".to_string());
            m.insert("塔楼/堡垒".to_string(), "🏯".to_string());
            m.insert("寺庙/教堂".to_string(), "⛪".to_string());
            m.insert("住宅/民居".to_string(), "🏠".to_string());
            m.insert("商店/市场".to_string(), "🏪".to_string());
            m.insert("学校/学院".to_string(), "🏫".to_string());
            m.insert("工厂/工坊".to_string(), "🏭".to_string());
            m.insert("地牢/监狱".to_string(), "🏚️".to_string());
            m.insert("桥梁/道路".to_string(), "🌉".to_string());
            m.insert("奇观/遗迹".to_string(), "🏛️".to_string());
            m
        },
        id_prefix: "bld-".to_string(),
        plugin_id: Some("official.buildings".to_string()),
    }).unwrap();

    schema_reg.register(worldsmith_core::schema::EntityTypeSchema {
        type_key: "language".to_string(),
        label: "语言".to_string(),
        icon: "🔤".to_string(),
        fields: vec![
            worldsmith_core::schema::FieldSchema {
                key: "name".to_string(),
                label: "名称".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: true,
                default_value: None,
                options: vec![],
                placeholder: Some("语言名称".to_string()),
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "description".to_string(),
                label: "描述".to_string(),
                field_type: worldsmith_core::schema::FieldType::Textarea,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: Some("简要描述".to_string()),
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "langType".to_string(),
                label: "语言类型".to_string(),
                field_type: worldsmith_core::schema::FieldType::Select,
                required: false,
                default_value: None,
                options: vec![
                    worldsmith_core::schema::SelectOption { value: "自然语言".to_string(), label: "自然语言".to_string() },
                    worldsmith_core::schema::SelectOption { value: "魔法语言".to_string(), label: "魔法语言".to_string() },
                    worldsmith_core::schema::SelectOption { value: "古代语".to_string(), label: "古代语".to_string() },
                    worldsmith_core::schema::SelectOption { value: "方言".to_string(), label: "方言".to_string() },
                    worldsmith_core::schema::SelectOption { value: "手语".to_string(), label: "手语".to_string() },
                    worldsmith_core::schema::SelectOption { value: "密码/密文".to_string(), label: "密码/密文".to_string() },
                ],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "scriptType".to_string(),
                label: "文字类型".to_string(),
                field_type: worldsmith_core::schema::FieldType::Select,
                required: false,
                default_value: None,
                options: vec![
                    worldsmith_core::schema::SelectOption { value: "字母".to_string(), label: "字母".to_string() },
                    worldsmith_core::schema::SelectOption { value: "音节".to_string(), label: "音节".to_string() },
                    worldsmith_core::schema::SelectOption { value: "象形".to_string(), label: "象形".to_string() },
                    worldsmith_core::schema::SelectOption { value: "符文".to_string(), label: "符文".to_string() },
                    worldsmith_core::schema::SelectOption { value: "无文字".to_string(), label: "无文字".to_string() },
                ],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "languageFamily".to_string(),
                label: "语系".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "speakers".to_string(),
                label: "使用人群".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "grammar".to_string(),
                label: "语法特点".to_string(),
                field_type: worldsmith_core::schema::FieldType::Textarea,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "sample".to_string(),
                label: "示例文本".to_string(),
                field_type: worldsmith_core::schema::FieldType::Textarea,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "tags".to_string(),
                label: "标签".to_string(),
                field_type: worldsmith_core::schema::FieldType::Tags,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
        ],
        relations: vec![
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "spoken_by".to_string(),
                label: "使用者".to_string(),
                source_types: vec!["language".to_string()],
                target_types: vec!["species".to_string(), "character".to_string()],
                directed: true,
            },
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "spoken_in".to_string(),
                label: "使用地区".to_string(),
                source_types: vec!["language".to_string()],
                target_types: vec!["region".to_string()],
                directed: true,
            },
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "language_branch".to_string(),
                label: "语支".to_string(),
                source_types: vec!["language".to_string()],
                target_types: vec!["language".to_string()],
                directed: true,
            },
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "related_language".to_string(),
                label: "相关语言".to_string(),
                source_types: vec!["language".to_string()],
                target_types: vec!["language".to_string()],
                directed: false,
            },
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "script_used_in".to_string(),
                label: "文字用于".to_string(),
                source_types: vec!["language".to_string()],
                target_types: vec!["concept".to_string()],
                directed: true,
            },
        ],
        validations: vec![],
        views: vec![worldsmith_core::schema::ViewDeclaration {
            view_type: worldsmith_core::schema::ViewType::List,
            config: serde_json::Value::Null,
            animation: None,
        }],
        icon_map: {
            let mut m = std::collections::HashMap::new();
            m.insert("自然语言".to_string(), "🗣️".to_string());
            m.insert("魔法语言".to_string(), "✨".to_string());
            m.insert("古代语".to_string(), "📜".to_string());
            m.insert("方言".to_string(), "💬".to_string());
            m.insert("手语".to_string(), "🤟".to_string());
            m.insert("密码/密文".to_string(), "🔐".to_string());
            m
        },
        id_prefix: "lang-".to_string(),
        plugin_id: Some("official.languages".to_string()),
    }).unwrap();

    schema_reg.register(worldsmith_core::schema::EntityTypeSchema {
        type_key: "culture".to_string(),
        label: "文化".to_string(),
        icon: "🎭".to_string(),
        fields: vec![
            worldsmith_core::schema::FieldSchema {
                key: "name".to_string(),
                label: "名称".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: true,
                default_value: None,
                options: vec![],
                placeholder: Some("文化名称".to_string()),
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "description".to_string(),
                label: "描述".to_string(),
                field_type: worldsmith_core::schema::FieldType::Textarea,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: Some("简要描述".to_string()),
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "cultureType".to_string(),
                label: "类型".to_string(),
                field_type: worldsmith_core::schema::FieldType::Select,
                required: false,
                default_value: None,
                options: vec![
                    worldsmith_core::schema::SelectOption { value: "节日庆典".to_string(), label: "节日庆典".to_string() },
                    worldsmith_core::schema::SelectOption { value: "宗教仪式".to_string(), label: "宗教仪式".to_string() },
                    worldsmith_core::schema::SelectOption { value: "风俗习惯".to_string(), label: "风俗习惯".to_string() },
                    worldsmith_core::schema::SelectOption { value: "艺术流派".to_string(), label: "艺术流派".to_string() },
                    worldsmith_core::schema::SelectOption { value: "饮食文化".to_string(), label: "饮食文化".to_string() },
                    worldsmith_core::schema::SelectOption { value: "服饰传统".to_string(), label: "服饰传统".to_string() },
                    worldsmith_core::schema::SelectOption { value: "社交礼仪".to_string(), label: "社交礼仪".to_string() },
                    worldsmith_core::schema::SelectOption { value: "丧葬习俗".to_string(), label: "丧葬习俗".to_string() },
                    worldsmith_core::schema::SelectOption { value: "其他".to_string(), label: "其他".to_string() },
                ],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "cycle".to_string(),
                label: "周期/频率".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "origin".to_string(),
                label: "起源".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "participants".to_string(),
                label: "参与者".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "significance".to_string(),
                label: "意义/象征".to_string(),
                field_type: worldsmith_core::schema::FieldType::Textarea,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "practices".to_string(),
                label: "仪式/做法".to_string(),
                field_type: worldsmith_core::schema::FieldType::Textarea,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "tags".to_string(),
                label: "标签".to_string(),
                field_type: worldsmith_core::schema::FieldType::Tags,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
        ],
        relations: vec![
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "practiced_in".to_string(),
                label: "流行于".to_string(),
                source_types: vec!["culture".to_string()],
                target_types: vec!["region".to_string()],
                directed: true,
            },
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "practiced_by".to_string(),
                label: "实践者".to_string(),
                source_types: vec!["culture".to_string()],
                target_types: vec!["species".to_string()],
                directed: true,
            },
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "promoted_by".to_string(),
                label: "推广者".to_string(),
                source_types: vec!["culture".to_string()],
                target_types: vec!["organization".to_string()],
                directed: true,
            },
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "origin_event".to_string(),
                label: "起源事件".to_string(),
                source_types: vec!["culture".to_string()],
                target_types: vec!["event".to_string()],
                directed: true,
            },
        ],
        validations: vec![],
        views: vec![worldsmith_core::schema::ViewDeclaration {
            view_type: worldsmith_core::schema::ViewType::List,
            config: serde_json::Value::Null,
            animation: None,
        }],
        icon_map: {
            let mut m = std::collections::HashMap::new();
            m.insert("节日庆典".to_string(), "🎉".to_string());
            m.insert("宗教仪式".to_string(), "🙏".to_string());
            m.insert("风俗习惯".to_string(), "🏮".to_string());
            m.insert("艺术流派".to_string(), "🎨".to_string());
            m.insert("饮食文化".to_string(), "🍜".to_string());
            m.insert("服饰传统".to_string(), "👘".to_string());
            m.insert("社交礼仪".to_string(), "🤝".to_string());
            m.insert("丧葬习俗".to_string(), "🕯".to_string());
            m
        },
        id_prefix: "cul-".to_string(),
        plugin_id: Some("official.culture".to_string()),
    }).unwrap();

    schema_reg.register(worldsmith_core::schema::EntityTypeSchema {
        type_key: "conflict".to_string(),
        label: "冲突".to_string(),
        icon: "⚔️".to_string(),
        fields: vec![
            worldsmith_core::schema::FieldSchema {
                key: "name".to_string(),
                label: "名称".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: true,
                default_value: None,
                options: vec![],
                placeholder: Some("冲突名称".to_string()),
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "description".to_string(),
                label: "描述".to_string(),
                field_type: worldsmith_core::schema::FieldType::Textarea,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: Some("简要描述".to_string()),
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "conflictType".to_string(),
                label: "冲突类型".to_string(),
                field_type: worldsmith_core::schema::FieldType::Select,
                required: false,
                default_value: None,
                options: vec![
                    worldsmith_core::schema::SelectOption { value: "战争".to_string(), label: "战争".to_string() },
                    worldsmith_core::schema::SelectOption { value: "政治斗争".to_string(), label: "政治斗争".to_string() },
                    worldsmith_core::schema::SelectOption { value: "宗教冲突".to_string(), label: "宗教冲突".to_string() },
                    worldsmith_core::schema::SelectOption { value: "贸易战".to_string(), label: "贸易战".to_string() },
                    worldsmith_core::schema::SelectOption { value: "内战".to_string(), label: "内战".to_string() },
                    worldsmith_core::schema::SelectOption { value: "边境摩擦".to_string(), label: "边境摩擦".to_string() },
                ],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "scale".to_string(),
                label: "规模".to_string(),
                field_type: worldsmith_core::schema::FieldType::Select,
                required: false,
                default_value: None,
                options: vec![
                    worldsmith_core::schema::SelectOption { value: "局部".to_string(), label: "局部".to_string() },
                    worldsmith_core::schema::SelectOption { value: "区域".to_string(), label: "区域".to_string() },
                    worldsmith_core::schema::SelectOption { value: "大陆级".to_string(), label: "大陆级".to_string() },
                    worldsmith_core::schema::SelectOption { value: "世界级".to_string(), label: "世界级".to_string() },
                ],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "startDate".to_string(),
                label: "开始时间".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "endDate".to_string(),
                label: "结束时间".to_string(),
                field_type: worldsmith_core::schema::FieldType::Text,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "cause".to_string(),
                label: "起因".to_string(),
                field_type: worldsmith_core::schema::FieldType::Textarea,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "outcome".to_string(),
                label: "结果".to_string(),
                field_type: worldsmith_core::schema::FieldType::Textarea,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
            worldsmith_core::schema::FieldSchema {
                key: "tags".to_string(),
                label: "标签".to_string(),
                field_type: worldsmith_core::schema::FieldType::Tags,
                required: false,
                default_value: None,
                options: vec![],
                placeholder: None,
                ref_type: None,
                auto_link: None,
                animation: None,
            },
        ],
        relations: vec![
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "participant_force".to_string(),
                label: "参战势力".to_string(),
                source_types: vec!["conflict".to_string()],
                target_types: vec!["organization".to_string()],
                directed: true,
            },
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "participant_commander".to_string(),
                label: "指挥者".to_string(),
                source_types: vec!["conflict".to_string()],
                target_types: vec!["character".to_string()],
                directed: true,
            },
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "battlefield".to_string(),
                label: "战场".to_string(),
                source_types: vec!["conflict".to_string()],
                target_types: vec!["region".to_string()],
                directed: true,
            },
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "related_event".to_string(),
                label: "相关事件".to_string(),
                source_types: vec!["conflict".to_string()],
                target_types: vec!["event".to_string()],
                directed: true,
            },
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "legendary_item".to_string(),
                label: "传说物品".to_string(),
                source_types: vec!["conflict".to_string()],
                target_types: vec!["item".to_string()],
                directed: true,
            },
            worldsmith_core::schema::RelationTypeSchema {
                type_key: "sub_conflict".to_string(),
                label: "子冲突".to_string(),
                source_types: vec!["conflict".to_string()],
                target_types: vec!["conflict".to_string()],
                directed: true,
            },
        ],
        validations: vec![],
        views: vec![worldsmith_core::schema::ViewDeclaration {
            view_type: worldsmith_core::schema::ViewType::List,
            config: serde_json::Value::Null,
            animation: None,
        }],
        icon_map: {
            let mut m = std::collections::HashMap::new();
            m.insert("战争".to_string(), "⚔️".to_string());
            m.insert("政治斗争".to_string(), "🏛️".to_string());
            m.insert("宗教冲突".to_string(), "⛪".to_string());
            m.insert("贸易战".to_string(), "💰".to_string());
            m.insert("内战".to_string(), "💥".to_string());
            m.insert("边境摩擦".to_string(), "🗺️".to_string());
            m
        },
        id_prefix: "war-".to_string(),
        plugin_id: Some("official.conflict".to_string()),
    }).unwrap();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            db: Mutex::new(db),
            retrofit: Mutex::new(RetrofitEngine::new()),
            spatial: Mutex::new(SpatialIndex::new()),
            schema: Mutex::new(schema_reg),
            mcp_processes: Mutex::new(std::collections::HashMap::new()),
            pty_processes: Mutex::new(std::collections::HashMap::new()),
            wf_engine: std::sync::Arc::new(crate::workflow::engine::WorkflowEngine::new()),
            wf_db_path: Mutex::new(String::new()),
            plugin_node_metas: Mutex::new(std::collections::HashMap::new()),
            dispatcher_registry: std::sync::Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
        })
        .invoke_handler(tauri::generate_handler![
            cmd_init_db,
            cmd_put_entity,
            cmd_get_entity,
            cmd_get_all_entities,
            cmd_get_entities_by_type,
            cmd_update_entity,
            cmd_delete_entity,
            cmd_count_entities_by_type,
            cmd_put_relation,
            cmd_get_all_relations,
            cmd_get_relations_by_entity,
            cmd_delete_relation,
            cmd_delete_relations_by_entity,
            cmd_import_entities,
            cmd_import_relations,
            cmd_update_relation,
            cmd_clear_entities,
            cmd_clear_relations,
            cmd_kv_get,
            cmd_kv_set,
            cmd_kv_get_all,
            cmd_validate_entity,
            cmd_validate_entities,
            cmd_validate_pack,
            cmd_check_references,
            cmd_migrate,
            cmd_run_diagnostics,
            cmd_check_storage_health,
            cmd_validate_plugin_manifest,
            cmd_check_plugin_health,
            cmd_retrofit_begin_session,
            cmd_retrofit_submit_intent,
            cmd_retrofit_confirm_and_stage,
            cmd_retrofit_apply_next,
            cmd_retrofit_verify_and_accept,
            cmd_retrofit_request_repair,
            cmd_retrofit_redirect,
            cmd_retrofit_rollback_last,
            cmd_retrofit_abort,
            cmd_retrofit_session_phase,
            cmd_retrofit_patch_diff,
            cmd_retrofit_patch_apply,
            cmd_retrofit_detect_conflicts,
            cmd_retrofit_end_session,
            cmd_spatial_insert_rect,
            cmd_spatial_insert_point,
            cmd_spatial_query_range,
            cmd_spatial_query_at_point,
            cmd_spatial_nearest_point,
            cmd_spatial_k_nearest,
            cmd_spatial_query_by_category,
            cmd_spatial_remove_rect,
            cmd_spatial_clear,
            cmd_spatial_counts,
            cmd_algo_segment_intersect,
            cmd_algo_segment_intersection_point,
            cmd_algo_find_all_intersections,
            cmd_algo_point_in_polygon,
            cmd_algo_polygon_area,
            cmd_algo_polygon_centroid,
            cmd_algo_convex_hull,
            cmd_algo_aabb_intersects,
            cmd_algo_obb_intersects,
            cmd_algo_dijkstra,
            cmd_algo_dijkstra_path,
            cmd_algo_astar,
            cmd_algo_k_shortest_paths,
            cmd_algo_topological_sort,
            cmd_algo_connected_components,
            cmd_algo_tarjan_scc,
            cmd_algo_find_dangling,
            cmd_algo_force_layout,
            cmd_algo_crdt_lww_new,
            cmd_algo_crdt_lww_set,
            cmd_algo_crdt_lww_merge,
            cmd_algo_crdt_orset_new,
            cmd_algo_crdt_orset_add,
            cmd_algo_crdt_orset_remove,
            cmd_algo_crdt_orset_merge,
            cmd_algo_crdt_orset_elements,
            cmd_algo_crdt_rga_new,
            cmd_algo_crdt_rga_insert,
            cmd_algo_crdt_rga_delete,
            cmd_algo_crdt_rga_merge,
            cmd_algo_crdt_rga_text,
            cmd_algo_crdt_vc_compare,
            cmd_algo_terrain_noise,
            cmd_algo_terrain_heightmap_generate,
            cmd_algo_terrain_heightmap_slope,
            cmd_algo_terrain_heightmap_aspect,
            cmd_algo_terrain_marching_squares,
            cmd_algo_constraint_solve,
            cmd_algo_dxf_parse,
            cmd_algo_dxf_generate,
            cmd_algo_dxf_extract_constraints,
            cmd_algo_polygon_boolean,
            cmd_algo_polygon_offset,
            cmd_algo_polygon_simplify,
            cmd_algo_line_length,
            cmd_algo_pagerank,
            cmd_algo_community_detection,
            cmd_algo_betweenness_centrality,
            cmd_algo_hydraulic_erosion,
            cmd_algo_viewshed,
            cmd_algo_chaikin_smooth,
            cmd_algo_find_shared_edges,
            cmd_algo_find_line_polygon_intersections,
            cmd_algo_polygon_split,
            cmd_algo_polygon_augment,
            cmd_schema_register_entity_type,
            cmd_schema_unregister_entity_type,
            cmd_schema_get_entity_type,
            cmd_schema_list_entity_types,
            cmd_schema_update_entity_type,
            cmd_schema_register_validation,
            cmd_schema_register_view,
            cmd_mcp_spawn,
            cmd_mcp_kill,
            cmd_mcp_list,
            cmd_font_scan_system,
            cmd_font_read_file,
            // ─── workflow plugin (Phase 1) ─────────────────────────────
            crate::workflow::commands::definitions::workflow_list,
            crate::workflow::commands::definitions::workflow_get,
            crate::workflow::commands::definitions::workflow_create,
            crate::workflow::commands::definitions::workflow_update,
            crate::workflow::commands::definitions::workflow_delete,
            crate::workflow::commands::definitions::workflow_export,
            crate::workflow::commands::definitions::workflow_import,
            crate::workflow::commands::node_meta::workflow_list_node_types,
            crate::workflow::commands::node_meta::workflow_get_node_schema,
            crate::workflow::commands::node_meta::workflow_register_node_type,
            crate::workflow::commands::node_meta::workflow_unregister_node_type,
            crate::workflow::commands::dry_run::workflow_dry_run,
            crate::workflow::commands::runs::workflow_run,
            crate::workflow::commands::runs::workflow_run_sync,
            crate::workflow::commands::runs::workflow_pause,
            crate::workflow::commands::runs::workflow_resume,
            crate::workflow::commands::runs::workflow_cancel,
            crate::workflow::commands::runs::workflow_skip_to,
            crate::workflow::commands::runs::workflow_status,
            crate::workflow::commands::runs::workflow_list_runs,
            crate::workflow::commands::runs::workflow_get_run,
            crate::workflow::commands::dispatch::workflow_node_result,
            crate::workflow::commands::dispatch::workflow_node_heartbeat,
            crate::workflow::commands::dispatch::workflow_node_cancel_ack,
            crate::workflow::commands::settings::workflow_get_setting,
            crate::workflow::commands::settings::workflow_set_setting,
            crate::workflow::commands::settings::workflow_purge_runs_now,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
