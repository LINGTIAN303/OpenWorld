import type { Meta, StoryObj } from '@storybook/vue3'
import AgentDecisionCard from '../components/run/AgentDecisionCard.vue'
import type { DecisionContext } from '../types'

const baseContext: DecisionContext = {
  runId: 'run-001',
  nodeId: 'node-decision-1',
  nodeName: '任务优先级选择',
  nodeType: 'agent_decision',
  prompt: '当前队列里有 3 个紧急任务,根据团队负载,你希望先执行哪个?',
  context: {
    summary:
      '团队当前在岗 5 人,A 任务阻塞另外 2 个任务,B 任务可独立完成但耗时较长,C 任务需要等待外部资源确认。综合考虑吞吐量和阻塞影响,需要选择一个最优执行顺序。',
    items: [
      { label: '在岗人数', value: '5' },
      { label: 'A 任务阻塞', value: '2' },
      { label: 'B 任务预估耗时', value: '4h' },
      { label: 'C 任务外部确认', value: 'pending' },
    ],
  },
  options: [
    { id: 'high', label: '优先 A(解阻塞)' },
    { id: 'mid', label: '优先 B(独立完成)' },
    { id: 'low', label: '优先 C(等外部确认)' },
  ],
  defaultOption: 'mid',
  decisionTimeoutMs: 300_000, // 5min
}

const meta: Meta<typeof AgentDecisionCard> = {
  title: 'Workflow/Run/AgentDecisionCard',
  component: AgentDecisionCard,
  tags: ['autodocs'],
  argTypes: {
    context: { control: 'object' },
  },
}
export default meta

type Story = StoryObj<typeof AgentDecisionCard>

export const Default: Story = {
  args: { context: baseContext },
}

export const ShortSummary: Story = {
  args: {
    context: {
      ...baseContext,
      nodeId: 'node-2',
      nodeName: '简单问题',
      prompt: '要不要进入下一阶段?',
      context: {
        summary: '前序任务已全部完成,可以安全进入下一阶段。',
        items: [],
      },
      decisionTimeoutMs: 60_000,
    },
  },
}

export const LongSummary: Story = {
  args: {
    context: {
      ...baseContext,
      nodeId: 'node-3',
      nodeName: '复杂上下文决策',
      context: {
        summary: baseContext.context.summary.repeat(5),
        items: baseContext.context.items,
      },
    },
  },
}

export const TwoOptions: Story = {
  args: {
    context: {
      ...baseContext,
      nodeId: 'node-4',
      nodeName: '二选一',
      options: [
        { id: 'yes', label: '是' },
        { id: 'no', label: '否' },
      ],
      defaultOption: 'no',
    },
  },
}

export const NoTimeout: Story = {
  args: {
    context: { ...baseContext, nodeId: 'node-5', nodeName: '无超时决策', decisionTimeoutMs: 0 },
  },
}

export const WithActionLog: Story = {
  render: (args) => ({
    components: { AgentDecisionCard },
    setup() {
      return {
        args,
        log: (label: string, e: unknown) => console.log(`[story] ${label}`, e),
      }
    },
    template: `
      <div style="padding: 24px; background: var(--color-bg-canvas, #0b1020); min-height: 100vh;">
        <p style="margin: 0 0 12px 0; color: var(--color-text-secondary); font-size: 12px;">
          点击选项、确认、关闭或等待超时,事件在浏览器控制台输出
        </p>
        <AgentDecisionCard
          v-bind="args"
          @decide="(p) => log('decide', p)"
          @dismiss="log('dismiss', null)"
          @fallback="(c) => log('fallback', c)"
        />
      </div>
    `,
  }),
  args: { context: baseContext },
}
