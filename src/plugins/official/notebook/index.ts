import { entitySchemaRegistry, type PluginAPIType } from '@worldsmith/entity-core'
import NotebookView from './NotebookView.vue'

export const manifest = {
  id: 'official.notebook',
  name: '笔记本',
  version: '1.0.0',
  description: '集成笔记本——Markdown编辑 + 卡片排列 + 知识互联 + 代码运行',
  author: 'WorldSmith',
  agentSkills: ['notebook-curator', 'output-orchestrator', 'web-scout', 'worldbuilding'],
  agentCapabilities: [
    { action: 'create_note', description: '创建笔记', params: ['content', 'noteType', 'folderId'] },
    { action: 'update_note', description: '更新笔记', params: ['noteId', 'content', 'tags'] },
    { action: 'list_notes', description: '列出笔记', params: ['folderId', 'keyword'] },
    { action: 'execute_code', description: '执行代码单元格', params: ['noteId', 'code'] },
    { action: 'create_backlink', description: '创建双向链接', params: ['sourceId', 'targetId'] },
  ],
}

export function activate(api: PluginAPIType) {
  api.registerEntityType({
    type: 'notebook',
    label: '笔记',
    icon: 'notebook',
    fields: [
      { key: 'content', label: '笔记内容', type: 'text' },
      { key: 'noteType', label: '笔记类型', type: 'select',
        options: ['markdown', 'code', 'canvas', 'reference'] },
      { key: 'tags', label: '标签', type: 'text' },
      { key: 'backlinks', label: '反向链接', type: 'text' },
      { key: 'forwardLinks', label: '正向链接', type: 'text' },
      { key: 'linkedEntities', label: '关联实体', type: 'text' },
      { key: 'codeLanguage', label: '代码语言', type: 'text' },
      { key: 'codeOutput', label: '代码输出', type: 'text' },
      { key: 'sortOrder', label: '排序', type: 'text' },
      { key: 'coverImage', label: '封面图', type: 'image' },
      { key: 'folderId', label: '所属文件夹', type: 'text' },
    ],
  })

  api.registerRelationType({
    type: 'note_link',
    label: '笔记链接',
    sourceTypes: ['notebook'],
    targetTypes: ['notebook'],
    directed: false,
  })

  const allRegisteredTypes = entitySchemaRegistry.getAll()
    .map(s => s.type)
    .filter(t => t !== 'notebook')

  api.registerRelationType({
    type: 'note_ref',
    label: '引用实体',
    sourceTypes: ['notebook'],
    targetTypes: allRegisteredTypes,
    directed: true,
  })

  api.registerView({
    id: 'notebook',
    label: '笔记本',
    icon: 'notebook',
    component: NotebookView,
  })
}
