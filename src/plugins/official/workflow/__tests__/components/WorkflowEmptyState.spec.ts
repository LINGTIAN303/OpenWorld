import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import WorkflowEmptyState from '../../components/WorkflowEmptyState.vue'

describe('WorkflowEmptyState', () => {
  it('renders no-workflow preset by default', () => {
    const w = mount(WorkflowEmptyState)
    expect(w.text()).toContain('工作流')
  })

  it('shows 2 CTAs: Agent / 手动', () => {
    const w = mount(WorkflowEmptyState)
    expect(w.text()).toContain('让 Agent 创建一个')
    expect(w.text()).toContain('从空白开始')
  })

  it('emits create-with-agent on first CTA', async () => {
    const w = mount(WorkflowEmptyState)
    await w.find('[data-testid="empty-agent"]').trigger('click')
    expect(w.emitted('create-with-agent')).toBeTruthy()
  })

  it('emits create-manual on second CTA', async () => {
    const w = mount(WorkflowEmptyState)
    await w.find('[data-testid="empty-manual"]').trigger('click')
    expect(w.emitted('create-manual')).toBeTruthy()
  })

  it('renders search-empty variant when noResults and shows keyword', () => {
    const w = mount(WorkflowEmptyState, { props: { noResults: true, keyword: 'foo' } })
    expect(w.text()).toContain('foo')
  })

  it('renders error variant with retry button when error', () => {
    const w = mount(WorkflowEmptyState, { props: { error: '网络错误' } })
    expect(w.text()).toContain('网络错误')
    expect(w.find('[data-testid="empty-retry"]').exists()).toBe(true)
  })

  it('emits retry event on retry button click', async () => {
    const w = mount(WorkflowEmptyState, { props: { error: '错误' } })
    await w.find('[data-testid="empty-retry"]').trigger('click')
    expect(w.emitted('retry')).toBeTruthy()
  })
})
