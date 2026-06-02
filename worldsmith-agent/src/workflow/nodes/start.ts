import type { NodeTypeDefinition, NodeOutput } from '../types'

export const startNode: NodeTypeDefinition = {
  type: 'start',
  category: 'builtin',
  label: '开始',
  icon: '▶️',
  color: '#22C55E',
  pluginId: 'workflow',
  description: '工作流入口节点',
  configSchema: {},
  async execute(_config, ctx, _api): Promise<NodeOutput> {
    return { status: 'success', data: ctx.params, duration: 0 }
  },
}
