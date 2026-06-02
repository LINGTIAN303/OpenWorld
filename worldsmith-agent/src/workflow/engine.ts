import type {
  WorkflowDefinition,
  WorkflowRunStatusInfo,
  WorkflowEvent,
  ValidationResult,
  AgentDecision,
} from './types'
import { parseDefinition } from './parser'
import { validateWorkflow } from './validator'
import { WorkflowExecutor, ExecutorState } from './executor'
import { WorkflowEventEmitter } from './events'
import { nodeRegistry } from './node-registry'
import { startNode } from './nodes/start'
import { endNode } from './nodes/end'
import { pivotNode } from './nodes/pivot'
import { conditionNode } from './nodes/condition-node'
import { skillNode } from './nodes/skill-node'
import { toolNode } from './nodes/tool-node'
import { agentDecisionNode } from './nodes/agent-decision-node'
import { subAgentNode } from './nodes/sub-agent-node'
import { loopNode } from './nodes/loop-node'
import { iterateNode } from './nodes/iterate-node'
import { skipNode } from './nodes/skip-node'
import { parallelNode } from './nodes/parallel-node'
import { subWorkflowNode } from './nodes/sub-workflow-node'
import { codeNode } from './nodes/code-node'

function registerBuiltinNodes(): void {
  const builtins = [
    startNode, endNode, pivotNode, conditionNode,
    skillNode, toolNode, agentDecisionNode, subAgentNode,
    loopNode, iterateNode, skipNode, parallelNode,
    subWorkflowNode, codeNode,
  ]
  for (const node of builtins) {
    if (!nodeRegistry.has(node.type)) {
      nodeRegistry.register(node)
    }
  }
}

registerBuiltinNodes()

export class WorkflowEngine {
  private runs: Map<string, WorkflowExecutor> = new Map()
  private emitter: WorkflowEventEmitter = new WorkflowEventEmitter()
  private cleanupTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private static CLEANUP_DELAY_MS = 60_000

  private scheduleCleanup(runId: string): void {
    if (this.cleanupTimers.has(runId)) return
    const timer = setTimeout(() => {
      this.runs.delete(runId)
      this.cleanupTimers.delete(runId)
    }, WorkflowEngine.CLEANUP_DELAY_MS)
    this.cleanupTimers.set(runId, timer)
  }

  private cancelCleanup(runId: string): void {
    const timer = this.cleanupTimers.get(runId)
    if (timer) {
      clearTimeout(timer)
      this.cleanupTimers.delete(runId)
    }
  }

  parse(definition: string): WorkflowDefinition {
    return parseDefinition(definition)
  }

  validate(def: WorkflowDefinition): ValidationResult {
    return validateWorkflow(def)
  }

  start(def: WorkflowDefinition, params: Record<string, unknown>): string {
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const executor = new WorkflowExecutor(def, params, this.emitter)
    this.runs.set(runId, executor)
    this.cancelCleanup(runId)

    executor.run().catch((err) => {
      console.error(`[WorkflowEngine] 工作流 ${runId} 执行失败:`, err)
    }).finally(() => {
      this.scheduleCleanup(runId)
    })

    return runId
  }

  async startSync(def: WorkflowDefinition, params: Record<string, unknown>): Promise<string> {
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const executor = new WorkflowExecutor(def, params, this.emitter)
    this.runs.set(runId, executor)
    this.cancelCleanup(runId)

    try {
      await executor.run()
    } finally {
      this.scheduleCleanup(runId)
    }

    return runId
  }

  pause(runId: string): void {
    const executor = this.runs.get(runId)
    if (executor) executor.pause()
  }

  resume(runId: string, decision?: AgentDecision): void {
    const executor = this.runs.get(runId)
    if (executor) executor.resume(decision || undefined)
  }

  cancel(runId: string): void {
    const executor = this.runs.get(runId)
    if (executor) executor.cancel()
  }

  skipTo(runId: string, targetNodeId: string): void {
    const executor = this.runs.get(runId)
    if (executor) executor.skipToNode(targetNodeId)
  }

  getStatus(runId: string): WorkflowRunStatusInfo | null {
    const executor = this.runs.get(runId)
    if (!executor) return null

    const ctx = executor.getContext()
    const stateMap: Record<ExecutorState, WorkflowRunStatusInfo['status']> = {
      idle: 'running',
      running: 'running',
      paused: 'paused',
      completed: 'completed',
      failed: 'failed',
      cancelled: 'cancelled',
    }

    return {
      runId: ctx.metadata.runId,
      workflowId: ctx.metadata.workflowId,
      status: stateMap[executor.getState()],
      currentNodeId: ctx.metadata.currentNodeId,
      nodeStates: ctx.nodes,
      startedAt: ctx.metadata.startedAt,
      completedAt: null,
      error: null,
      triggeredBy: 'agent',
      params: ctx.params,
    }
  }

  onEvent(callback: (event: WorkflowEvent) => void): () => void {
    return this.emitter.on(callback)
  }

  getNodeRegistry() {
    return nodeRegistry
  }
}

export const workflowEngine = new WorkflowEngine()
