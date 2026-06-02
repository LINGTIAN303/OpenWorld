import type { Meta, StoryObj } from '@storybook/vue3'
import WsMiniBadge from '../WsMiniBadge.vue'

const meta: Meta<typeof WsMiniBadge> = {
  title: 'Primitives/WsMiniBadge',
  component: WsMiniBadge,
  tags: ['autodocs'],
  argTypes: {
    variant: { control: { type: 'select' }, options: ['neutral', 'primary', 'accent', 'success', 'warning', 'danger'] },
    size: { control: { type: 'inline-radio' }, options: ['sm', 'md'] },
    pill: { control: 'boolean' },
  },
}
export default meta

type Story = StoryObj<typeof WsMiniBadge>

export const Neutral: Story = { args: { variant: 'neutral' }, render: (args) => ({
  components: { WsMiniBadge },
  setup: () => ({ args }),
  template: '<WsMiniBadge v-bind="args">数据处理</WsMiniBadge>',
}) }
export const Success: Story = { args: { variant: 'success', icon: '✓' }, render: Neutral.render }
export const Warning: Story = { args: { variant: 'warning', icon: '!' }, render: Neutral.render }
export const Danger: Story = { args: { variant: 'danger' }, render: Neutral.render }
export const Primary: Story = { args: { variant: 'primary' }, render: Neutral.render }
export const Accent: Story = { args: { variant: 'accent' }, render: Neutral.render }
export const AllVariantsGrid: Story = {
  render: () => ({
    components: { WsMiniBadge },
    template: `
      <div style="display: flex; gap: 12px; padding: 24px; flex-wrap: wrap; align-items: center;">
        <WsMiniBadge variant="neutral">neutral</WsMiniBadge>
        <WsMiniBadge variant="primary">primary</WsMiniBadge>
        <WsMiniBadge variant="accent">accent</WsMiniBadge>
        <WsMiniBadge variant="success" icon="✓">success</WsMiniBadge>
        <WsMiniBadge variant="warning" icon="!">warning</WsMiniBadge>
        <WsMiniBadge variant="danger" icon="✕">danger</WsMiniBadge>
      </div>
    `,
  }),
}
