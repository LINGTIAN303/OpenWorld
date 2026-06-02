import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RunTimelineItem from '@/plugins/official/workflow/components/run/RunTimelineItem.vue'
import type { RunStatus } from '@/plugins/official/workflow/types'

describe('RunTimelineItem', () => {
  it('renders node name + WsStatusDot + duration', () => {
    const item = {
      nodeId: 'n1',
      nodeName: '调用 Skill',
      nodeType: 'skill',
      status: 'completed' as RunStatus,
      startedAt: 1_700_000_000_000,
      finishedAt: 1_700_000_005_000,
    }
    const w = mount(RunTimelineItem, { props: { item } })
    expect(w.text()).toContain('调用 Skill')
    expect(w.findComponent({ name: 'WsStatusDot' }).exists()).toBe(true)
    expect(w.text()).toContain('5s')
  })

  it('shows awaiting-decision with halo class when status awaiting-decision', () => {
    const item = {
      nodeId: 'n',
      nodeName: '等待决策',
      nodeType: 'agent_decision',
      status: 'awaiting-decision' as RunStatus,
    }
    const w = mount(RunTimelineItem, { props: { item } })
    expect(w.find('.timeline-item--awaiting').exists()).toBe(true)
  })

  it('shows --- duration when finishedAt is missing', () => {
    const item = {
      nodeId: 'n2',
      nodeName: '运行中',
      nodeType: 'skill',
      status: 'running' as RunStatus,
      startedAt: 1_700_000_000_000,
      finishedAt: null as number | null,
    }
    const w = mount(RunTimelineItem, { props: { item } })
    expect(w.text()).toContain('---')
  })

  it('renders sub-1s duration as ms', () => {
    const item = {
      nodeId: 'n3',
      nodeName: '快',
      nodeType: 'skill',
      status: 'completed' as RunStatus,
      startedAt: 1_700_000_000_000,
      finishedAt: 1_700_000_000_500,
    }
    const w = mount(RunTimelineItem, { props: { item } })
    expect(w.text()).toMatch(/500\s*ms/)
  })
})
