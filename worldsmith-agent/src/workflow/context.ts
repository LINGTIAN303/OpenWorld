import type { WorkflowContext, NodeOutput } from './types'

export class ContextManager {
  private ctx: WorkflowContext

  constructor(workflowId: string, runId: string, params: Record<string, unknown>) {
    this.ctx = {
      params,
      nodes: {},
      variables: {},
      loop_results: [],
      iterate_results: [],
      metadata: {
        workflowId,
        runId,
        startedAt: Date.now(),
        currentNodeId: null,
      },
    }
  }

  get(): WorkflowContext {
    return this.ctx
  }

  getSnapshot(): WorkflowContext {
    return JSON.parse(JSON.stringify(this.ctx))
  }

  setNodeOutput(nodeId: string, output: NodeOutput): void {
    this.ctx.nodes[nodeId] = output
  }

  getNodeOutput(nodeId: string): NodeOutput | undefined {
    return this.ctx.nodes[nodeId]
  }

  setCurrentNode(nodeId: string | null): void {
    this.ctx.metadata.currentNodeId = nodeId
  }

  setVariable(key: string, value: unknown): void {
    this.ctx.variables[key] = value
  }

  pushLoopResult(result: unknown): void {
    this.ctx.loop_results.push(result)
  }

  pushIterateResult(result: unknown): void {
    this.ctx.iterate_results.push(result)
  }

  resetLoopResults(): void {
    this.ctx.loop_results = []
  }

  resetIterateResults(): void {
    this.ctx.iterate_results = []
  }

  snapshot(): string {
    return JSON.stringify(this.ctx)
  }

  restore(snapshot: string): void {
    try {
      const parsed = JSON.parse(snapshot)
      Object.assign(this.ctx, parsed)
    } catch {}
  }
}
