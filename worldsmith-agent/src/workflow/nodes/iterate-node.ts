import type { NodeTypeDefinition, NodeOutput } from '../types'

export const iterateNode: NodeTypeDefinition = {
  type: 'iterate',
  category: 'builtin',
  label: '巡回',
  icon: '🔁',
  color: '#14B8A6',
  pluginId: 'workflow',
  description: '遍历集合，对每个元素执行子图',
  configSchema: {
    collection: { type: 'string', label: '集合变量路径', required: true },
    item_var: { type: 'string', label: '元素变量名' },
    concurrency: { type: 'number', label: '并行度' },
  },
  async execute(_config, _ctx, _api): Promise<NodeOutput> {
    return { status: 'success', data: { note: 'iterate execution handled by executor' }, duration: 0 }
  },
}
