import type { NodeTypeDefinition, NodeOutput } from '../types'

export const toolNode: NodeTypeDefinition = {
  type: 'tool',
  category: 'builtin',
  label: 'Tool',
  icon: '🔧',
  color: '#3B82F6',
  pluginId: 'workflow',
  description: '调用单个工具',
  configSchema: {
    tool_name: { type: 'string', label: '工具名称', required: true },
    arguments: { type: 'string', label: '参数 (JSON)' },
  },
  async execute(config, ctx, api): Promise<NodeOutput> {
    const startTime = Date.now()
    const toolName = api.resolveVars(config.tool_name as string, ctx)

    let args: Record<string, unknown> = {}
    if (config.arguments) {
      const argsStr = api.resolveVars(
        typeof config.arguments === 'string' ? config.arguments : JSON.stringify(config.arguments),
        ctx,
      )
      try { args = JSON.parse(argsStr) } catch { args = { input: argsStr } }
    }

    const result = await api.callTool(toolName, args)
    let outputData: unknown = result
    try { outputData = JSON.parse(result) } catch {}

    return { status: 'success', data: outputData, duration: Date.now() - startTime }
  },
}
