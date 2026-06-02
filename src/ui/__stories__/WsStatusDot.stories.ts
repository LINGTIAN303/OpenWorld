import type { Meta, StoryObj } from '@storybook/vue3'
import WsStatusDot from '../WsStatusDot.vue'

const meta: Meta<typeof WsStatusDot> = {
  title: 'Primitives/WsStatusDot',
  component: WsStatusDot,
  tags: ['autodocs'],
  argTypes: {
    status: { control: { type: 'select' }, options: ['idle', 'running', 'paused', 'completed', 'failed', 'skipped', 'awaiting-decision'] },
    size: { control: { type: 'inline-radio' }, options: ['xs', 'sm', 'md'] },
    showLabel: { control: 'boolean' },
  },
}
export default meta

type Story = StoryObj<typeof WsStatusDot>

export const Idle: Story = { args: { status: 'idle', showLabel: true } }
export const Running: Story = { args: { status: 'running', showLabel: true } }
export const Paused: Story = { args: { status: 'paused', showLabel: true } }
export const Completed: Story = { args: { status: 'completed', showLabel: true } }
export const Failed: Story = { args: { status: 'failed', showLabel: true } }
export const AwaitingDecision: Story = { args: { status: 'awaiting-decision', showLabel: true } }
export const AllStatesGrid: Story = {
  render: () => ({
    components: { WsStatusDot },
    template: `
      <div style="display: grid; grid-template-columns: repeat(2, max-content); gap: 16px 32px; padding: 24px; align-items: center;">
        <WsStatusDot status="idle" showLabel />
        <WsStatusDot status="running" showLabel />
        <WsStatusDot status="paused" showLabel />
        <WsStatusDot status="completed" showLabel />
        <WsStatusDot status="failed" showLabel />
        <WsStatusDot status="skipped" showLabel />
        <WsStatusDot status="awaiting-decision" showLabel />
      </div>
    `,
  }),
}
