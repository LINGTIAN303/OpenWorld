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

export const Open: Story = {
  render: () => ({
    components: { NewWorkflowDropdown },
    template: `
      <div style="padding: 24px; min-height: 260px;">
        <NewWorkflowDropdown />
        <p style="margin-top: 16px; color: var(--color-text-secondary); font-size: 12px;">
          点击按钮可展开下拉菜单，菜单包含「从空白开始」「从模板创建」「导入 JSON」三个选项
        </p>
      </div>
    `,
  }),
}

export const WithAction: Story = {
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
          点击下拉菜单中的选项，事件会在浏览器控制台输出
        </p>
      </div>
    `,
  }),
}
