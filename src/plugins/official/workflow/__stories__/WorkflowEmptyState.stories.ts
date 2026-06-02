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

export const NoWorkflows: Story = {
  args: {},
}

export const NoResults: Story = {
  args: { noResults: true, keyword: '不存在的关键词' },
}

export const Error: Story = {
  args: { error: '网络连接超时' },
}

export const AllVariants: Story = {
  render: () => ({
    components: { WorkflowEmptyState },
    template: `
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; padding: 24px; background: var(--color-bg-secondary);">
        <div style="border: 1px dashed var(--color-border-default); padding: 16px;">
          <h4 style="margin: 0 0 12px; font-size: 12px; color: var(--color-text-tertiary);">noResults: false</h4>
          <WorkflowEmptyState />
        </div>
        <div style="border: 1px dashed var(--color-border-default); padding: 16px;">
          <h4 style="margin: 0 0 12px; font-size: 12px; color: var(--color-text-tertiary);">noResults: true</h4>
          <WorkflowEmptyState :no-results="true" keyword="测试" />
        </div>
        <div style="border: 1px dashed var(--color-border-default); padding: 16px;">
          <h4 style="margin: 0 0 12px; font-size: 12px; color: var(--color-text-tertiary);">error</h4>
          <WorkflowEmptyState error="服务不可用" />
        </div>
      </div>
    `,
  }),
}
