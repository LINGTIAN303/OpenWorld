import type { NodeTypeDefinition, NodeOutput } from '../types'

export const subAgentNode: NodeTypeDefinition = {
  type: 'sub_agent',
  category: 'builtin',
  label: 'SubAgent',
  icon: '🤖',
  color: '#06B6D4',
  pluginId: 'workflow',
  description: '调度子 Agent 执行任务',
  configSchema: {
    agent_type: { type: 'string', label: 'Agent 类型', required: true },
    prompt: { type: 'string', label: '任务描述', required: true },
    timeout: { type: 'number', label: '超时(ms)' },
  },
  async execute(config, ctx, api): Promise<NodeOutput> {
    const startTime = Date.now()
    const agentType = api.resolveVars(config.agent_type as string, ctx)
    const prompt = api.resolveVars(config.prompt as string, ctx)

    const result = await api.dispatchSubAgent(agentType, prompt)
    let parsed: unknown = result
    try { parsed = JSON.parse(result) } catch {}

    return { status: 'success', data: parsed, duration: Date.now() - startTime }
  },
}
