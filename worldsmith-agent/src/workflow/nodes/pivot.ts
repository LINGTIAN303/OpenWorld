import type { NodeTypeDefinition, NodeOutput } from '../types'

export const pivotNode: NodeTypeDefinition = {
  type: 'pivot',
  category: 'builtin',
  label: '支点',
  icon: '📌',
  color: '#6B7280',
  pluginId: 'workflow',
  description: '无逻辑操作的锚点，用于组织流程和跳转目标',
  configSchema: {},
  async execute(_config, _ctx, _api): Promise<NodeOutput> {
    return { status: 'success', data: null, duration: 0 }
  },
}
