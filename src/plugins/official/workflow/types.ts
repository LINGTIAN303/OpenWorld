// 工作流 TypeScript 类型
//
// 与后端 Rust 类型 1:1 对齐（src-tauri/src/workflow/commands/definitions.rs::WorkflowSummaryDto
// 用 `#[serde(rename_all = "camelCase")]`，所以后端返回的字段是 camelCase）。
//
// 详细结构与 `worldsmith-core::workflow::types` 对应。

export interface WorkflowNodeDefinition {
  id: string
  /** 节点类型，如 start / end / skill / agent / condition / loop / wait / human 等 */
  type: string
  /** 节点配置 JSON，由各 type 自己解析 */
  config: Record<string, unknown>
  position?: { x: number; y: number } | null
  errorHandling?: ErrorHandlingConfig | null
  timeoutMs?: number | null
  subGraph?: WorkflowSubGraph | null
}

export interface ErrorHandlingConfig {
  strategy: 'stop' | 'continue' | 'retry' | 'fallback'
  maxRetries?: number
  fallbackNodeId?: string
}

export interface WorkflowSubGraph {
  entryNodeId: string
  nodes: WorkflowNodeDefinition[]
  edges: WorkflowEdgeDefinition[]
}

export interface WorkflowEdgeDefinition {
  from: string
  to: string
  label?: string | null
  condition?: string | null
}

export interface WorkflowDefinition {
  id: string
  name: string
  version: number
  description?: string | null
  category: string
  params?: WorkflowParam[] | null
  timeoutMs?: number | null
  nodes: WorkflowNodeDefinition[]
  edges: WorkflowEdgeDefinition[]
  schemaVersion: number
}

export interface WorkflowParam {
  key: string
  type: 'string' | 'number' | 'boolean' | 'json'
  default?: unknown
  description?: string
}

export interface WorkflowSummary {
  id: string
  latestVersion: number
  name: string
  category: string
  description: string | null
  updatedAt: number
  /** 最近一次运行的状态(无运行则为 'idle') */
  status?: RunStatus
  /** 节点数(用于卡片角标展示) */
  nodeCount?: number
  /** ISO 字符串;后端无此字段时由前端 fallback */
  createdAt?: string
  /** ISO 字符串或 null(从未运行) */
  lastRunAt?: string | null
}

/** 工作流运行状态(对齐 src-tauri/src/workflow/runs.rs::RunStatus + WsStatusDot) */
export type RunStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'skipped'
  | 'awaiting-decision'

export interface RunSummary {
  runId: string
  workflowId: string
  workflowVersion: number
  status: string
  triggeredBy: string
  startedAt: number
  completedAt: number | null
  error: string | null
}

export interface RunStatusInfo {
  runId: string
  status: string
  currentNodeId: string | null
}

/** P3:Agent 决策节点暂停时,前端接收的决策上下文 */
export interface DecisionContextItem {
  label: string
  value: string
}

export interface DecisionContext {
  runId: string
  nodeId: string
  nodeName: string
  nodeType: string
  /** Agent 抛给用户的问题(节点 prompt) */
  prompt: string
  /** Agent 收集的上下文数据汇总 */
  context: {
    summary: string
    items: DecisionContextItem[]
  }
  /** 用户可选的决策选项 */
  options: Array<{ id: string; label: string }>
  /** 默认选项 id(超时 fallback 用) */
  defaultOption: string
  /** 0 表示不超时 */
  decisionTimeoutMs: number
}

export type ParseFormat = 'auto' | 'json' | 'yaml'

/** 浏览器开发模式（无 Tauri）下用本地 mock；否则用 @tauri-apps/api/core */
export const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
