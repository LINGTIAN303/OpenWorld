import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import WorkflowCard from '../../components/WorkflowCard.vue'
import type { WorkflowSummary } from '../../types'

const baseWorkflow: WorkflowSummary = {
  id: 'wf-1',
  latestVersion: 1,
  name: '晨间例行',
  category: 'automation',
  description: '每天早上自动汇总昨天的工作',
  status: 'completed',
  nodeCount: 8,
  createdAt: '2026-01-15T10:00:00Z',
  lastRunAt: '2026-06-02T08:00:00Z',
  updatedAt: Date.now(),
}

describe('WorkflowCard', () => {
  it('renders workflow name', () => {
    const w = mount(WorkflowCard, { props: { workflow: baseWorkflow } })
    expect(w.text()).toContain('晨间例行')
  })

  it('renders description when provided', () => {
    const w = mount(WorkflowCard, { props: { workflow: baseWorkflow } })
    expect(w.text()).toContain('每天早上')
  })

  it('renders category as WsMiniBadge', () => {
    const w = mount(WorkflowCard, { props: { workflow: baseWorkflow } })
    const badge = w.findComponent({ name: 'WsMiniBadge' })
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toContain('automation')
  })

  it('renders status via WsStatusDot', () => {
    const w = mount(WorkflowCard, {
      props: { workflow: { ...baseWorkflow, status: 'running' } },
    })
    expect(w.findComponent({ name: 'WsStatusDot' }).exists()).toBe(true)
  })

  it('shows node count when present', () => {
    const w = mount(WorkflowCard, { props: { workflow: baseWorkflow } })
    expect(w.text()).toContain('8')
  })

  it('emits edit event on primary action click', async () => {
    const w = mount(WorkflowCard, { props: { workflow: baseWorkflow } })
    await w.find('[data-testid="wf-card-primary"]').trigger('click')
    expect(w.emitted('edit')).toBeTruthy()
    expect(w.emitted('edit')![0]).toEqual(['wf-1'])
  })

  it('emits launch event on launch button', async () => {
    const w = mount(WorkflowCard, { props: { workflow: baseWorkflow } })
    await w.find('[data-testid="wf-card-launch"]').trigger('click')
    expect(w.emitted('launch')).toBeTruthy()
    expect(w.emitted('launch')![0]).toEqual(['wf-1'])
  })

  it('emits delete event on delete button', async () => {
    const w = mount(WorkflowCard, { props: { workflow: baseWorkflow } })
    await w.find('[data-testid="wf-card-delete"]').trigger('click')
    expect(w.emitted('delete')).toBeTruthy()
    expect(w.emitted('delete')![0]).toEqual(['wf-1'])
  })

  it('uses WsCard as root', () => {
    const w = mount(WorkflowCard, { props: { workflow: baseWorkflow } })
    expect(w.findComponent({ name: 'WsCard' }).exists()).toBe(true)
  })

  it('handles missing optional fields gracefully', () => {
    const minimal: WorkflowSummary = {
      id: 'wf-min',
      latestVersion: 1,
      name: 'minimal',
      category: 'custom',
      description: null,
      updatedAt: 0,
    }
    const w = mount(WorkflowCard, { props: { workflow: minimal } })
    expect(w.text()).toContain('minimal')
  })

  it('falls back to idle status when not provided', () => {
    const noStatus: WorkflowSummary = {
      id: 'wf-ns',
      latestVersion: 1,
      name: 'no-status',
      category: 'custom',
      description: null,
      updatedAt: 0,
    }
    const w = mount(WorkflowCard, { props: { workflow: noStatus } })
    const dot = w.findComponent({ name: 'WsStatusDot' })
    expect(dot.exists()).toBe(true)
    expect(dot.props('status')).toBe('idle')
  })
})
