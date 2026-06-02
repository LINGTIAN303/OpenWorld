import type { NodeTypeDefinition, NodeOutput } from '../types'

export const subWorkflowNode: NodeTypeDefinition = {
  type: 'sub_workflow',
  category: 'builtin',
  label: '子工作流',
  icon: '📦',
  color: '#6366F1',
  pluginId: 'workflow',
  description: '调用另一个已保存的工作流',
  configSchema: {
    workflow_id: { type: 'string', label: '工作流 ID', required: true },
    params: { type: 'string', label: '参数 (JSON)' },
  },
  async execute(_config, _ctx, _api): Promise<NodeOutput> {
    return { status: 'success', data: { note: 'sub_workflow execution handled by executor' }, duration: 0 }
  },
}
