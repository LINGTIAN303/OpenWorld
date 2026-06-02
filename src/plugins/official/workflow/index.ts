import type { PluginAPIType } from '@worldsmith/entity-core'
import WorkflowView from './WorkflowView.vue'
import { useLocalStorageMigration } from './composables/useLocalStorageMigration'

export const manifest = {
  id: 'official.workflow',
  name: '工作流',
  version: '1.0.0',
  description: '工作流编排与执行。创建、编辑、管理工作流，追踪执行进度。',
  author: 'WorldSmith',
  agentSkills: ['workflow-operator'],
  agentCapabilities: [
    { action: 'list_workflows', description: '列出工作流' },
    { action: 'run_workflow', description: '运行工作流', params: ['workflowId'] },
    { action: 'get_status', description: '获取工作流状态', params: ['runId'] },
  ],
}

export function activate(api: PluginAPIType) {
  // 一次性迁移老 localStorage 数据到后端 Sqlite 库。失败保留原数据。
  useLocalStorageMigration()
    .migrate()
    .catch((e) => console.warn('[workflow] migrate failed:', e))

  api.registerEntityType({
    type: 'workflow',
    name: '工作流',
    icon: 'lightning',
    fields: [
      { key: 'name', type: 'string', label: '名称', required: true },
      { key: 'definition', type: 'text', label: '工作流定义 (YAML/JSON)', required: true },
      { key: 'version', type: 'number', label: '版本', default: 1 },
      { key: 'category', type: 'string', label: '分类', default: 'custom' },
      { key: 'coverImage', type: 'image', label: '封面图' },
      { key: 'tags', type: 'array', label: '标签' },
      { key: 'author', type: 'string', label: '创建者', default: 'user' },
      { key: 'usageCount', type: 'number', label: '使用次数', default: 0 },
    ],
  })

  api.registerEntityType({
    type: 'workflow_run',
    name: '工作流执行记录',
    icon: 'manuscript',
    fields: [
      { key: 'workflowId', type: 'string', label: '工作流 ID', required: true },
      { key: 'status', type: 'string', label: '状态', default: 'running' },
      { key: 'triggeredBy', type: 'string', label: '触发者', default: 'user' },
      { key: 'params', type: 'text', label: '参数 (JSON)' },
      { key: 'currentNodeId', type: 'string', label: '当前节点' },
      { key: 'nodeStates', type: 'text', label: '节点状态 (JSON)' },
      { key: 'startedAt', type: 'number', label: '开始时间' },
      { key: 'completedAt', type: 'number', label: '完成时间' },
      { key: 'coverImage', type: 'image', label: '封面图' },
      { key: 'error', type: 'text', label: '错误信息' },
    ],
  })

  api.registerView({
    id: 'workflow',
    label: '工作流',
    icon: 'lightning',
    component: WorkflowView,
  })
}
