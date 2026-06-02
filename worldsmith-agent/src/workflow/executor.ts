import type {
  WorkflowDefinition,
  WorkflowContext,
  NodeOutput,
  NodeDefinition,
  WorkflowEvent,
  DecisionOption,
  AgentDecision,
  NodeExecutionAPI,
  WorkflowGraph,
} from './types'
import { ContextManager } from './context'
import { WorkflowEventEmitter } from './events'
import { nodeRegistry } from './node-registry'
import { resolveVars, resolveValue } from './resolvers/template-resolver'
import { validateWorkflow } from './validator'

export type ExecutorState = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'

interface PendingDecision {
  nodeId: string
  options: DecisionOption[]
}

export class WorkflowExecutor {
  private def: WorkflowDefinition
  private ctx: ContextManager
  private emitter: WorkflowEventEmitter
  private _state: ExecutorState = 'idle'
  private pendingDecision: PendingDecision | null = null
  private nodeTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private resolveWait: (() => void) | null = null

  private pendingDecisionResolve: (() => void) | null = null
  private pendingDecisionChoice: DecisionOption | null = null

  private graphStack: WorkflowGraph[] = []
  private executionPath: Set<string> = new Set()
  private skipTarget: string | null = null

  private isState(state: ExecutorState): boolean {
    return this._state === state
  }

  private currentGraph(): WorkflowGraph {
    return this.graphStack.length > 0 ? this.graphStack[this.graphStack.length - 1] : this.def
  }

  constructor(
    def: WorkflowDefinition,
    params: Record<string, unknown>,
    emitter: WorkflowEventEmitter,
  ) {
    this.def = def
    this.ctx = new ContextManager(def.id, `run-${Date.now()}`, params)
    this.emitter = emitter
  }

  async run(): Promise<unknown> {
    const validation = validateWorkflow(this.def)
    if (!validation.valid) {
      throw new Error(`工作流校验失败: ${validation.errors.join('; ')}`)
    }

    this._state = 'running'
    const startNode = this.def.nodes.find(n => n.type === 'start')
    if (!startNode) throw new Error('找不到 start 节点')

    try {
      await this.executeNode(startNode.id)
      if (this._state === 'running') {
        this._state = 'completed'
        this.emitter.emit({
          type: 'workflow_completed',
          runId: this.ctx.get().metadata.runId,
          result: this.ctx.get().nodes,
        })
      }
      return this.ctx.get().nodes
    } catch (err) {
      if (this.isState('cancelled')) return this.ctx.get().nodes
      this._state = 'failed'
      this.emitter.emit({
        type: 'workflow_failed',
        runId: this.ctx.get().metadata.runId,
        error: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  }

  pause(): void {
    if (this._state === 'running') {
      this._state = 'paused'
    }
  }

  resume(decision?: AgentDecision): void {
    if (this._state !== 'paused') return
    this._state = 'running'
    if (decision && this.pendingDecision) {
      this.handleDecision(decision.choice)
    }
  }

  cancel(): void {
    this._state = 'cancelled'
    for (const [, timer] of this.nodeTimers) {
      clearTimeout(timer)
    }
    this.nodeTimers.clear()
    if (this.resolveWait) {
      this.resolveWait()
      this.resolveWait = null
    }
    if (this.pendingDecisionResolve) {
      this.pendingDecisionResolve()
      this.pendingDecisionResolve = null
    }
  }

  skipToNode(targetNodeId: string): void {
    this.skipTarget = targetNodeId
    if (this.isState('paused')) {
      this._state = 'running'
    }
  }

  getState(): ExecutorState {
    return this._state
  }

  getPendingDecision(): PendingDecision | null {
    return this.pendingDecision
  }

  getContext(): WorkflowContext {
    return this.ctx.getSnapshot()
  }

  private async waitForResume(): Promise<void> {
    return new Promise<void>((resolve) => {
      let resolved = false
      const doResolve = () => {
        if (resolved) return
        resolved = true
        this.resolveWait = null
        resolve()
      }
      this.resolveWait = doResolve
      const check = () => {
        if (this._state === 'running' || this._state === 'cancelled') {
          doResolve()
        } else {
          setTimeout(check, 100)
        }
      }
      setTimeout(check, 100)
    })
  }

  private async executeNode(nodeId: string): Promise<void> {
    if (this.isState('cancelled')) return
    if (this._state === 'paused') await this.waitForResume()
    if (this.isState('cancelled')) return

    if (this.executionPath.has(nodeId)) {
      throw new Error(`检测到循环引用: 节点 "${nodeId}" 在当前执行路径中已被访问`)
    }
    this.executionPath.add(nodeId)

    try {
      if (this.skipTarget) {
        if (nodeId === this.skipTarget) {
          this.skipTarget = null
        } else {
          return
        }
      }

      const graph = this.currentGraph()
      const nodeDef = graph.nodes.find(n => n.id === nodeId)
      if (!nodeDef) throw new Error(`节点 "${nodeId}" 未找到`)

      this.ctx.setCurrentNode(nodeId)
      this.emitter.emit({ type: 'node_started', nodeId, runId: this.ctx.get().metadata.runId })

      if (nodeDef.type === 'condition') {
        await this.executeConditionNode(nodeDef)
        return
      }

      if (nodeDef.type === 'agent_decision') {
        await this.executeAgentDecisionNode(nodeDef)
        return
      }

      if (nodeDef.type === 'skip') {
        await this.executeSkipNode(nodeDef)
        return
      }

      if (nodeDef.type === 'loop') {
        await this.executeLoopNode(nodeDef)
        return
      }

      if (nodeDef.type === 'iterate') {
        await this.executeIterateNode(nodeDef)
        return
      }

      if (nodeDef.type === 'parallel') {
        await this.executeParallelNode(nodeDef)
        return
      }

      if (nodeDef.type === 'sub_workflow') {
        await this.executeSubWorkflowNode(nodeDef)
        return
      }

      const handler = nodeRegistry.get(nodeDef.type)
      if (!handler) throw new Error(`未注册的节点类型: "${nodeDef.type}"`)

      const resolvedConfig = resolveValue(nodeDef.config, this.ctx.get()) as Record<string, unknown>
      const api = this.createNodeAPI()

      const output = await this.executeWithRetry(nodeDef, resolvedConfig, api, handler.execute.bind(handler))
      this.ctx.setNodeOutput(nodeId, output)
      this.emitter.emit({ type: 'node_completed', nodeId, runId: this.ctx.get().metadata.runId, output })

      if (output.status === 'failed' && nodeDef.error_handling?.on_failure === 'abort') {
        this._state = 'failed'
        return
      }

      if (nodeDef.type === 'end') return

      await this.executeNextNodes(nodeId)
    } finally {
      this.executionPath.delete(nodeId)
    }
  }

  private async executeWithRetry(
    nodeDef: NodeDefinition,
    config: Record<string, unknown>,
    api: NodeExecutionAPI,
    executeFn: (config: Record<string, unknown>, ctx: WorkflowContext, api: NodeExecutionAPI) => Promise<NodeOutput>,
  ): Promise<NodeOutput> {
    const maxRetries = nodeDef.error_handling?.max_retries || 0
    const delay = nodeDef.error_handling?.retry_delay_ms || 1000
    let lastOutput: NodeOutput

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const startTime = Date.now()

      if (nodeDef.timeout) {
        let timeoutTimer: ReturnType<typeof setTimeout> | undefined
        const result = await Promise.race([
          executeFn(config, this.ctx.get(), api),
          new Promise<never>((_, reject) => {
            timeoutTimer = setTimeout(() => reject(new Error('节点执行超时')), nodeDef.timeout!)
            this.nodeTimers.set(nodeDef.id, timeoutTimer)
          }),
        ]).finally(() => {
          if (timeoutTimer !== undefined) {
            clearTimeout(timeoutTimer)
            this.nodeTimers.delete(nodeDef.id)
          }
        })
        lastOutput = result
      } else {
        lastOutput = await executeFn(config, this.ctx.get(), api)
      }

      if (!lastOutput.duration) lastOutput.duration = Date.now() - startTime

      if (lastOutput.status !== 'failed') return lastOutput

      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, delay * (attempt + 1)))
      }
    }

    const eh = nodeDef.error_handling
    if (!eh) return lastOutput!

    switch (eh.on_failure) {
      case 'skip':
        return { status: 'skipped', data: null, error: lastOutput!.error, duration: lastOutput!.duration }
      case 'abort':
        return lastOutput!
      case 'agent_decision':
        return lastOutput!
      case 'fallback':
        if (eh.fallback) {
          const fallbackHandler = nodeRegistry.get(eh.fallback.type)
          if (fallbackHandler) {
            return fallbackHandler.execute(eh.fallback.config, this.ctx.get(), api)
          }
        }
        return lastOutput!
      default:
        return lastOutput!
    }
  }

  private async executeConditionNode(nodeDef: NodeDefinition): Promise<void> {
    const handler = nodeRegistry.get('condition')!
    const api = this.createNodeAPI()
    const resolvedConfig = resolveValue(nodeDef.config, this.ctx.get()) as Record<string, unknown>
    const output = await handler.execute(resolvedConfig, this.ctx.get(), api)
    this.ctx.setNodeOutput(nodeDef.id, output)

    const branch = (output.data as { branch: string })?.branch || 'true'
    this.emitter.emit({
      type: 'condition_evaluated',
      nodeId: nodeDef.id,
      runId: this.ctx.get().metadata.runId,
      branch,
    })

    const graph = this.currentGraph()
    const matchingEdges = graph.edges.filter(e => e.from === nodeDef.id)
    for (const edge of matchingEdges) {
      const edgeLabel = (edge.label || '').toLowerCase()
      if (
        (branch === 'true' && (edgeLabel === '是' || edgeLabel === 'true' || edgeLabel === 'yes')) ||
        (branch === 'false' && (edgeLabel === '否' || edgeLabel === 'false' || edgeLabel === 'no'))
      ) {
        await this.executeNode(edge.to)
        return
      }
    }

    const defaultEdge = matchingEdges.find(e => !e.label)
    if (defaultEdge) {
      await this.executeNode(defaultEdge.to)
    }
  }

  private async executeAgentDecisionNode(nodeDef: NodeDefinition): Promise<void> {
    const options = (nodeDef.config.options as DecisionOption[]) || []
    this.pendingDecision = { nodeId: nodeDef.id, options }
    this.pendingDecisionChoice = null
    this._state = 'paused'

    this.emitter.emit({
      type: 'agent_decision_required',
      nodeId: nodeDef.id,
      runId: this.ctx.get().metadata.runId,
      options,
    })

    await new Promise<void>((resolve) => {
      this.pendingDecisionResolve = resolve
    })

    if (this.isState('cancelled')) return

    if (!this.pendingDecisionChoice) return
    const choice: DecisionOption = this.pendingDecisionChoice
    this.pendingDecisionChoice = null

    const graph = this.currentGraph()
    const matchingEdges = graph.edges.filter(e => e.from === nodeDef.id)
    const chosenEdge = matchingEdges.find(e => {
      const label = (e.label || '').toLowerCase()
      return label === choice.route?.toLowerCase() || label === choice.label?.toLowerCase()
    })

    if (chosenEdge) {
      await this.executeNode(chosenEdge.to)
    } else {
      await this.executeNextNodes(nodeDef.id)
    }
  }

  private async handleDecision(choice: string): Promise<void> {
    if (!this.pendingDecision) return
    const { nodeId, options } = this.pendingDecision
    const selected = options.find(o => o.label === choice || o.route === choice)
    if (!selected) return

    this.ctx.setNodeOutput(nodeId, {
      status: 'success',
      data: { choice: selected.label, route: selected.route },
      duration: 0,
    })

    this.pendingDecision = null
    this._state = 'running'
    this.pendingDecisionChoice = selected

    if (this.pendingDecisionResolve) {
      this.pendingDecisionResolve()
      this.pendingDecisionResolve = null
    }
  }

  private async executeSkipNode(nodeDef: NodeDefinition): Promise<void> {
    const targetId = nodeDef.config.target as string
    const condition = nodeDef.config.condition as string | undefined

    if (condition) {
      const resolved = resolveVars(condition, this.ctx.get())
      try {
        const shouldSkip = Function(`"use strict"; return (${resolved})`)() as boolean
        if (!shouldSkip) {
          await this.executeNextNodes(nodeDef.id)
          return
        }
      } catch {
        await this.executeNextNodes(nodeDef.id)
        return
      }
    }

    this.emitter.emit({
      type: 'skip_executed',
      fromNodeId: nodeDef.id,
      toNodeId: targetId,
      runId: this.ctx.get().metadata.runId,
    })
    await this.executeNode(targetId)
  }

  private async executeLoopNode(nodeDef: NodeDefinition): Promise<void> {
    const maxIterations = (nodeDef.config.max_iterations as number) || 10
    const condition = nodeDef.config.condition as string | undefined
    const subGraph = nodeDef.sub_graph
    if (!subGraph) return

    this.ctx.resetLoopResults()

    for (let i = 0; i < maxIterations; i++) {
      if (this.isState('cancelled')) return

      this.emitter.emit({
        type: 'loop_iteration',
        nodeId: nodeDef.id,
        runId: this.ctx.get().metadata.runId,
        iteration: i + 1,
      })

      this.ctx.setVariable('loop_iteration', i + 1)
      await this.executeSubGraph(subGraph)
      this.ctx.pushLoopResult(JSON.parse(JSON.stringify(this.ctx.get().nodes)))

      if (condition && i < maxIterations - 1) {
        const resolved = resolveVars(condition, this.ctx.get())
        try {
          const shouldContinue = Function(`"use strict"; return (${resolved})`)() as boolean
          if (!shouldContinue) break
        } catch { break }
      }
    }

    this.ctx.setNodeOutput(nodeDef.id, {
      status: 'success',
      data: { iterations: this.ctx.get().loop_results.length, results: this.ctx.get().loop_results },
      duration: 0,
    })
    await this.executeNextNodes(nodeDef.id)
  }

  private async executeIterateNode(nodeDef: NodeDefinition): Promise<void> {
    const collectionPath = nodeDef.config.collection as string
    const itemVar = (nodeDef.config.item_var as string) || 'item'
    const subGraph = nodeDef.sub_graph
    if (!subGraph) return

    const { resolveVar } = await import('./resolvers/template-resolver')
    const collection = resolveVar(collectionPath, this.ctx.get()) as unknown[]
    if (!Array.isArray(collection)) {
      this.ctx.setNodeOutput(nodeDef.id, {
        status: 'failed', data: null, error: `collection "${collectionPath}" 不是数组`, duration: 0,
      })
      await this.executeNextNodes(nodeDef.id)
      return
    }

    this.ctx.resetIterateResults()

    for (const item of collection) {
      if (this.isState('cancelled')) return
      this.ctx.setVariable(itemVar, item)
      await this.executeSubGraph(subGraph)
      this.ctx.pushIterateResult(JSON.parse(JSON.stringify(this.ctx.get().nodes)))
    }

    this.ctx.setNodeOutput(nodeDef.id, {
      status: 'success',
      data: { count: collection.length, results: this.ctx.get().iterate_results },
      duration: 0,
    })
    await this.executeNextNodes(nodeDef.id)
  }

  private async executeParallelNode(nodeDef: NodeDefinition): Promise<void> {
    const subGraph = nodeDef.sub_graph
    if (!subGraph) return

    const branchStarts = subGraph.nodes.filter(n =>
      n.type === 'start' || !subGraph.edges.some(e => e.to === n.id)
    )

    const results: Record<string, NodeOutput>[] = []

    for (const branchStart of branchStarts) {
      if (this.isState('cancelled')) return

      this.graphStack.push(subGraph)
      try {
        await this.executeNode(branchStart.id)
      } finally {
        this.graphStack.pop()
      }

      results.push(JSON.parse(JSON.stringify(this.ctx.get().nodes)))
    }

    this.ctx.setNodeOutput(nodeDef.id, {
      status: 'success',
      data: results,
      duration: 0,
    })
    await this.executeNextNodes(nodeDef.id)
  }

  private async executeSubWorkflowNode(nodeDef: NodeDefinition): Promise<void> {
    const workflowId = nodeDef.config.workflow_id as string
    const subParams = resolveValue(nodeDef.config.params || {}, this.ctx.get()) as Record<string, unknown>

    const subDef = await this.loadWorkflowDefinition(workflowId)
    if (!subDef) {
      this.ctx.setNodeOutput(nodeDef.id, {
        status: 'failed', data: null, error: `子工作流 "${workflowId}" 未找到`, duration: 0,
      })
      await this.executeNextNodes(nodeDef.id)
      return
    }

    const subEmitter = new WorkflowEventEmitter()
    subEmitter.on(event => this.emitter.emit(event))

    const subExecutor = new WorkflowExecutor(subDef, subParams, subEmitter)
    await subExecutor.run()

    this.ctx.setNodeOutput(nodeDef.id, {
      status: 'success',
      data: subExecutor.getContext().nodes,
      duration: 0,
    })
    await this.executeNextNodes(nodeDef.id)
  }

  private async loadWorkflowDefinition(workflowId: string): Promise<WorkflowDefinition | null> {
    if (typeof window !== 'undefined') {
      const sharedDefs = (window as any).__worldsmith_workflow_definitions as Map<string, any> | undefined
      if (sharedDefs) {
        let def = sharedDefs.get(workflowId)
        if (def) {
          if (typeof def === 'string') {
            const { parseDefinition } = await import('./parser')
            def = parseDefinition(def)
          }
          return def as WorkflowDefinition
        }
      }
    }
    return null
  }

  private async executeSubGraph(subGraph: WorkflowGraph): Promise<void> {
    const startNode = subGraph.nodes.find(n => n.type === 'start') || subGraph.nodes[0]
    if (!startNode) return

    this.graphStack.push(subGraph)
    try {
      await this.executeNode(startNode.id)
    } finally {
      this.graphStack.pop()
    }
  }

  private async executeNextNodes(nodeId: string): Promise<void> {
    const graph = this.currentGraph()
    const nextEdges = graph.edges.filter(e => e.from === nodeId)
    for (const edge of nextEdges) {
      if (this.isState('cancelled')) return
      await this.executeNode(edge.to)
    }
  }

  private createNodeAPI(): NodeExecutionAPI {
    return {
      callTool: async (toolName: string, args: Record<string, unknown>) => {
        return JSON.stringify({ ok: true, tool: toolName, args })
      },
      resolveVars: (template: string, ctx: WorkflowContext) => resolveVars(template, ctx),
      dispatchSubAgent: async (type: string, prompt: string) => {
        return JSON.stringify({ ok: true, type, prompt })
      },
      emitEvent: (event: WorkflowEvent) => this.emitter.emit(event),
    }
  }
}
