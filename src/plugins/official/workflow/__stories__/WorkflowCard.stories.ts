import type { Meta, StoryObj } from '@storybook/vue3'
import WorkflowCard from '../components/WorkflowCard.vue'
import type { WorkflowSummary } from '../types'

const baseWorkflow: WorkflowSummary = {
  id: 'wf-story',
  latestVersion: 1,
  name: '晨间例行工作流',
  category: 'automation',
  description: '每天早上 8 点自动汇总昨天的工作进展,生成报告并发送给团队',
  updatedAt: Date.now(),
  createdAt: '2026-01-15T10:00:00Z',
  lastRunAt: '2026-06-02T08:00:00Z',
  status: 'completed',
  nodeCount: 8,
}

const meta: Meta<typeof WorkflowCard> = {
  title: 'Workflow/WorkflowCard',
  component: WorkflowCard,
  tags: ['autodocs'],
  argTypes: {
    workflow: { control: 'object' },
  },
}
export default meta

type Story = StoryObj<typeof WorkflowCard>

export const Default: Story = {
  args: { workflow: baseWorkflow },
}

export const Running: Story = {
  args: {
    workflow: { ...baseWorkflow, id: 'wf-running', name: '正在运行的工作流', status: 'running' },
  },
}

export const Failed: Story = {
  args: {
    workflow: { ...baseWorkflow, id: 'wf-failed', name: '执行失败', status: 'failed' },
  },
}

export const AwaitingDecision: Story = {
  args: {
    workflow: { ...baseWorkflow, id: 'wf-pending', name: '等待决策', status: 'awaiting-decision' },
  },
}

export const NoDescription: Story = {
  args: {
    workflow: { ...baseWorkflow, id: 'wf-nodescr', name: '无描述', description: null },
  },
}

export const Queued: Story = {
  args: {
    workflow: { ...baseWorkflow, id: 'wf-queue', name: '排队中', status: 'queued' },
  },
}

export const Cancelled: Story = {
  args: {
    workflow: { ...baseWorkflow, id: 'wf-cancel', name: '已取消', status: 'cancelled' },
  },
}

export const Minimal: Story = {
  args: {
    workflow: {
      id: 'wf-min',
      latestVersion: 1,
      name: '极简卡片',
      category: 'custom',
      description: null,
      updatedAt: 0,
    },
  },
}

export const LongName: Story = {
  args: {
    workflow: {
      ...baseWorkflow,
      id: 'wf-long',
      name: '一个非常非常非常长的名字用于测试省略号和卡片布局的稳定性',
    },
  },
}
