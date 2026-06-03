import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import WorkflowEditorView from '@/plugins/official/workflow/components/WorkflowEditorView.vue'
import { useEditorPreferences } from '@/plugins/official/workflow/composables/useEditorPreferences'
import { useWorkflowRuns } from '@/plugins/official/workflow/composables/useWorkflowRuns'
import type { DecisionContext } from '@/plugins/official/workflow/types'

const sampleDecision: DecisionContext = {
  runId: 'r1', nodeId: 'n1', nodeName: '决策点', nodeType: 'agent_decision',
  prompt: '?',
  context: { summary: 'ctx', items: [] },
  options: [{ id: 'a', label: 'A' }],
  defaultOption: 'a',
  decisionTimeoutMs: 60_000,
}

describe('WorkflowEditorView — preferences + decision UI', () => {
  beforeEach(() => {
    localStorage.clear()
    useEditorPreferences().reset()
    useWorkflowRuns().unregisterListeners()
  })

  it('uses ThreeViewLayout (palette + canvas slots)', async () => {
    const w = mount(WorkflowEditorView, { props: { workflowId: 'wf-1' } })
    await flushPromises()
    expect(w.find('[data-testid="layout-palette"]').exists()).toBe(true)
    expect(w.find('[data-testid="layout-canvas"]').exists()).toBe(true)
  })

  it('defaults to sidebar edit method (inspector visible)', async () => {
    const w = mount(WorkflowEditorView, { props: { workflowId: 'wf-1' } })
    await flushPromises()
    expect(w.find('[data-testid="layout-inspector"]').exists()).toBe(true)
  })

  it('switches to inline edit method when prefs.editMethod=inline', async () => {
    const prefs = useEditorPreferences()
    prefs.setEditMethod('inline')
    const w = mount(WorkflowEditorView, { props: { workflowId: 'wf-1' } })
    await flushPromises()
    expect(w.find('[data-testid="layout-inspector"]').exists()).toBe(false)
    expect(w.find('[data-testid="layout-inline-editor"]').exists()).toBe(true)
  })

  it('switches to hover edit method when prefs.editMethod=hover', async () => {
    const prefs = useEditorPreferences()
    prefs.setEditMethod('hover')
    const w = mount(WorkflowEditorView, { props: { workflowId: 'wf-1' } })
    await flushPromises()
    expect(w.find('[data-testid="layout-inspector"]').exists()).toBe(false)
    expect(w.find('[data-testid="layout-hover-layer"]').exists()).toBe(true)
  })

  it('renders AgentDecisionCard when useWorkflowRuns activeDecision is set', async () => {
    const w = mount(WorkflowEditorView, { props: { workflowId: 'wf-1' } })
    await flushPromises()
    expect(w.find('[data-testid="decision-card"]').exists()).toBe(false)
    useWorkflowRuns().activeDecision.value = sampleDecision
    await flushPromises()
    expect(w.find('[data-testid="decision-card"]').exists()).toBe(true)
  })
})
