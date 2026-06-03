import type { Meta, StoryObj } from '@storybook/vue3'
import RunTimelineItem from '../components/run/RunTimelineItem.vue'
import type { RunStatus } from '../types'

interface TimelineItem {
  nodeId: string
  nodeName: string
  nodeType: string
  status: RunStatus
  startedAt?: number
  finishedAt?: number | null
}

const now = Date.now()

const baseItem: TimelineItem = {
  nodeId: 'node-1',
  nodeName: '数据抓取',
  nodeType: 'sub_agent',
  status: 'completed',
  startedAt: now - 4_000,
  finishedAt: now - 1_000,
}

const meta: Meta<typeof RunTimelineItem> = {
  title: 'Workflow/Run/RunTimelineItem',
  component: RunTimelineItem,
  tags: ['autodocs'],
  argTypes: {
    item: { control: 'object' },
  },
}
export default meta

type Story = StoryObj<typeof RunTimelineItem>

export const Completed: Story = {
  args: { item: { ...baseItem, nodeId: 'n-completed' } },
}

export const Running: Story = {
  args: {
    item: {
      ...baseItem,
      nodeId: 'n-running',
      nodeName: '正在执行 LLM 推理',
      status: 'running',
      startedAt: now - 1_200,
      finishedAt: null,
    },
  },
}

export const Failed: Story = {
  args: {
    item: {
      ...baseItem,
      nodeId: 'n-failed',
      nodeName: 'API 调用失败',
      status: 'failed',
      startedAt: now - 3_000,
      finishedAt: now - 500,
    },
  },
}

export const AwaitingDecision: Story = {
  args: {
    item: {
      ...baseItem,
      nodeId: 'n-await',
      nodeName: '等待用户决策',
      nodeType: 'agent_decision',
      status: 'awaiting-decision',
      startedAt: now - 12_000,
      finishedAt: null,
    },
  },
}

export const SubSecondDuration: Story = {
  args: {
    item: {
      ...baseItem,
      nodeId: 'n-fast',
      nodeName: '快速节点 (<1s)',
      startedAt: now - 300,
      finishedAt: now,
    },
  },
}

export const LongDuration: Story = {
  args: {
    item: {
      ...baseItem,
      nodeId: 'n-long',
      nodeName: '耗时 4m 32s',
      startedAt: now - 272_000,
      finishedAt: now,
    },
  },
}

export const AllNodeTypes: Story = {
  render: () => ({
    components: { RunTimelineItem },
    setup() {
      const items: TimelineItem[] = [
        { nodeId: 't-start', nodeName: 'start', nodeType: 'start', status: 'completed', startedAt: now - 5_000, finishedAt: now - 4_900 },
        { nodeId: 't-sub', nodeName: 'sub_agent', nodeType: 'sub_agent', status: 'completed', startedAt: now - 4_800, finishedAt: now - 3_500 },
        { nodeId: 't-skill', nodeName: 'skill', nodeType: 'skill', status: 'completed', startedAt: now - 3_400, finishedAt: now - 2_000 },
        { nodeId: 't-cond', nodeName: 'condition', nodeType: 'condition', status: 'completed', startedAt: now - 1_900, finishedAt: now - 1_800 },
        { nodeId: 't-decide', nodeName: 'agent_decision', nodeType: 'agent_decision', status: 'awaiting-decision', startedAt: now - 1_700, finishedAt: null },
        { nodeId: 't-loop', nodeName: 'loop', nodeType: 'loop', status: 'running', startedAt: now - 800, finishedAt: null },
        { nodeId: 't-skip', nodeName: 'skip', nodeType: 'skip', status: 'skipped', startedAt: now - 200, finishedAt: now - 100 },
      ]
      return { items }
    },
    template: `
      <div style="background: var(--color-bg-canvas, #0b1020); padding: 16px; min-width: 360px;">
        <RunTimelineItem v-for="item in items" :key="item.nodeId" :item="item" />
      </div>
    `,
  }),
}
