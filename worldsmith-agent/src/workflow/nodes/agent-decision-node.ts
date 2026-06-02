import type { NodeTypeDefinition, NodeOutput, DecisionOption } from '../types'

export const agentDecisionNode: NodeTypeDefinition = {
  type: 'agent_decision',
  category: 'builtin',
  label: 'Agent 决策',
  icon: '🤔',
  color: '#EC4899',
  pluginId: 'workflow',
  description: '暂停工作流，交由 Agent 判断',
  configSchema: {
    question: { type: 'string', label: '问题', required: true },
    options: { type: 'array', label: '选项', required: true },
  },
  async execute(config, ctx, api): Promise<NodeOutput> {
    const question = api.resolveVars(config.question as string, ctx)
    const options = (config.options as DecisionOption[]) || []

    api.emitEvent({
      type: 'agent_decision_required',
      nodeId: ctx.metadata.currentNodeId || '',
      runId: ctx.metadata.runId,
      options,
    })

    return {
      status: 'success',
      data: { question, options, awaiting_decision: true },
      duration: 0,
    }
  },
}
