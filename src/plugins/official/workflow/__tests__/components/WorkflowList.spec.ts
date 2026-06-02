import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import WorkflowList from '../../components/WorkflowList.vue'
import type { WorkflowSummary } from '../../types'

const sampleWorkflows: WorkflowSummary[] = [
  {
    id: 'wf-1',
    latestVersion: 1,
    name: '晨间例行',
    category: 'automation',
    description: '每天汇总昨天工作',
    updatedAt: 1700000000000,
    createdAt: '2026-01-15T10:00:00Z',
    status: 'completed',
    nodeCount: 8,
  },
  {
    id: 'wf-2',
    latestVersion: 1,
    name: '周报生成',
    category: 'reporting',
    description: '从数据生成周报',
    updatedAt: 1700100000000,
    createdAt: '2026-02-20T10:00:00Z',
    status: 'idle',
  },
  {
    id: 'wf-3',
    latestVersion: 1,
    name: '客户提醒',
    category: 'communication',
    description: '定时发送提醒',
    updatedAt: 1700200000000,
    createdAt: '2026-03-01T10:00:00Z',
    status: 'running',
  },
]

describe('WorkflowList', () => {
  it('renders a WorkflowCard for each workflow', () => {
    const w = mount(WorkflowList, { props: { workflows: sampleWorkflows } })
    const cards = w.findAllComponents({ name: 'WorkflowCard' })
    expect(cards.length).toBe(3)
  })

  it('renders WorkflowEmptyState when list is empty', () => {
    const w = mount(WorkflowList, { props: { workflows: [] } })
    expect(w.findComponent({ name: 'WorkflowEmptyState' }).exists()).toBe(true)
  })

  it('does not render WorkflowEmptyState when workflows exist', () => {
    const w = mount(WorkflowList, { props: { workflows: sampleWorkflows } })
    expect(w.findComponent({ name: 'WorkflowEmptyState' }).exists()).toBe(false)
  })

  it('renders WorkflowEmptyState with noResults when keyword filters to empty', async () => {
    const w = mount(WorkflowList, { props: { workflows: sampleWorkflows } })
    await w.find('input.search-input').setValue('zzzzzz')
    const empty = w.findComponent({ name: 'WorkflowEmptyState' })
    expect(empty.exists()).toBe(true)
    expect(empty.props('noResults')).toBe(true)
    expect(empty.props('keyword')).toBe('zzzzzz')
  })

  it('filters by keyword across name / category / description', async () => {
    const w = mount(WorkflowList, { props: { workflows: sampleWorkflows } })
    await w.find('input.search-input').setValue('周报')
    const cards = w.findAllComponents({ name: 'WorkflowCard' })
    expect(cards.length).toBe(1)
  })

  it('sorts by createdAt desc by default', () => {
    const w = mount(WorkflowList, { props: { workflows: sampleWorkflows } })
    const cards = w.findAllComponents({ name: 'WorkflowCard' })
    const ids = cards.map((c) => c.props('workflow').id)
    // createdAt: wf-1 (2026-01-15) < wf-2 (2026-02-20) < wf-3 (2026-03-01)
    // desc: wf-3, wf-2, wf-1
    expect(ids).toEqual(['wf-3', 'wf-2', 'wf-1'])
  })

  it('re-emits edit from child card', async () => {
    const w = mount(WorkflowList, { props: { workflows: sampleWorkflows } })
    const firstCard = w.findAllComponents({ name: 'WorkflowCard' })[0]!
    await firstCard.vm.$emit('edit', 'wf-3')
    expect(w.emitted('edit')).toBeTruthy()
    expect(w.emitted('edit')![0]).toEqual(['wf-3'])
  })

  it('re-emits launch and delete from child card', async () => {
    const w = mount(WorkflowList, { props: { workflows: sampleWorkflows } })
    const firstCard = w.findAllComponents({ name: 'WorkflowCard' })[0]!
    await firstCard.vm.$emit('launch', 'wf-3')
    await firstCard.vm.$emit('delete', 'wf-3')
    expect(w.emitted('launch')).toBeTruthy()
    expect(w.emitted('delete')).toBeTruthy()
  })
})
