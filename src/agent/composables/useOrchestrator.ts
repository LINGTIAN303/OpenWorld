import { reactive, ref, onMounted, onBeforeUnmount } from 'vue'
import type { AgentInfo, AgentType, SubAgentTask } from '@agent/orchestrator/types'
import { AGENT_TYPE_CONFIG } from '@agent/orchestrator/types'

interface PipelineContext {
  pipelineId: string
  stepId: string
}

export interface SubAgentState {
  id: string
  type: AgentType
  icon: string
  name: string
  status: AgentInfo['status']
  visible: boolean
  messages: any[]
  result: string | null
  startedAt: number | null
  completedAt: number | null
  duration: number | null
  error: string | null
  /** 创作编排上下文，子 Agent 完成后自动更新 Pipeline 步骤状态 */
  pipelineContext?: PipelineContext
}

type ExecuteFn = (task: {
  id: string
  type: AgentType
  prompt: string
  skillIds: string[]
  timeout: number
  images?: { data: string; mimeType: string }[]
}) => Promise<{ success: boolean; output: string; duration: number }>

const subAgents = reactive<Map<string, SubAgentState>>(new Map())
const maxConcurrency = ref(3)
let executeFn: ExecuteFn | null = null
let listenersAttached = false
let activeExecutions: Map<string, AbortController> = new Map()

function syncToWindow(): void {
  try {
    ; (window as any).__worldsmith_sub_agents = subAgents
  } catch { }
}

/** 子 Agent 完成后自动更新 Pipeline 步骤状态 */
async function autoUpdatePipelineStep(
  ctx: PipelineContext,
  success: boolean,
  output: string,
): Promise<void> {
  try {
    const { useEntityStore } = await import('@worldsmith/entity-core')
    const store = useEntityStore()
    const entity = await store.getById(ctx.pipelineId)
    if (!entity || entity.type !== 'pipeline') return

    const p = entity.properties || {}
    let steps: any[] = []
    try { steps = JSON.parse((p.steps as string) || '[]') } catch { return }

    const idx = steps.findIndex((s: any) => s.id === ctx.stepId)
    if (idx < 0) return

    if (success) {
      steps[idx] = { ...steps[idx], status: 'completed', output: { summary: output.slice(0, 500) } }
    } else {
      steps[idx] = { ...steps[idx], status: 'failed', output: { summary: `失败: ${output.slice(0, 200)}` } }
    }

    // 检查是否所有步骤都完成（包含失败，因失败步骤可重试）
    const allTerminal = steps.every(
      (s: any) => s.status === 'completed' || s.status === 'skipped' || s.status === 'failed',
    )
    const anyPendingOrRunning = steps.some(
      (s: any) => s.status === 'pending' || s.status === 'running',
    )

    // 只有全部步骤终态且无待执行时才判断最终状态
    let newStatus: string
    if (allTerminal && !anyPendingOrRunning) {
      const anyFailed = steps.some((s: any) => s.status === 'failed')
      newStatus = anyFailed ? 'failed' : 'completed'
    } else {
      newStatus = 'running'
    }

    await store.update(ctx.pipelineId, {
      properties: {
        ...p,
        steps: JSON.stringify(steps),
        status: newStatus,
        ...(allCompleted || anyFailed ? { currentStepId: null } : {}),
      },
    }, 'agent')
  } catch (err) {
    console.error('[useOrchestrator] autoUpdatePipelineStep failed:', err)
  }
}

export function useOrchestrator() {
  function getSubAgents(): SubAgentState[] {
    return Array.from(subAgents.values())
  }

  function getActiveSubAgents(): SubAgentState[] {
    return Array.from(subAgents.values()).filter(a => a.status === 'running')
  }

  function addSubAgent(task: SubAgentTask): void {
    const typeConfig = AGENT_TYPE_CONFIG[task.type]
    subAgents.set(task.id, {
      id: task.id,
      type: task.type,
      icon: typeConfig.icon,
      name: typeConfig.name,
      status: 'pending',
      visible: true,
      messages: [],
      result: null,
      startedAt: null,
      completedAt: null,
      duration: null,
      error: null,
      pipelineContext: task.pipelineContext,
    })
    syncToWindow()
  }

  function updateSubAgentStatus(id: string, status: AgentInfo['status'], error?: string): void {
    const agent = subAgents.get(id)
    if (!agent) return
    agent.status = status
    if (error) agent.error = error
    if (status === 'running' && !agent.startedAt) agent.startedAt = Date.now()
    if (status === 'completed' || status === 'failed' || status === 'timeout' || status === 'cancelled') {
      agent.completedAt = Date.now()
      if (agent.startedAt) agent.duration = agent.completedAt - agent.startedAt
    }
    syncToWindow()
  }

  function setSubAgentResult(id: string, result: string): void {
    const agent = subAgents.get(id)
    if (!agent) return
    agent.result = result
    syncToWindow()
  }

  function addSubAgentMessage(id: string, message: any): void {
    const agent = subAgents.get(id)
    if (!agent) return
    agent.messages.push(message)
  }

  function toggleSubAgentVisible(id: string): void {
    const agent = subAgents.get(id)
    if (!agent) return
    agent.visible = !agent.visible
  }

  function showSubAgent(id: string): void {
    const agent = subAgents.get(id)
    if (!agent) return
    agent.visible = true
  }

  function hideSubAgent(id: string): void {
    const agent = subAgents.get(id)
    if (!agent) return
    agent.visible = false
  }

  function removeSubAgent(id: string): void {
    subAgents.delete(id)
    syncToWindow()
  }

  function clearCompleted(): void {
    for (const [id, agent] of subAgents) {
      if (agent.status === 'completed' || agent.status === 'failed' || agent.status === 'timeout' || agent.status === 'cancelled') {
        subAgents.delete(id)
      }
    }
    syncToWindow()
  }

  function registerExecutor(fn: ExecuteFn): void {
    executeFn = fn
  }

  async function handleDispatchEvent(e: Event): Promise<void> {
    const detail = (e as CustomEvent).detail
    if (!detail) return

    const { taskId, type, prompt, timeout, skillIds } = detail
    const pipelineContext: PipelineContext | undefined = detail.pipelineContext

    if (subAgents.has(taskId)) return

    addSubAgent({
      id: taskId,
      type,
      prompt,
      skillIds,
      timeout,
      pipelineContext,
    })
    updateSubAgentStatus(taskId, 'running')

    if (!executeFn) {
      updateSubAgentStatus(taskId, 'failed', '执行器未注册，无法创建子 Agent')
      return
    }

    const controller = new AbortController()
    activeExecutions.set(taskId, controller)

    try {
      const result = await executeFn({ id: taskId, type, prompt, skillIds: skillIds || [], timeout: timeout || 120000, images: detail.images })
      if (controller.signal.aborted) return
      updateSubAgentStatus(taskId, result.success ? 'completed' : 'failed')
      setSubAgentResult(taskId, result.output)

      // 如果有 Pipeline 上下文，自动更新步骤状态
      if (pipelineContext) {
        await autoUpdatePipelineStep(pipelineContext, result.success, result.output)
        // 成功完成时通知前端自动继续下一个步骤
        if (result.success) {
          window.dispatchEvent(new CustomEvent('worldsmith:pipeline-step-completed', {
            detail: {
              pipelineId: pipelineContext.pipelineId,
              stepId: pipelineContext.stepId,
            },
          }))
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return
      const errMsg = err instanceof Error ? err.message : String(err)
      updateSubAgentStatus(taskId, 'failed', errMsg)

      // 子 Agent 失败也更新 Pipeline 步骤状态
      if (pipelineContext) {
        await autoUpdatePipelineStep(pipelineContext, false, errMsg)
      }
    } finally {
      activeExecutions.delete(taskId)
    }
  }

  function handleCancelEvent(e: Event): void {
    const { taskId } = (e as CustomEvent).detail
    const controller = activeExecutions.get(taskId)
    if (controller) {
      controller.abort()
      activeExecutions.delete(taskId)
    }
    updateSubAgentStatus(taskId, 'cancelled')
  }

  function handleGetStatusEvent(e: Event): void {
    syncToWindow()
  }

  function handleDispatchEventWrapper(e: Event): void {
    handleDispatchEvent(e).catch(() => { })
  }

  function attachListeners(): void {
    if (listenersAttached) return
    listenersAttached = true
    window.addEventListener('worldsmith:dispatch-sub-agent', handleDispatchEventWrapper)
    window.addEventListener('worldsmith:cancel-sub-agent', handleCancelEvent as EventListener)
    window.addEventListener('worldsmith:get-sub-agent-status', handleGetStatusEvent as EventListener)
    syncToWindow()
  }

  function detachListeners(): void {
    if (!listenersAttached) return
    listenersAttached = false
    window.removeEventListener('worldsmith:dispatch-sub-agent', handleDispatchEventWrapper)
    window.removeEventListener('worldsmith:cancel-sub-agent', handleCancelEvent as EventListener)
    window.removeEventListener('worldsmith:get-sub-agent-status', handleGetStatusEvent as EventListener)
    try {
      delete (window as any).__worldsmith_sub_agents
    } catch { }
  }

  onMounted(() => {
    attachListeners()
  })

  onBeforeUnmount(() => {
    detachListeners()
  })

  return {
    subAgents,
    maxConcurrency,
    getSubAgents,
    getActiveSubAgents,
    addSubAgent,
    updateSubAgentStatus,
    setSubAgentResult,
    addSubAgentMessage,
    toggleSubAgentVisible,
    showSubAgent,
    hideSubAgent,
    removeSubAgent,
    clearCompleted,
    registerExecutor,
    attachListeners,
    detachListeners,
  }
}
