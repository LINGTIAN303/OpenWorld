import type {
  DispatchMode,
  OrchestratorConfig,
  SubAgentTask,
  SubAgentResult,
  AgentInfo,
  AgentType,
} from './types'
import { DEFAULT_ORCHESTRATOR_CONFIG, AGENT_TYPE_CONFIG } from './types'
import type { CoreBackend } from '../bridge'

type StatusCallback = (agents: Map<string, AgentInfo>) => void
type CreateBackendFn = (type: AgentType, skillIds: string[]) => CoreBackend

export class AgentOrchestrator {
  private agents: Map<string, CoreBackend> = new Map()
  private agentInfos: Map<string, AgentInfo> = new Map()
  private config: OrchestratorConfig
  private runningCount: number = 0
  private requestTimestamps: number[] = []
  private statusCallbacks: Set<StatusCallback> = new Set()
  private mainAgentId: string = 'main'

  constructor(config?: Partial<OrchestratorConfig>) {
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config }
  }

  registerMainAgent(id: string, backend: CoreBackend): void {
    this.mainAgentId = id
    this.agents.set(id, backend)
    this.agentInfos.set(id, {
      id,
      type: 'terminal-worker' as AgentType,
      status: 'completed',
      startedAt: null,
      completedAt: null,
      error: null,
    })
  }

  async spawnSubAgent(
    task: SubAgentTask,
    createBackend: CreateBackendFn,
  ): Promise<string> {
    const typeConfig = AGENT_TYPE_CONFIG[task.type]
    if (!typeConfig) throw new Error(`Unknown agent type: ${task.type}`)

    const skillIds = task.skillIds || typeConfig.skillIds
    const backend = createBackend(task.type, skillIds)
    this.agents.set(task.id, backend)
    this.agentInfos.set(task.id, {
      id: task.id,
      type: task.type,
      status: 'pending',
      startedAt: null,
      completedAt: null,
      error: null,
    })

    this.notifyStatus()
    return task.id
  }

  async dispatch(
    tasks: SubAgentTask[],
    mode: DispatchMode = 'concurrent',
    createBackend: CreateBackendFn,
  ): Promise<SubAgentResult[]> {
    for (const task of tasks) {
      await this.spawnSubAgent(task, createBackend)
    }

    switch (mode) {
      case 'sequential':
        return this.dispatchSequential(tasks)
      case 'concurrent':
        return this.dispatchConcurrent(tasks)
      case 'streaming':
        return this.dispatchStreaming(tasks)
      default:
        return this.dispatchConcurrent(tasks)
    }
  }

  private async dispatchSequential(tasks: SubAgentTask[]): Promise<SubAgentResult[]> {
    const results: SubAgentResult[] = []
    for (const task of tasks) {
      const result = await this.executeTask(task)
      results.push(result)
      if (!result.success) break
    }
    return results
  }

  private async dispatchConcurrent(tasks: SubAgentTask[]): Promise<SubAgentResult[]> {
    const queue = [...tasks]
    const results: SubAgentResult[] = []
    const running: Promise<SubAgentResult>[] = []

    const startNext = (): Promise<SubAgentResult> | null => {
      if (queue.length === 0) return null
      const task = queue.shift()!
      const promise = this.executeTask(task)
      running.push(promise)
      return promise
    }

    while (queue.length > 0 && this.runningCount < this.config.maxConcurrency) {
      startNext()
    }

    while (running.length > 0) {
      const settled = await Promise.race(
        running.map((p, i) => p.then(r => ({ index: i, result: r })))
      )
      running.splice(settled.index, 1)
      results.push(settled.result)
      startNext()
    }

    return results
  }

  private async dispatchStreaming(tasks: SubAgentTask[]): Promise<SubAgentResult[]> {
    const batchSize = Math.min(tasks.length, this.config.maxConcurrency)
    const results: SubAgentResult[] = []

    for (let i = 0; i < tasks.length; i += batchSize) {
      const batch = tasks.slice(i, i + batchSize)
      const batchResults = await Promise.all(batch.map(t => this.executeTask(t)))
      results.push(...batchResults)
    }

    return results
  }

  private async executeTask(task: SubAgentTask): Promise<SubAgentResult> {
    await this.waitForRateLimit()

    const info = this.agentInfos.get(task.id)!
    info.status = 'running'
    info.startedAt = Date.now()
    this.runningCount++
    this.notifyStatus()

    const timeout = task.timeout || this.config.defaultTimeout

    try {
      const backend = this.agents.get(task.id)
      if (!backend) throw new Error(`Agent "${task.id}" not found`)

      const result = await Promise.race([
        backend.prompt(task.prompt),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), timeout)
        ),
      ])

      info.status = 'completed'
      info.completedAt = Date.now()
      info.error = null

      return {
        taskId: task.id,
        success: true,
        output: typeof result === 'string' ? result : JSON.stringify(result),
        duration: Date.now() - (info.startedAt || Date.now()),
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      info.status = msg === 'Timeout' ? 'timeout' : 'failed'
      info.completedAt = Date.now()
      info.error = msg

      return {
        taskId: task.id,
        success: false,
        output: msg,
        duration: Date.now() - (info.startedAt || Date.now()),
      }
    } finally {
      this.runningCount--
      const backend = this.agents.get(task.id)
      if (backend && typeof backend.dispose === 'function') {
        try { backend.dispose() } catch {}
      }
      this.agents.delete(task.id)
      this.notifyStatus()
    }
  }

  terminate(subAgentId: string): void {
    const info = this.agentInfos.get(subAgentId)
    if (!info || info.status !== 'running') return

    info.status = 'cancelled'
    info.completedAt = Date.now()
    this.runningCount--
    this.notifyStatus()
  }

  getStatus(): Map<string, AgentInfo> {
    return new Map(this.agentInfos)
  }

  getSubAgents(): AgentInfo[] {
    return Array.from(this.agentInfos.values()).filter(a => a.id !== this.mainAgentId)
  }

  onStatusChange(callback: StatusCallback): () => void {
    this.statusCallbacks.add(callback)
    return () => this.statusCallbacks.delete(callback)
  }

  cleanup(): void {
    for (const [id, info] of this.agentInfos) {
      if (id === this.mainAgentId) continue
      if (info.status === 'running') {
        this.terminate(id)
      }
      if (info.status === 'completed' || info.status === 'failed' || info.status === 'timeout' || info.status === 'cancelled') {
        this.agents.delete(id)
        this.agentInfos.delete(id)
      }
    }
    this.notifyStatus()
  }

  private notifyStatus(): void {
    const snapshot = new Map(this.agentInfos)
    for (const cb of this.statusCallbacks) {
      try { cb(snapshot) } catch {}
    }
  }

  private async waitForRateLimit(): Promise<void> {
    const now = Date.now()
    this.requestTimestamps = this.requestTimestamps.filter(t => now - t < 60000)

    if (this.requestTimestamps.length >= this.config.rateLimitPerMinute) {
      const oldestInWindow = this.requestTimestamps[0]
      const waitMs = 60000 - (now - oldestInWindow) + 100
      await new Promise(r => setTimeout(r, waitMs))
    }

    this.requestTimestamps.push(Date.now())
  }
}
