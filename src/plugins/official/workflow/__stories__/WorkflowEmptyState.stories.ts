import type { Meta, StoryObj } from '@storybook/vue3'
import WorkflowEmptyState from '../components/WorkflowEmptyState.vue'

const meta: Meta<typeof WorkflowEmptyState> = {
  title: 'Workflow/WorkflowEmptyState',
  component: WorkflowEmptyState,
  tags: ['autodocs'],
  argTypes: {
    noResults: { control: 'boolean' },
    error: { control: 'text' },
    keyword: { control: 'text' },
  },
}
export default meta

type Story = StoryObj<typeof WorkflowEmptyState>

export const NoWorkflow: Story = {
  args: {},
}

export const NoResults: Story = {
  args: { noResults: true, keyword: '不存在的关键词' },
}

export const Error: Story = {
  args: { error: '网络连接超时' },
}
