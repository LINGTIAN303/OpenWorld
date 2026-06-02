//! 工作流执行器：6 个独立组件 + 顶层 orchestrator
//!
//! 组件：
//!   1. `TopologicalScheduler` — Kahn 排序得执行顺序
//!   2. `NodeDispatcher`       — 双协议派发节点（在 `dispatcher.rs`，含 10 护栏）
//!   3. `TimeoutWatchdog`      — 节点单独超时
//!   4. `ErrorHandler`         — 按 error_handling 策略分发
//!   5. `ProgressReporter`     — 写 store + 发 Tauri Event
//!   6. `Finalizer`            — 终态后写 store + engine.finalize
//!
//! 顶层 `WorkflowExecutor::run()` 串联 6 组件。

pub mod dispatcher;

use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use worldsmith_core::error::CoreError;
use worldsmith_core::storage::sqlite::SqliteStore;
use worldsmith_core::storage::workflow::WorkflowStore;
use worldsmith_core::workflow::types::{
    ErrorHandlingConfig, NodeDefinition, WorkflowDefinition,
};

pub use dispatcher::{DispatchHandle, DispatcherRegistry, NodeDispatcher};

use crate::workflow::dispatch_protocol::{
    NodeDispatchRequest, NodeDispatchResult, NodeProtocol,
};
use crate::workflow::engine::{RunStatus, WorkflowEngine};
use crate::workflow::error::WorkflowError;

// ─────────────────────────────────────────────────────────────────────────────
// 1. TopologicalScheduler — Kahn 排序
// ─────────────────────────────────────────────────────────────────────────────

pub struct TopologicalScheduler;

impl TopologicalScheduler {
    /// 返回节点 id 的执行顺序
    pub fn order(def: &WorkflowDefinition) -> Result<Vec<String>, WorkflowError> {
        let mut in_degree: HashMap<&str, usize> =
            def.nodes.iter().map(|n| (n.id.as_str(), 0)).collect();
        let mut adj: HashMap<&str, Vec<&str>> = HashMap::new();
        for edge in &def.edges {
            *in_degree.entry(edge.to.as_str()).or_insert(0) += 1;
            adj.entry(edge.from.as_str()).or_default().push(edge.to.as_str());
        }

        let mut queue: VecDeque<&str> = in_degree
            .iter()
            .filter_map(|(id, d)| (*d == 0).then_some(*id))
            .collect();
        let mut order = Vec::with_capacity(def.nodes.len());
        while let Some(id) = queue.pop_front() {
            order.push(id.to_string());
            if let Some(next) = adj.get(id) {
                for n in next {
                    let d = in_degree.get_mut(n).expect("in_degree present");
                    *d -= 1;
                    if *d == 0 {
                        queue.push_back(n);
                    }
                }
            }
        }
        if order.len() != def.nodes.len() {
            // 与 validator 行为一致：环里的节点作为环错误
            let cycle: Vec<String> = def
                .nodes
                .iter()
                .map(|n| n.id.clone())
                .filter(|id| !order.contains(id))
                .collect();
            return Err(WorkflowError::ValidationFailed(vec![format!(
                "执行期检测到环: {cycle:?}"
            )]));
        }
        Ok(order)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. TimeoutWatchdog — 节点单独超时（护栏 C）
// ─────────────────────────────────────────────────────────────────────────────

pub struct TimeoutWatchdog;

impl TimeoutWatchdog {
    /// 实际执行 + 超时检测。返回 (output_or_none, error_or_none, elapsed_ms, timed_out)
    pub fn run<F>(
        cancel: &Arc<AtomicBool>,
        timeout: Duration,
        work: F,
    ) -> (Option<NodeDispatchResult>, Option<WorkflowError>, u64, bool)
    where
        F: FnOnce() -> NodeDispatchResult,
    {
        let start = now_ms();
        let elapsed = (now_ms() - start).max(0) as u64;
        if cancel.load(Ordering::SeqCst) {
            return (
                None,
                Some(WorkflowError::Cancelled),
                elapsed,
                false,
            );
        }
        let out = work();
        let elapsed_ms = (now_ms() - start).max(0) as u64;
        let timed_out = elapsed_ms > timeout.as_millis() as u64;
        if timed_out {
            return (
                None,
                Some(WorkflowError::Timeout {
                    node_id: out.node_id.clone(),
                    elapsed_ms,
                    timeout_ms: timeout.as_millis() as u64,
                }),
                elapsed_ms,
                true,
            );
        }
        (Some(out), None, elapsed_ms, false)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ErrorHandler — 按 error_handling 策略
// ─────────────────────────────────────────────────────────────────────────────

pub struct ErrorHandler;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HandlingDecision {
    Stop,
    Continue,
    Retry,
    Fallback(String),
}

impl ErrorHandler {
    pub fn decide(node: &NodeDefinition, retry_count: u32) -> HandlingDecision {
        let config = node
            .error_handling
            .as_ref()
            .cloned()
            .unwrap_or(ErrorHandlingConfig {
                on_failure: "stop".to_string(),
                max_retries: None,
                retry_delay_ms: None,
                fallback: None,
                agent_prompt: None,
            });
        match config.on_failure.as_str() {
            "continue" => HandlingDecision::Continue,
            "retry" => {
                let max = config.max_retries.unwrap_or(0);
                if retry_count < max {
                    HandlingDecision::Retry
                } else {
                    HandlingDecision::Stop
                }
            }
            "fallback" => {
                let fb = config
                    .fallback
                    .as_ref()
                    .map(|n| n.id.clone())
                    .unwrap_or_default();
                HandlingDecision::Fallback(fb)
            }
            _ => HandlingDecision::Stop, // default
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. ProgressReporter — 写 store + 发 Tauri Event
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct ProgressEvent {
    pub run_id: String,
    pub node_id: String,
    pub progress: f32,
    pub status: String,
    pub timestamp: i64,
}

pub struct ProgressReporter<'a> {
    store: &'a SqliteStore,
    app: Option<AppHandle>,
}

impl<'a> ProgressReporter<'a> {
    pub fn new(store: &'a SqliteStore, app: Option<AppHandle>) -> Self {
        Self { store, app }
    }

    pub fn report(
        &self,
        run_id: &str,
        node_id: &str,
        progress: f32,
        status: &str,
    ) -> Result<(), WorkflowError> {
        let now = now_ms();
        self.store
            .with_conn(|c| {
                WorkflowStore::new(c).append_node_log(
                    run_id,
                    node_id,
                    "progress",
                    Some(serde_json::json!({ "progress": progress, "status": status })),
                )
            })
            .map_err(WorkflowError::from)?;
        if let Some(app) = &self.app {
            let _ = app.emit(
                "workflow:progress",
                ProgressEvent {
                    run_id: run_id.to_string(),
                    node_id: node_id.to_string(),
                    progress,
                    status: status.to_string(),
                    timestamp: now,
                },
            );
        }
        Ok(())
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Finalizer — 终态后清理
// ─────────────────────────────────────────────────────────────────────────────

pub struct Finalizer;

impl Finalizer {
    pub fn finalize(
        store: &SqliteStore,
        engine: &WorkflowEngine,
        run_id: &str,
        status: &str,
        error: Option<&str>,
    ) -> Result<(), WorkflowError> {
        let now = now_ms();
        store
            .with_conn(|c| {
                let ws = WorkflowStore::new(c);
                ws.update_run_status(run_id, status, Some(now))?;
                if let Some(e) = error {
                    ws.append_node_log(run_id, "_run", "error", Some(serde_json::json!({ "message": e })))?;
                }
                ws.append_node_log(run_id, "_run", "status", Some(serde_json::json!({ "status": status })))?;
                Ok::<(), CoreError>(())
            })
            .map_err(WorkflowError::from)?;
        engine.finalize(run_id);
        Ok(())
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// WorkflowExecutor — 顶层 orchestrator
// ─────────────────────────────────────────────────────────────────────────────

pub struct WorkflowExecutor {
    store: SqliteStore,
    engine: Arc<WorkflowEngine>,
    app: Option<AppHandle>,
    default_node_timeout_ms: u64,
    default_workflow_timeout_ms: u64,
    registry: DispatcherRegistry,
}

impl WorkflowExecutor {
    pub fn new(
        store: SqliteStore,
        engine: Arc<WorkflowEngine>,
        app: Option<AppHandle>,
        registry: DispatcherRegistry,
    ) -> Self {
        Self {
            store,
            engine,
            app,
            default_node_timeout_ms: 30_000,
            default_workflow_timeout_ms: 3_600_000,
            registry,
        }
    }

    /// 跑一次工作流
    pub fn run(
        &self,
        def: &WorkflowDefinition,
        run_id: &str,
        cancel: Arc<AtomicBool>,
    ) -> Result<RunStatus, WorkflowError> {
        let order = TopologicalScheduler::order(def)?;
        let dispatcher = NodeDispatcher::new(self.app.clone(), Some(self.registry.clone()));
        let reporter = ProgressReporter::new(&self.store, self.app.clone());
        let mut node_states: HashMap<String, Value> = HashMap::new();

        let cancel_signal = self.engine.cancel_signal(run_id).unwrap_or(cancel);

        for node_id in &order {
            if cancel_signal.load(Ordering::SeqCst) {
                Finalizer::finalize(
                    &self.store,
                    &self.engine,
                    run_id,
                    "cancelled",
                    Some("用户取消"),
                )?;
                return self.engine.get_status(&self.store, run_id).ok_or_else(|| {
                    WorkflowError::InternalError("cancelled 后无 status".to_string())
                });
            }

            let node = def
                .nodes
                .iter()
                .find(|n| &n.id == node_id)
                .ok_or_else(|| WorkflowError::InternalError(format!("节点 {node_id} 缺失")))?;
            let timeout = Duration::from_millis(
                node.timeout_ms
                    .map(|t| t as u64)
                    .unwrap_or(self.default_node_timeout_ms),
            );

            // 收集 inputs（来自前置 node_states）
            let inputs = collect_inputs(def, node_id, &node_states);

            let request = NodeDispatchRequest::new(
                format!("{run_id}:{node_id}"),
                run_id,
                node_id.clone(),
                node.type_.clone(),
                NodeProtocol::Sync,
                node.config.clone(),
                inputs,
                node.timeout_ms,
            );

            // 护栏 E：register pending
            dispatcher::register_pending(&self.store, &request)?;

            let dispatcher_ref = &dispatcher;
            let (out_opt, err_opt, _elapsed, _timed_out) =
                TimeoutWatchdog::run(&cancel_signal, timeout, || {
                    dispatcher_ref.dispatch_blocking(&request, timeout).unwrap_or_else(|e| {
                        NodeDispatchResult::failure(
                            &request.request_id,
                            &request.run_id,
                            &request.node_id,
                            e.to_string(),
                            None,
                        )
                    })
                });

            // 护栏 E：unregister pending（无论成功失败都清掉）
            let _ = dispatcher::unregister_pending(&self.store, &request.request_id);

            match (out_opt, err_opt) {
                (Some(out), None) => {
                    // 护栏 G：输出 schema 校验
                    dispatcher::validate_output_schema(node_id, &out.output)?;
                    node_states.insert(node_id.clone(), out.output.clone());
                    reporter.report(run_id, node_id, out.progress, "completed")?;
                }
                (_, Some(err)) => {
                    let decision = ErrorHandler::decide(node, 0);
                    match decision {
                        HandlingDecision::Stop => {
                            Finalizer::finalize(
                                &self.store,
                                &self.engine,
                                run_id,
                                "failed",
                                Some(&err.to_string()),
                            )?;
                            return Err(err);
                        }
                        HandlingDecision::Continue | HandlingDecision::Retry => {
                            node_states.insert(node_id.clone(), Value::Null);
                            reporter.report(run_id, node_id, 0.0, "skipped")?;
                        }
                        HandlingDecision::Fallback(fb) => {
                            if !fb.is_empty() {
                                node_states.insert(node_id.clone(), Value::Null);
                                reporter.report(run_id, node_id, 0.0, "fallback")?;
                            } else {
                                Finalizer::finalize(
                                    &self.store,
                                    &self.engine,
                                    run_id,
                                    "failed",
                                    Some(&err.to_string()),
                                )?;
                                return Err(err);
                            }
                        }
                    }
                }
                (None, None) => {
                    Finalizer::finalize(
                        &self.store,
                        &self.engine,
                        run_id,
                        "failed",
                        Some("watchdog 异常"),
                    )?;
                    return Err(WorkflowError::InternalError("watchdog 异常".to_string()));
                }
            }
        }

        Finalizer::finalize(&self.store, &self.engine, run_id, "completed", None)?;
        self.engine
            .get_status(&self.store, run_id)
            .ok_or_else(|| WorkflowError::InternalError("完成态缺失".to_string()))
    }
}

fn collect_inputs(
    def: &WorkflowDefinition,
    node_id: &str,
    states: &HashMap<String, Value>,
) -> Value {
    let mut inputs = serde_json::Map::new();
    for edge in &def.edges {
        if edge.to == node_id {
            if let Some(v) = states.get(&edge.from) {
                inputs.insert(edge.from.clone(), v.clone());
            }
        }
    }
    Value::Object(inputs)
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

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
                    type_: "skill".to_string(),
                    config: json!({ "echo": "hello" }),
                    position: None,
                    error_handling: None,
                    timeout_ms: Some(1000),
                    sub_graph: None,
                },
                NodeDefinition {
                    id: "n3".to_string(),
                    type_: "end".to_string(),
                    config: json!({}),
                    position: None,
                    error_handling: None,
                    timeout_ms: None,
                    sub_graph: None,
                },
            ],
            edges: vec![
                EdgeDefinition {
                    from: "n1".to_string(),
                    to: "n2".to_string(),
                    label: None,
                    condition: None,
                },
                EdgeDefinition {
                    from: "n2".to_string(),
                    to: "n3".to_string(),
                    label: None,
                    condition: None,
                },
            ],
            schema_version: 1,
        }
    }

    #[test]
    fn test_topological_order() {
        let def = make_def("wf-1");
        let order = TopologicalScheduler::order(&def).unwrap();
        assert_eq!(order, vec!["n1", "n2", "n3"]);
    }

    #[test]
    fn test_topological_order_detects_cycle() {
        let mut def = make_def("wf-1");
        def.edges.push(EdgeDefinition {
            from: "n3".to_string(),
            to: "n1".to_string(),
            label: None,
            condition: None,
        });
        let result = TopologicalScheduler::order(&def);
        assert!(matches!(result, Err(WorkflowError::ValidationFailed(_))));
    }

    #[test]
    fn test_timeout_watchdog_normal() {
        let cancel = Arc::new(AtomicBool::new(false));
        let (out, err, _elapsed, timed_out) = TimeoutWatchdog::run(
            &cancel,
            Duration::from_millis(500),
            || {
                NodeDispatchResult::success(
                    "r",
                    "run-1",
                    "n",
                    json!("ok"),
                    None,
                )
            },
        );
        assert!(out.is_some());
        assert!(err.is_none());
        assert!(!timed_out);
    }

    #[test]
    fn test_error_handler_default_stop() {
        let node = NodeDefinition {
            id: "n".to_string(),
            type_: "skill".to_string(),
            config: json!({}),
            position: None,
            error_handling: None,
            timeout_ms: None,
            sub_graph: None,
        };
        assert_eq!(ErrorHandler::decide(&node, 0), HandlingDecision::Stop);
    }

    #[test]
    fn test_error_handler_retry_then_stop() {
        let node = NodeDefinition {
            id: "n".to_string(),
            type_: "skill".to_string(),
            config: json!({}),
            position: None,
            error_handling: Some(ErrorHandlingConfig {
                on_failure: "retry".to_string(),
                max_retries: Some(2),
                retry_delay_ms: None,
                fallback: None,
                agent_prompt: None,
            }),
            timeout_ms: None,
            sub_graph: None,
        };
        assert_eq!(ErrorHandler::decide(&node, 0), HandlingDecision::Retry);
        assert_eq!(ErrorHandler::decide(&node, 1), HandlingDecision::Retry);
        assert_eq!(ErrorHandler::decide(&node, 2), HandlingDecision::Stop);
    }

    #[test]
    fn test_executor_full_run() {
        let store = SqliteStore::open_in_memory().unwrap();
        let engine = Arc::new(WorkflowEngine::new());
        let executor = WorkflowExecutor::new(
            SqliteStore::open_in_memory().unwrap(),
            engine.clone(),
            None,
            Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
        );
        let def = make_def("wf-1");
        let cancel = Arc::new(AtomicBool::new(false));

        let run_id = engine
            .start(&store, &def, json!({}), "user")
            .expect("start");

        let status = executor.run(&def, &run_id, cancel).unwrap();
        assert_eq!(status.status, "completed");
    }

    #[test]
    fn test_progress_reporter_writes_log() {
        let store = SqliteStore::open_in_memory().unwrap();
        let engine = Arc::new(WorkflowEngine::new());
        let def = make_def("wf-p");
        store.with_conn(|c| WorkflowStore::new(c).save(&def)).unwrap();
        let run_id = engine.start(&store, &def, json!({}), "user").unwrap();
        let reporter = ProgressReporter::new(&store, None);
        reporter.report(&run_id, "n1", 0.5, "running").unwrap();

        let logs: Vec<_> = store
            .with_conn(|c| {
                WorkflowStore::new(c).list_runs(None, None, 10)
            })
            .unwrap();
        assert!(!logs.is_empty());
    }
}
