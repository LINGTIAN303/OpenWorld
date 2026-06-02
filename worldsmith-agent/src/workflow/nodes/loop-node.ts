import type { NodeTypeDefinition, NodeOutput } from '../types'

export const loopNode: NodeTypeDefinition = {
  type: 'loop',
  category: 'builtin',
  label: '循环',
  icon: '🔄',
  color: '#F97316',
  pluginId: 'workflow',
  description: '重复执行子图 N 次或满足条件时继续',
  configSchema: {
    max_iterations: { type: 'number', label: '最大迭代次数', required: true },
    condition: { type: 'string', label: '继续条件' },
    item_var: { type: 'string', label: '迭代变量名' },
  },
  async execute(_config, _ctx, _api): Promise<NodeOutput> {
    return { status: 'success', data: { note: 'loop execution handled by executor' }, duration: 0 }
  },
}
