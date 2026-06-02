import type { PluginAPIType } from '@worldsmith/entity-core'
import ManuscriptView from './ManuscriptView.vue'

export const manifest = {
  id: 'official.manuscript',
  name: '正文写作',
  version: '1.0.0',
  description: '沉浸式正文写作环境——富文本编辑器 + 实体提及 + 版本管理与大纲联动',
  author: 'WorldSmith',
  agentSkills: ['manuscript-author', 'content-craft'],
  agentCapabilities: [
    { action: 'create_chapter', description: '创建章节', params: ['title', 'content', 'volumeName'] },
    { action: 'update_chapter', description: '更新章节', params: ['chapterId', 'content', 'status'] },
    { action: 'list_chapters', description: '列出章节', params: ['volumeName'] },
    { action: 'get_chapter_content', description: '获取章节内容', params: ['chapterId'] },
    { action: 'insert_mention', description: '插入实体引用', params: ['chapterId', 'entityId'] },
    { action: 'export_document', description: '导出文档', params: ['format'] },
  ],
}

export function activate(api: PluginAPIType) {
  api.registerEntityType({
    type: 'manuscript',
    label: '正文',
    icon: 'manuscript',
    fields: [
      { key: 'content', label: '正文内容', type: 'text' },
      { key: 'outlineNodeId', label: '关联大纲节点ID', type: 'text' },
      { key: 'wordCount', label: '字数', type: 'text' },
      { key: 'status', label: '状态', type: 'select',
        options: ['草稿', '修订中', '终稿'] },
      { key: 'sortOrder', label: '排序序号', type: 'text' },
      { key: 'volumeName', label: '所属卷名', type: 'text' },
      { key: 'entityMentions', label: '提及实体ID列表', type: 'text' },
      { key: 'coverImage', label: '封面图', type: 'image' },
      { key: 'snapshots', label: '版本快照', type: 'text' },
    ],
  })

  api.registerRelationType({
    type: 'draft_of',
    label: '属于大纲节点',
    sourceTypes: ['manuscript'],
    targetTypes: ['outline_node'],
    directed: true,
  })

  api.registerView({
    id: 'manuscript',
    label: '正文写作',
    icon: 'manuscript',
    component: ManuscriptView,
  })
}
