import type { NodeTypeDefinition, NodeOutput } from '../types'

export const skipNode: NodeTypeDefinition = {
  type: 'skip',
  category: 'builtin',
  label: '跳过线',
  icon: '⏭️',
  color: '#A855F7',
  pluginId: 'workflow',
  description: '跳转到指定节点，跳过中间步骤',
  configSchema: {
    target: { type: 'string', label: '目标节点 ID', required: true },
    condition: { type: 'string', label: '跳过条件（留空则无条件跳过）' },
  },
  async execute(_config, _ctx, _api): Promise<NodeOutput> {
    return { status: 'success', data: { note: 'skip execution handled by executor' }, duration: 0 }
  },
}
