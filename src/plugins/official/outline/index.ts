import type { PluginAPIType } from '@worldsmith/entity-core'
import OutlineView from './OutlineView.vue'

export const manifest = {
  id: 'official.outline',
  name: '大纲',
  version: '1.0.0',
  description: '故事大纲编辑器——管理卷/章/节/场景的层级结构与关联实体',
  author: 'WorldSmith',
  agentSkills: ['outline-architect'],
  agentCapabilities: [
    { action: 'create_node', description: '创建大纲节点', params: ['title', 'parentId', 'type'] },
    { action: 'update_node', description: '更新节点', params: ['nodeId', 'changes'] },
    { action: 'move_node', description: '移动节点', params: ['nodeId', 'newParentId', 'position'] },
    { action: 'get_structure', description: '获取大纲树' },
    { action: 'link_entity', description: '关联实体', params: ['nodeId', 'entityId'] },
  ],
}

export function activate(api: PluginAPIType) {
  api.registerEntityType({
    type: 'outline_node',
    label: '纲目',
    icon: 'outline',
    fields: [
      { key: 'status', label: '状态', type: 'select',
        options: ['未写', '草稿', '完成'] },
      { key: 'wordCount', label: '字数', type: 'text' },
      { key: 'order', label: '排序', type: 'text' },
      { key: 'parentId', label: '父节点ID', type: 'text' },
      { key: 'storylines', label: '所属线索', type: 'text' },
      { key: 'summary', label: '摘要/梗概', type: 'textarea' },
      { key: 'manuscriptId', label: '关联章节ID', type: 'text' },
      { key: 'coverImage', label: '封面图', type: 'image' },
      { key: 'content', label: '内嵌内容', type: 'textarea' },
    ],
  })

  api.registerRelationType({
    type: 'parent_child',
    label: '父级/子级',
    sourceTypes: ['outline_node'],
    targetTypes: ['outline_node'],
    directed: true,
  })
  api.registerRelationType({
    type: 'appears_in',
    label: '出现于',
    sourceTypes: ['character', 'item', 'region', 'event', 'organization', 'concept'],
    targetTypes: ['outline_node'],
    directed: true,
  })

  api.registerView({
    id: 'outline',
    label: '大纲',
    icon: 'outline',
    component: OutlineView,
  })
}
