import type { NodeTypeDefinition, NodeOutput } from '../types'

export const parallelNode: NodeTypeDefinition = {
  type: 'parallel',
  category: 'builtin',
  label: '并行',
  icon: '⚡',
  color: '#EAB308',
  pluginId: 'workflow',
  description: '同时执行多个分支',
  configSchema: {},
  async execute(_config, _ctx, _api): Promise<NodeOutput> {
    return { status: 'success', data: { note: 'parallel execution handled by executor' }, duration: 0 }
  },
}
