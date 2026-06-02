export type NodeType =
  | 'start' | 'end' | 'skill' | 'tool' | 'sub_agent'
  | 'condition' | 'agent_decision' | 'parallel' | 'sub_workflow'
  | 'code' | 'pivot' | 'loop' | 'iterate' | 'skip'

export type NodeCategory = 'builtin' | 'plugin'

export type WorkflowRunStatus = 'running' | 'completed' | 'failed' | 'paused' | 'cancelled'

export type NodeOutputStatus = 'success' | 'failed' | 'skipped'

export type ErrorHandlingStrategy = 'retry' | 'skip' | 'abort' | 'agent_decision' | 'fallback'

export interface WorkflowParam {
  type: 'string' | 'number' | 'boolean'
  required?: boolean
  default?: unknown
  description?: string
}

export interface NodePosition {
  x: number
  y: number
}

export interface ErrorHandlingConfig {
  on_failure: ErrorHandlingStrategy
  max_retries?: number
  retry_delay_ms?: number
  fallback?: NodeDefinition
  agent_prompt?: string
}

export interface NodeDefinition {
  id: string
  type: NodeType
  config: Record<string, unknown>
  position?: NodePosition
  error_handling?: ErrorHandlingConfig
  timeout?: number
  sub_graph?: WorkflowGraph
}

export interface EdgeDefinition {
  from: string
  to: string
  label?: string
  condition?: string
}

export interface WorkflowGraph {
  nodes: NodeDefinition[]
  edges: EdgeDefinition[]
}

export interface WorkflowDefinition {
  id: string
  name: string
  version: number
  description?: string
  params?: Record<string, WorkflowParam>
  timeout?: number
  nodes: NodeDefinition[]
  edges: EdgeDefinition[]
}

export interface NodeOutput {
  status: NodeOutputStatus
  data: unknown
  error?: string
  duration: number
}

export interface WorkflowContext {
  params: Record<string, unknown>
  nodes: Record<string, NodeOutput>
  variables: Record<string, unknown>
  loop_results: unknown[]
  iterate_results: unknown[]
  metadata: {
    workflowId: string
    runId: string
    startedAt: number
    currentNodeId: string | null
  }
}

export interface DecisionOption {
  label: string
  route: string
}

export interface AgentDecision {
  nodeId: string
  choice: string
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export interface WorkflowRunStatusInfo {
  runId: string
  workflowId: string
  status: WorkflowRunStatus
  currentNodeId: string | null
  nodeStates: Record<string, NodeOutput>
  startedAt: number
  completedAt: number | null
  error: string | null
  triggeredBy: 'user' | 'agent' | 'sub_agent'
  params: Record<string, unknown>
}

export interface NodeConfigFieldSchema {
  type: 'string' | 'number' | 'boolean' | 'select' | 'array'
  label: string
  required?: boolean
  default?: unknown
  description?: string
  options?: string[]
}

export interface NodeMetadata {
  type: string
  category: NodeCategory
  label: string
  icon: string
  color: string
  pluginId: string
  description: string
  configSchema: Record<string, NodeConfigFieldSchema>
}

export interface NodeTypeDefinition extends NodeMetadata {
  execute(config: Record<string, unknown>, ctx: WorkflowContext, api: NodeExecutionAPI): Promise<NodeOutput>
  dispose?(): Promise<void>
}

export interface NodeExecutionAPI {
  callTool(toolName: string, args: Record<string, unknown>): Promise<string>
  resolveVars(template: string, ctx: WorkflowContext): string
  dispatchSubAgent(type: string, prompt: string): Promise<string>
  emitEvent(event: WorkflowEvent): void
}

export type WorkflowEvent =
  | { type: 'node_started'; nodeId: string; runId: string }
  | { type: 'node_completed'; nodeId: string; runId: string; output: NodeOutput }
  | { type: 'node_failed'; nodeId: string; runId: string; error: string }
  | { type: 'condition_evaluated'; nodeId: string; runId: string; branch: string }
  | { type: 'agent_decision_required'; nodeId: string; runId: string; options: DecisionOption[] }
  | { type: 'loop_iteration'; nodeId: string; runId: string; iteration: number }
  | { type: 'skip_executed'; fromNodeId: string; toNodeId: string; runId: string }
  | { type: 'workflow_completed'; runId: string; result: unknown }
  | { type: 'workflow_failed'; runId: string; error: string }

export interface WorkflowTemplateDefinition {
  id: string
  name: string
  description: string
  category: string
  definition: WorkflowDefinition
}
