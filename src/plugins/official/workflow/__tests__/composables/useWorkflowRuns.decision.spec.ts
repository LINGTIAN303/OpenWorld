import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkflowRuns } from '@/plugins/official/workflow/composables/useWorkflowRuns'
import type { DecisionContext } from '@/plugins/official/workflow/types'

const sampleDecision: DecisionContext = {
  runId: 'r1', nodeId: 'n1', nodeName: 'decision', nodeType: 'agent_decision',
  prompt: '?', context: { summary: '', items: [] },
  options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
  defaultOption: 'a',
  decisionTimeoutMs: 300_000,
}

describe('useWorkflowRuns — decision events', () => {
  beforeEach(() => {
    // 重置 activeDecision + 取消之前测试的 listener
    const { unregisterListeners } = useWorkflowRuns()
    unregisterListeners()
  })

  it('exposes activeDecision ref (initially null)', () => {
    const { activeDecision } = useWorkflowRuns()
    expect(activeDecision.value).toBeNull()
  })

  it('sets activeDecision when workflow_node_paused event for agent_decision', () => {
    const { activeDecision } = useWorkflowRuns()
    window.dispatchEvent(new CustomEvent('worldsmith:workflow-run', {
      detail: { type: 'workflow_node_paused', payload: sampleDecision },
    }))
    expect(activeDecision.value).toEqual(sampleDecision)
  })

  it('ignores paused event for non agent_decision node', () => {
    const { activeDecision } = useWorkflowRuns()
    const otherPayload = { ...sampleDecision, nodeType: 'skill' }
    window.dispatchEvent(new CustomEvent('worldsmith:workflow-run', {
      detail: { type: 'workflow_node_paused', payload: otherPayload },
    }))
    expect(activeDecision.value).toBeNull()
  })

  it('resolveDecision clears activeDecision and dispatches resolved event', () => {
    const { activeDecision, resolveDecision } = useWorkflowRuns()
    window.dispatchEvent(new CustomEvent('worldsmith:workflow-run', {
      detail: { type: 'workflow_node_paused', payload: sampleDecision },
    }))
    let received: unknown = null
    window.addEventListener('worldsmith:workflow-run-resolved', (e) => {
      received = (e as CustomEvent).detail
    })
    resolveDecision({ choice: 'a', note: 'ok' })
    expect(activeDecision.value).toBeNull()
    expect(received).toEqual({ runId: 'r1', nodeId: 'n1', choice: 'a', note: 'ok' })
  })

  it('fallbackDecision uses defaultOption and clears activeDecision', () => {
    const { activeDecision, fallbackDecision } = useWorkflowRuns()
    window.dispatchEvent(new CustomEvent('worldsmith:workflow-run', {
      detail: { type: 'workflow_node_paused', payload: sampleDecision },
    }))
    fallbackDecision()
    expect(activeDecision.value).toBeNull()
  })

  it('dismissDecision dispatches worldsmith:workflow-run-dismissed and clears activeDecision', () => {
    const { activeDecision, dismissDecision } = useWorkflowRuns()
    window.dispatchEvent(new CustomEvent('worldsmith:workflow-run', {
      detail: { type: 'workflow_node_paused', payload: sampleDecision },
    }))
    let received: unknown = null
    window.addEventListener('worldsmith:workflow-run-dismissed', (e) => {
      received = (e as CustomEvent).detail
    })
    dismissDecision('user-dismissed')
    expect(activeDecision.value).toBeNull()
    expect(received).toEqual({ runId: 'r1', nodeId: 'n1', reason: 'user-dismissed' })
  })

  it('dismissDecision is a no-op when no active decision', () => {
    const { activeDecision, dismissDecision } = useWorkflowRuns()
    let fired = false
    window.addEventListener('worldsmith:workflow-run-dismissed', () => { fired = true })
    dismissDecision()
    expect(activeDecision.value).toBeNull()
    expect(fired).toBe(false)
  })
})
