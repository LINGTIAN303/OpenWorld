import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import WorkflowEditorView from '@/plugins/official/workflow/components/WorkflowEditorView.vue'
import { useEditorPreferences } from '@/plugins/official/workflow/composables/useEditorPreferences'
import { useWorkflowRuns } from '@/plugins/official/workflow/composables/useWorkflowRuns'
import type { DecisionContext } from '@/plugins/official/workflow/types'

const sampleDecision: DecisionContext = {
  runId: 'r1', nodeId: 'n1', nodeName: '选择风险等级', nodeType: 'agent_decision',
  prompt: '请选择本次执行的风险等级',
  context: { summary: '当前市场波动较大,建议高风险。', items: [{ label: 'volatility', value: '0.45' }] },
  options: [{ id: 'low', label: '低' }, { id: 'mid', label: '中' }, { id: 'high', label: '高' }],
  defaultOption: 'mid',
  decisionTimeoutMs: 300_000,
}

describe('agent_decision E2E — WorkflowEditorView', () => {
  beforeEach(() => {
    localStorage.clear()
    useEditorPreferences().reset()
    useWorkflowRuns().unregisterListeners()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('paused event → AgentDecisionCard opens → user picks option + confirm → cleared', async () => {
    const w = mount(WorkflowEditorView, { props: { workflowId: 'wf-1' } })
    await flushPromises()
    expect(w.find('[data-testid="decision-card"]').exists()).toBe(false)

    // 1. 后端派发节点暂停事件
    window.dispatchEvent(new CustomEvent('worldsmith:workflow-run', {
      detail: { type: 'workflow_node_paused', payload: sampleDecision },
    }))
    await flushPromises()
    expect(w.find('[data-testid="decision-card"]').exists()).toBe(true)

    // 2. 用户选 "高" 风险
    await w.find('[data-testid="option-high"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="option-high"]').classes()).toContain('selected')

    // 3. 用户点确认
    let resolvedPayload: unknown = null
    window.addEventListener('worldsmith:workflow-run-resolved', (e) => {
      resolvedPayload = (e as CustomEvent).detail
    })
    await w.find('[data-testid="confirm"]').trigger('click')
    await flushPromises()
    expect(resolvedPayload).toEqual({ runId: 'r1', nodeId: 'n1', choice: 'high', note: '' })
    expect(w.find('[data-testid="decision-card"]').exists()).toBe(false)
    expect(useWorkflowRuns().activeDecision.value).toBeNull()
  })

  it('5min timeout with no user action → fallback to defaultOption (mid)', async () => {
    vi.useFakeTimers()
    mount(WorkflowEditorView, { props: { workflowId: 'wf-2' } })
    await flushPromises()

    window.dispatchEvent(new CustomEvent('worldsmith:workflow-run', {
      detail: { type: 'workflow_node_paused', payload: { ...sampleDecision, decisionTimeoutMs: 1000 } },
    }))
    await flushPromises()

    let resolvedPayload: unknown = null
    window.addEventListener('worldsmith:workflow-run-resolved', (e) => {
      resolvedPayload = (e as CustomEvent).detail
    })

    // 不做任何用户操作,等超时
    vi.advanceTimersByTime(1000)
    await flushPromises()
    expect(resolvedPayload).toEqual({ runId: 'r1', nodeId: 'n1', choice: 'mid', note: '(fallback)' })
    expect(useWorkflowRuns().activeDecision.value).toBeNull()
  })

  it('node_paused event for non agent_decision is ignored (no card)', async () => {
    const w = mount(WorkflowEditorView, { props: { workflowId: 'wf-3' } })
    await flushPromises()
    window.dispatchEvent(new CustomEvent('worldsmith:workflow-run', {
      detail: { type: 'workflow_node_paused', payload: { ...sampleDecision, nodeType: 'skill' } },
    }))
    await flushPromises()
    expect(w.find('[data-testid="decision-card"]').exists()).toBe(false)
  })
})
