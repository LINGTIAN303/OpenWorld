import type { NodeTypeDefinition, NodeOutput } from '../types'

export const endNode: NodeTypeDefinition = {
  type: 'end',
  category: 'builtin',
  label: '结束',
  icon: '⏹️',
  color: '#EF4444',
  pluginId: 'workflow',
  description: '工作流出口节点',
  configSchema: {},
  async execute(_config, ctx, _api): Promise<NodeOutput> {
    const lastNodeKey = Object.keys(ctx.nodes).pop()
    const lastOutput = lastNodeKey ? ctx.nodes[lastNodeKey] : null
    return { status: 'success', data: lastOutput?.data, duration: 0 }
  },
}
