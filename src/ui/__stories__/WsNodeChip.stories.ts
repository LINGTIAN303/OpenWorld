import type { Meta, StoryObj } from '@storybook/vue3'
import WsNodeChip from '../WsNodeChip.vue'

const meta: Meta<typeof WsNodeChip> = {
  title: 'Primitives/WsNodeChip',
  component: WsNodeChip,
  tags: ['autodocs'],
  argTypes: {
    type: { control: { type: 'select' }, options: ['start', 'end', 'pivot', 'condition', 'skip', 'agent_decision', 'skill', 'tool', 'sub_agent', 'code', 'loop', 'iterate', 'parallel', 'sub_workflow'] },
    size: { control: { type: 'inline-radio' }, options: ['sm', 'md'] },
    showIcon: { control: 'boolean' },
    selected: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
}
export default meta

type Story = StoryObj<typeof WsNodeChip>

export const Start: Story = { args: { type: 'start' } }
export const Condition: Story = { args: { type: 'condition' } }
export const AgentDecision: Story = { args: { type: 'agent_decision' } }
export const Skill: Story = { args: { type: 'skill' } }
export const SubWorkflow: Story = { args: { type: 'sub_workflow' } }
export const End: Story = { args: { type: 'end' } }
export const Selected: Story = { args: { type: 'start', selected: true } }
export const Disabled: Story = { args: { type: 'start', disabled: true } }

export const AllTypesGrid: Story = {
  render: () => ({
    components: { WsNodeChip },
    template: `
      <div style="display: flex; flex-wrap: wrap; gap: 10px; padding: 24px;">
        <WsNodeChip type="start" />
        <WsNodeChip type="pivot" />
        <WsNodeChip type="condition" />
        <WsNodeChip type="agent_decision" />
        <WsNodeChip type="skip" />
        <WsNodeChip type="skill" />
        <WsNodeChip type="tool" />
        <WsNodeChip type="sub_agent" />
        <WsNodeChip type="code" />
        <WsNodeChip type="loop" />
        <WsNodeChip type="iterate" />
        <WsNodeChip type="parallel" />
        <WsNodeChip type="sub_workflow" />
        <WsNodeChip type="end" />
      </div>
    `,
  }),
}
