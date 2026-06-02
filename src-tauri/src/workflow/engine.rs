//! 工作流引擎：活跃 runs + cancel 信号的内存索引
//!
//! 设计要点：
//!   * 持久化权威在 `worldsmith-core::storage::workflow::WorkflowStore`（Sqlite）
//!   * `WorkflowEngine` 只持热缓存：`runs` + `cancel`
//!   * API 全部 sync，store 通过 `&SqliteStore` 传入 — 调用方在锁内调，避免持锁跨 await
//!
//! 阶段路线：
//!   * 2.1 (本 Task)：单例 + state map + 启动清理 pending_dispatches
//!   * 2.2：WorkflowExecutor 6 组件
//!   * 2.4：NodeDispatcher 双协议
//!   * 2.6：start() 真正 spawn executor task

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use rusqlite::params;
use serde::Serialize;
use serde_json::Value;
use worldsmith_core::error::CoreError;
use worldsmith_core::storage::sqlite::SqliteStore;
use worldsmith_core::storage::workflow::WorkflowStore;
use worldsmith_core::workflow::types::WorkflowDefinition;

use crate::workflow::error::WorkflowError;

const STALE_PENDING_TTL_MS: i64 = 60_000; // 60s
const ACTIVE_STATUSES: &[&str] = &["running", "paused"];

/// 引擎 view 出来的运行状态
#[derive(Debug, Clone, Serialize)]
pub struct RunStatus {
    pub run_id: String,
    pub workflow_id: String,
    pub workflow_version: u32,
    pub status: String,
    pub current_node_id: Option<String>,
    pub started_at: i64,
    pub completed_at: Option<i64>,
    pub error: Option<String>,
}

/// 内存中的活跃 run 句柄
#[derive(Debug, Clone)]
pub struct RunHandle {
    pub run_id: String,
    pub workflow_id: String,
    pub workflow_version: u32,
    pub started_at: i64,
}

/// 工作流引擎（应用单例）
pub struct WorkflowEngine {
    runs: std::sync::Mutex<HashMap<String, RunHandle>>,
    cancel: std::sync::Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl Default for WorkflowEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl WorkflowEngine {
    pub fn new() -> Self {
        Self {
            runs: std::sync::Mutex::new(HashMap::new()),
            cancel: std::sync::Mutex::new(HashMap::new()),
        }
    }

    /// 启动一次运行：写库 + 内存登记 + 注册 cancel signal
    pub fn start(
        &self,
        store: &SqliteStore,
        def: &WorkflowDefinition,
        params: Value,
        triggered_by: &str,
    ) -> Result<String, WorkflowError> {
        let now = now_ms();
        let run_id = store
            .with_conn(|c| {
                WorkflowStore::new(c)
                    .create_run(&def.id, def.version, triggered_by, params)
            })
            .map_err(WorkflowError::from)?;

        self.runs
            .lock()
            .map_err(|e| WorkflowError::InternalError(format!("runs lock poisoned: {e}")))?
            .insert(
                run_id.clone(),
                RunHandle {
                    run_id: run_id.clone(),
                    workflow_id: def.id.clone(),
                    workflow_version: def.version,
                    started_at: now,
                },
            );

        self.cancel
            .lock()
            .map_err(|e| WorkflowError::InternalError(format!("cancel lock poisoned: {e}")))?
            .insert(run_id.clone(), Arc::new(AtomicBool::new(false)));

        Ok(run_id)
    }

    /// 启动一次运行并 spawn executor 跑。
    ///
    /// `store_factory` 必须在新线程内能调（用于开一个独立的 Sqlite 连接，避免跨线程锁）。
    /// 典型实现：`|| SqliteStore::open(db_path)`
    ///
    /// `app` 是可选的 Tauri AppHandle，用于发进度 event；测试时传 None。
    ///
    /// `registry` 是派发注册表（与 AppState 共享同一 Arc），让 callback 能反查到 dispatch handle。
    ///
    /// 返回 run_id（executor 在后台跑，不阻塞）。
    pub fn start_executor<F>(
        self: &Arc<Self>,
        store: &SqliteStore,
        def: WorkflowDefinition,
        params: Value,
        triggered_by: &str,
        store_factory: F,
        app: Option<tauri::AppHandle>,
        registry: Arc<Mutex<std::collections::HashMap<String, Arc<crate::workflow::executor::DispatchHandle>>>>,
    ) -> Result<String, WorkflowError>
    where
        F: FnOnce() -> SqliteStore + Send + 'static,
    {
        // 1. 注册 run + cancel signal
        let run_id = self.start(store, &def, params, triggered_by)?;
        let cancel_signal = self
            .cancel_signal(&run_id)
            .ok_or_else(|| WorkflowError::InternalError("cancel signal 缺失".to_string()))?;
        let engine_arc = Arc::clone(self);
        let run_id_for_thread = run_id.clone();
        let registry_for_thread = registry;

        // 2. spawn executor 线程
        std::thread::Builder::new()
            .name(format!("wf-executor-{run_id}"))
            .spawn(move || {
                let store = store_factory();
                let executor = crate::workflow::executor::WorkflowExecutor::new(
                    store,
                    engine_arc.clone(),
                    app,
                    registry_for_thread,
                );
                // run 内部失败会 finalize；成功也走 finalize
                if let Err(e) = executor.run(&def, &run_id_for_thread, cancel_signal) {
                    eprintln!("[workflow executor {run_id_for_thread}] 失败: {e}");
                }
            })
            .map_err(|e| {
                WorkflowError::InternalError(format!("spawn executor 失败: {e}"))
            })?;

        Ok(run_id)
    }

    /// 取运行状态。内存有 run_id 但 status 是终态时优先回 store（防止内存 stale）
    pub fn get_status(&self, store: &SqliteStore, run_id: &str) -> Option<RunStatus> {
        let result: Result<Option<RunStatus>, CoreError> = store.with_conn(|c| {
            let ws = WorkflowStore::new(c);
            let summary = ws.get_run(run_id).ok();
            Ok(summary.map(|s| RunStatus {
                run_id: s.run_id,
                workflow_id: s.workflow_id,
                workflow_version: s.workflow_version,
                status: s.status,
                current_node_id: None, // Phase 2.4 由 dispatcher 写入
                started_at: s.started_at,
                completed_at: s.completed_at,
                error: s.error,
            }))
        });
        result.ok().flatten()
    }

    /// 列出内存中的活跃 run_id
    pub fn list_active(&self) -> Result<Vec<String>, WorkflowError> {
        Ok(self
            .runs
            .lock()
            .map_err(|e| WorkflowError::InternalError(e.to_string()))?
            .keys()
            .cloned()
            .collect())
    }

    /// 申请 cancel signal。Phase 2.4 dispatcher 会 poll 这个标志
    pub fn cancel_signal(&self, run_id: &str) -> Option<Arc<AtomicBool>> {
        self.cancel.lock().ok()?.get(run_id).cloned()
    }

    /// 触发 cancel（设置 flag）
    pub fn request_cancel(&self, run_id: &str) -> Result<bool, WorkflowError> {
        let cancel = self
            .cancel
            .lock()
            .map_err(|e| WorkflowError::InternalError(e.to_string()))?;
        if let Some(flag) = cancel.get(run_id) {
            flag.store(true, Ordering::SeqCst);
            Ok(true)
        } else {
            Ok(false)
        }
    }

    /// 终态后清理内存索引
    pub fn finalize(&self, run_id: &str) {
        if let Ok(mut runs) = self.runs.lock() {
            runs.remove(run_id);
        }
        if let Ok(mut cancel) = self.cancel.lock() {
            cancel.remove(run_id);
        }
    }

    /// 启动时清理过期的 pending_dispatches（dispatched_at + TTL < now）
    /// 返回清理条数
    pub fn purge_stale_pending_dispatches(
        &self,
        store: &SqliteStore,
        ttl_ms: Option<i64>,
    ) -> Result<u32, WorkflowError> {
        let ttl = ttl_ms.unwrap_or(STALE_PENDING_TTL_MS);
        store
            .with_conn(|c| {
                let cutoff = now_ms() - ttl;
                let count = c
                    .execute(
                        "DELETE FROM workflow_pending_dispatches WHERE dispatched_at < ?1",
                        params![cutoff],
                    )
                    .map_err(|e| CoreError::storage(format!("purge_stale 失败: {e}")))?;
                Ok(count as u32)
            })
            .map_err(Into::into)
    }

    /// 启动时复活：扫描所有 running/paused 的 run，登记到内存（用于 crash recovery）
    pub fn hydrate_active_runs(&self, store: &SqliteStore) -> Result<u32, WorkflowError> {
        let active = store.with_conn(|c| WorkflowStore::new(c).list_runs(None, None, 1000))?;
        let mut count = 0u32;
        let mut runs_guard = self
            .runs
            .lock()
            .map_err(|e| WorkflowError::InternalError(e.to_string()))?;
        let mut cancel_guard = self
            .cancel
            .lock()
            .map_err(|e| WorkflowError::InternalError(e.to_string()))?;
        for summary in active {
            if ACTIVE_STATUSES.contains(&summary.status.as_str()) {
                runs_guard.insert(
                    summary.run_id.clone(),
                    RunHandle {
                        run_id: summary.run_id.clone(),
                        workflow_id: summary.workflow_id.clone(),
                        workflow_version: summary.workflow_version,
                        started_at: summary.started_at,
                    },
                );
                cancel_guard
                    .entry(summary.run_id.clone())
                    .or_insert_with(|| Arc::new(AtomicBool::new(false)));
                count += 1;
            }
        }
        Ok(count)
    }
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use worldsmith_core::workflow::types::{EdgeDefinition, NodeDefinition, WorkflowDefinition};

    fn make_def(id: &str) -> WorkflowDefinition {
        WorkflowDefinition {
            id: id.to_string(),
            name: format!("Test {id}"),
            version: 1,
            description: None,
            category: "custom".to_string(),
            params: None,
            timeout_ms: None,
            nodes: vec![
                NodeDefinition {
                    id: "n1".to_string(),
                    type_: "start".to_string(),
                    config: json!({}),
                    position: None,
                    error_handling: None,
                    timeout_ms: None,
                    sub_graph: None,
                },
                NodeDefinition {
                    id: "n2".to_string(),
                    type_: "end".to_string(),
                    config: json!({}),
                    position: None,
                    error_handling: None,
                    timeout_ms: None,
                    sub_graph: None,
                },
            ],
            edges: vec![EdgeDefinition {
                from: "n1".to_string(),
                to: "n2".to_string(),
                label: None,
                condition: None,
            }],
            schema_version: 1,
        }
    }

    #[test]
    fn test_engine_start_registers_run() {
        let store = SqliteStore::open_in_memory().unwrap();
        let engine = WorkflowEngine::new();
        let def = make_def("wf-1");
        store
            .with_conn(|c| WorkflowStore::new(c).save(&def))
            .unwrap();

        let run_id = engine.start(&store, &def, json!({}), "user").unwrap();
        assert!(!run_id.is_empty());

        let status = engine.get_status(&store, &run_id).unwrap();
        assert_eq!(status.workflow_id, "wf-1");
        assert_eq!(status.status, "running");

        let active = engine.list_active().unwrap();
        assert_eq!(active, vec![run_id.clone()]);

        engine.finalize(&run_id);
        assert!(engine.list_active().unwrap().is_empty());
    }

    #[test]
    fn test_cancel_signal_propagates() {
        let store = SqliteStore::open_in_memory().unwrap();
        let engine = WorkflowEngine::new();
        let def = make_def("wf-2");
        store
            .with_conn(|c| WorkflowStore::new(c).save(&def))
            .unwrap();
        let run_id = engine.start(&store, &def, json!({}), "user").unwrap();

        let signal = engine.cancel_signal(&run_id).expect("signal");
        assert!(!signal.load(Ordering::SeqCst));

        assert!(engine.request_cancel(&run_id).unwrap());
        assert!(signal.load(Ordering::SeqCst));

        let miss = engine.cancel_signal("nonexistent");
        assert!(miss.is_none());
    }

    #[test]
    fn test_purge_stale_pending_dispatches() {
        let store = SqliteStore::open_in_memory().unwrap();
        let engine = WorkflowEngine::new();

        // 手动塞 1 条老的 + 1 条新的
        store
            .with_conn(|c| {
                c.execute(
                    "INSERT INTO workflow_pending_dispatches
                     (request_id, run_id, node_id, protocol, dispatched_at, last_heartbeat_at)
                     VALUES ('old', 'r1', 'n1', 'sync', 0, NULL)",
                    [],
                )?;
                c.execute(
                    "INSERT INTO workflow_pending_dispatches
                     (request_id, run_id, node_id, protocol, dispatched_at, last_heartbeat_at)
                     VALUES ('new', 'r2', 'n1', 'sync', ?1, NULL)",
                    params![now_ms()],
                )?;
                Ok::<(), CoreError>(())
            })
            .unwrap();

        let purged = engine.purge_stale_pending_dispatches(&store, None).unwrap();
        assert_eq!(purged, 1);

        store
            .with_conn(|c| {
                let count: i64 = c
                    .query_row(
                        "SELECT COUNT(*) FROM workflow_pending_dispatches",
                        [],
                        |r| r.get(0),
                    )?;
                assert_eq!(count, 1);
                Ok::<(), CoreError>(())
            })
            .unwrap();
    }

    #[test]
    fn test_hydrate_active_runs() {
        let store = SqliteStore::open_in_memory().unwrap();
        let engine = WorkflowEngine::new();
        let def = make_def("wf-3");
        store
            .with_conn(|c| WorkflowStore::new(c).save(&def))
            .unwrap();

        // 启动 + 终态化，模拟"历史 running run"
        let run_id = engine.start(&store, &def, json!({}), "user").unwrap();
        store
            .with_conn(|c| {
                WorkflowStore::new(c)
                    .update_run_status(&run_id, "completed", Some(now_ms()))
            })
            .unwrap();

        // 新建一个 engine，hydrate 时不应拿到 completed 的 run
        let engine2 = WorkflowEngine::new();
        let count = engine2.hydrate_active_runs(&store).unwrap();
        assert_eq!(count, 0);
        assert!(engine2.list_active().unwrap().is_empty());
    }

    // 让 Arc 引用被实际使用（防止 dead_code warning）
    #[test]
    fn test_arc_clone() {
        let store = SqliteStore::open_in_memory().unwrap();
        let engine = Arc::new(WorkflowEngine::new());
        let _engine2 = engine.clone();
        let _: &SqliteStore = &store;
    }
}
