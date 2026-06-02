import { reactive, ref, onMounted, onBeforeUnmount } from 'vue'
import type { AgentInfo, AgentType, SubAgentTask } from '../../../worldsmith-agent/src/orchestrator/types'
import { AGENT_TYPE_CONFIG } from '../../../worldsmith-agent/src/orchestrator/types'

interface SubAgentState {
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
    ;(window as any).__worldsmith_sub_agents = subAgents
  } catch {}
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

    if (subAgents.has(taskId)) return

    addSubAgent({ id: taskId, type, prompt, skillIds, timeout })
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
    } catch (err) {
      if (controller.signal.aborted) return
      updateSubAgentStatus(taskId, 'failed', err instanceof Error ? err.message : String(err))
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
    handleDispatchEvent(e).catch(() => {})
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
    } catch {}
  }

  onMounted(() => {
    attachListeners()
  })

  onBeforeUnmount(() => {
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
