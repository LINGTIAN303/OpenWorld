import type { PluginAPIType } from '@worldsmith/entity-core'
import CultureView from './CultureView.vue'

export const manifest = {
  id: 'official.culture',
  name: '文化/习俗',
  version: '1.0.0',
  description: '管理世界观中的节日、仪式、禁忌、婚丧习俗等文化细节',
  author: 'WorldSmith',
  agentSkills: ['worldbuilding'],
  agentCapabilities: [
    { action: 'create_entity', description: '创建文化', params: ['name', 'description'] },
    { action: 'update_entity', description: '更新文化属性', params: ['entityId', 'changes'] },
  ],
}

export function activate(api: PluginAPIType) {
  api.registerEntityType({
    type: 'culture',
    label: '文化',
    icon: 'culture',
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true, placeholder: '文化名称' },
      { key: 'description', label: '描述', type: 'textarea' },
      { key: 'cultureType', label: '类型', type: 'select', options: ['节日', '仪式', '禁忌', '婚俗', '丧葬', '饮食', '服饰', '艺术', '建筑风格', '其他'] },
      { key: 'cycle', label: '周期', type: 'text' },
      { key: 'origin', label: '起源', type: 'textarea' },
      { key: 'participants', label: '参与者', type: 'textarea' },
      { key: 'significance', label: '意义/象征', type: 'textarea' },
      { key: 'practices', label: '具体做法', type: 'textarea' },
      { key: 'coverImage', label: '封面图', type: 'image' },
      { key: 'tags', label: '标签', type: 'tags' },
    ],
  })
  api.registerRelationType({
    type: 'practiced_in', label: '流行地',
    sourceTypes: ['culture'], targetTypes: ['region'], directed: true,
  })
  api.registerRelationType({
    type: 'practiced_by', label: '所属文化',
    sourceTypes: ['culture'], targetTypes: ['species'], directed: true,
  })
  api.registerRelationType({
    type: 'promoted_by', label: '官方推行',
    sourceTypes: ['culture'], targetTypes: ['organization'], directed: true,
  })
  api.registerRelationType({
    type: 'origin_event', label: '起源事件',
    sourceTypes: ['culture'], targetTypes: ['event'], directed: true,
  })
  api.registerView({
    id: 'culture', label: '文化/习俗', icon: 'culture',
    component: CultureView,
  })
}
