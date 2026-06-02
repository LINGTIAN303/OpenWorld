import type { PluginAPIType } from '@worldsmith/entity-core'
import InspirationView from './InspirationView.vue'

export const manifest = {
  id: 'official.inspiration',
  name: '灵感/素材库',
  version: '1.0.0',
  description: '收集创作灵感、参考图、摘抄、链接等素材',
  author: 'WorldSmith',
  agentSkills: [],
  agentCapabilities: [
    { action: 'get_inspiration', description: '获取灵感素材' },
  ],
}

export function activate(api: PluginAPIType) {
  api.registerEntityType({
    type: 'inspiration',
    label: '素材',
    icon: 'inspiration',
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true, placeholder: '灵感名称' },
      { key: 'description', label: '描述', type: 'textarea' },
      { key: 'materialType', label: '类型', type: 'select', options: ['图片', '视频', '文章', '音乐', '概念', '角色', '场景', '对话', '其他'] },
      { key: 'source', label: '来源', type: 'text' },
      { key: 'url', label: 'URL', type: 'text' },
      { key: 'tags', label: '标签', type: 'text' },
      { key: 'notes', label: '创作笔记', type: 'textarea' },
      { key: 'colors', label: '主色调', type: 'color' },
      { key: 'coverImage', label: '封面图', type: 'image' },
      { key: 'boardPosition', label: '画布位置', type: 'text' },
    ],
  })
  api.registerRelationType({
    type: 'inspires', label: '灵感来源',
    sourceTypes: ['inspiration'], targetTypes: ['character', 'region', 'event', 'item', 'concept', 'organization'], directed: true,
  })
  api.registerView({
    id: 'inspirations', label: '灵感/素材库', icon: 'inspiration',
    component: InspirationView,
  })
}
