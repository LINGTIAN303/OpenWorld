import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import AgentDecisionCard from '@/plugins/official/workflow/components/run/AgentDecisionCard.vue'
import type { DecisionContext } from '@/plugins/official/workflow/types'

function makeContext(overrides: Partial<DecisionContext> = {}): DecisionContext {
  return {
    runId: 'r1', nodeId: 'n1', nodeName: '选择模板', nodeType: 'agent_decision',
    prompt: '请选择适合的方案',
    context: { summary: 'AI 看到的数据汇总', items: [{ label: 'count', value: '3' }] },
    options: [{ id: 'low', label: '低风险' }, { id: 'mid', label: '中风险' }, { id: 'high', label: '高风险' }],
    defaultOption: 'mid',
    decisionTimeoutMs: 300_000,
    ...overrides,
  }
}

describe('AgentDecisionCard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders node name, prompt, and options when context provided', () => {
    const w = mount(AgentDecisionCard, { props: { context: makeContext() } })
    expect(w.text()).toContain('选择模板')
    expect(w.text()).toContain('请选择适合的方案')
    expect(w.text()).toContain('低风险')
    expect(w.text()).toContain('中风险')
    expect(w.text()).toContain('高风险')
    expect(w.findAll('[data-testid^="option-"]').length).toBe(3)
  })

  it('emits decide with choice and note on confirm', async () => {
    const w = mount(AgentDecisionCard, {
      props: { context: makeContext({ options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], defaultOption: 'a' }) },
    })
    await w.find('[data-testid="option-a"]').trigger('click')
    await w.find('[data-testid="confirm"]').trigger('click')
    expect(w.emitted('decide')![0]).toEqual([{ choice: 'a', note: '' }])
  })

  it('emits decide with free-input note when typed', async () => {
    const w = mount(AgentDecisionCard, {
      props: { context: makeContext({ options: [{ id: 'a', label: 'A' }] }) },
    })
    await w.find('[data-testid="option-a"]').trigger('click')
    await w.find('[data-testid="free-input"]').setValue('自定义备注')
    await w.find('[data-testid="confirm"]').trigger('click')
    expect(w.emitted('decide')![0]).toEqual([{ choice: 'a', note: '自定义备注' }])
  })

  it('emits dismiss on close button', async () => {
    const w = mount(AgentDecisionCard, {
      props: { context: makeContext({ options: [{ id: 'a', label: 'A' }] }) },
    })
    await w.find('[data-testid="dismiss"]').trigger('click')
    expect(w.emitted('dismiss')).toBeTruthy()
  })

  it('emits fallback on timeout using defaultOption', async () => {
    const w = mount(AgentDecisionCard, {
      props: { context: makeContext({ options: [{ id: 'a', label: 'A' }], defaultOption: 'a', decisionTimeoutMs: 1000 }) },
    })
    vi.advanceTimersByTime(1000)
    expect(w.emitted('fallback')).toBeTruthy()
    expect(w.emitted('fallback')![0]).toEqual(['a'])
  })

  it('does not emit fallback when decisionTimeoutMs=0', async () => {
    const w = mount(AgentDecisionCard, {
      props: { context: makeContext({ options: [{ id: 'a', label: 'A' }], defaultOption: 'a', decisionTimeoutMs: 0 }) },
    })
    vi.advanceTimersByTime(60_000)
    expect(w.emitted('fallback')).toBeFalsy()
  })
})
