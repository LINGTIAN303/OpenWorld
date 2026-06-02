import type { Meta, StoryObj } from '@storybook/vue3'
import NewWorkflowDropdown from '../components/NewWorkflowDropdown.vue'

const meta: Meta<typeof NewWorkflowDropdown> = {
  title: 'Workflow/NewWorkflowDropdown',
  component: NewWorkflowDropdown,
  tags: ['autodocs'],
  argTypes: {},
}
export default meta

type Story = StoryObj<typeof NewWorkflowDropdown>

export const Default: Story = {}

export const WithActionLog: Story = {
  render: (args) => ({
    components: { NewWorkflowDropdown },
    setup() {
      return { args, log: (e: unknown) => console.log('[story] event', e) }
    },
    template: `
      <div style="padding: 24px;">
        <NewWorkflowDropdown
          v-bind="args"
          @create-blank="log"
          @create-template="log"
          @import="log"
        />
        <p style="margin-top: 16px; color: var(--color-text-secondary); font-size: 12px;">
          点击 dropdown 中的选项,事件会在浏览器控制台输出
        </p>
      </div>
    `,
  }),
}
