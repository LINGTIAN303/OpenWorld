import { ref, readonly } from 'vue'
import type { AgentEvent } from '@agent/index'

export interface ToolCallView {
  id: string
  name: string
  args: Record<string, unknown>
  status: 'running' | 'completed' | 'failed'
  result?: string
  startedAt: number
  endedAt?: number
  progress: number
}

const toolCalls = ref<ToolCallView[]>([])
const isProcessing = ref(false)
const currentThinking = ref('')

export function useAgentEvents() {
  function handleEvent(event: AgentEvent): void {
    switch (event.type) {
      case 'agent_start':
        isProcessing.value = true
        currentThinking.value = ''
        toolCalls.value = []
        break
      case 'agent_end':
        isProcessing.value = false
        currentThinking.value = ''
        break
      case 'message_update':
        if (event.thinking) {
          currentThinking.value = event.thinking
        }
        break
      case 'message_end':
        currentThinking.value = ''
        break
      case 'tool_execution_start':
        currentThinking.value = ''
        const dupIdx = toolCalls.value.findIndex(tc => tc.id === event.toolCall.id)
        if (dupIdx !== -1) {
          const updated = [...toolCalls.value]
          updated[dupIdx] = { ...updated[dupIdx], status: 'running', startedAt: Date.now(), progress: 0 }
          toolCalls.value = updated
        } else {
          toolCalls.value = [...toolCalls.value, {
            id: event.toolCall.id,
            name: event.toolCall.name,
            args: event.toolCall.args,
            status: 'running',
            startedAt: Date.now(),
            progress: 0,
          }]
        }
        break
      case 'tool_execution_update':
        const updateIdx = toolCalls.value.findIndex(tc => tc.id === event.toolCallId)
        if (updateIdx !== -1) {
          const updated = [...toolCalls.value]
          updated[updateIdx] = { ...updated[updateIdx], progress: event.progress }
          toolCalls.value = updated
        }
        break
      case 'tool_execution_end':
        const endIdx = toolCalls.value.findIndex(tc => tc.id === event.toolCallId)
        if (endIdx !== -1) {
          const updated = [...toolCalls.value]
          updated[endIdx] = {
            ...updated[endIdx],
            status: event.success ? 'completed' : 'failed',
            result: event.result,
            endedAt: Date.now(),
            progress: 100,
          }
          toolCalls.value = updated
        }
        break
    }
  }

  function removeEntityFromResults(entityId: string): void {
    const updated = toolCalls.value.map(tc => {
      if (tc.name !== 'entity_list' || !tc.result) return tc
      try {
        const obj = JSON.parse(tc.result)
        if (!obj || !Array.isArray(obj.entities)) return tc
        const filtered = obj.entities.filter((e: any) => e.id !== entityId)
        if (filtered.length === obj.entities.length) return tc
        const newObj = { ...obj, entities: filtered }
        if (typeof newObj.total === 'number') newObj.total = Math.max(0, newObj.total - 1)
        if (typeof newObj.showing === 'number') newObj.showing = filtered.length
        return { ...tc, result: JSON.stringify(newObj) }
      } catch {
        return tc
      }
    })
    toolCalls.value = updated
  }

  function clearToolCalls(): void {
    toolCalls.value = []
  }

  return {
    toolCalls: readonly(toolCalls),
    isProcessing: readonly(isProcessing),
    currentThinking: readonly(currentThinking),
    handleEvent,
    clearToolCalls,
    removeEntityFromResults,
  }
}
