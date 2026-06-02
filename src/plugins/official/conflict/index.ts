import type { PluginAPIType } from '@worldsmith/entity-core'
import ConflictView from './ConflictView.vue'

export const manifest = {
  id: 'official.conflict',
  name: '冲突/战争',
  version: '1.0.0',
  description: '管理世界观中的战争、战役、冲突事件',
  author: 'WorldSmith',
  agentSkills: ['worldbuilding', 'roleplay'],
  agentCapabilities: [
    { action: 'create_entity', description: '创建冲突', params: ['name', 'description'] },
    { action: 'update_entity', description: '更新冲突', params: ['entityId', 'changes'] },
  ],
}

export function activate(api: PluginAPIType) {
  api.registerEntityType({
    type: 'conflict',
    label: '冲突',
    icon: 'combat',
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true, placeholder: '冲突名称' },
      { key: 'description', label: '描述', type: 'textarea' },
      { key: 'conflictType', label: '类型', type: 'select', options: ['全面战争', '局部冲突', '内战', '起义', '侵略', '防御战', '冷冲突', '贸易战', '其他'] },
      { key: 'scale', label: '规模', type: 'select', options: ['全球', '区域', '国家', '地方', '小规模'] },
      { key: 'startDate', label: '开始时间', type: 'text' },
      { key: 'endDate', label: '结束时间', type: 'text' },
      { key: 'cause', label: '起因', type: 'textarea' },
      { key: 'result', label: '结果', type: 'textarea' },
      { key: 'casualties', label: '伤亡', type: 'textarea' },
      { key: 'treaty', label: '和约/停战协议', type: 'textarea' },
      { key: 'coverImage', label: '封面图', type: 'image' },
      { key: 'tags', label: '标签', type: 'tags' },
    ],
  })
  api.registerRelationType({
    type: 'participant_force', label: '参战势力',
    sourceTypes: ['conflict'], targetTypes: ['organization'], directed: true,
  })
  api.registerRelationType({
    type: 'participant_commander', label: '指挥官',
    sourceTypes: ['conflict'], targetTypes: ['character'], directed: true,
  })
  api.registerRelationType({
    type: 'battlefield', label: '战场',
    sourceTypes: ['conflict'], targetTypes: ['region'], directed: true,
  })
  api.registerRelationType({
    type: 'related_event', label: '关联事件',
    sourceTypes: ['conflict'], targetTypes: ['event'], directed: true,
  })
  api.registerRelationType({
    type: 'legendary_item', label: '传奇兵器',
    sourceTypes: ['conflict'], targetTypes: ['item'], directed: true,
  })
  api.registerRelationType({
    type: 'sub_conflict', label: '子战役',
    sourceTypes: ['conflict'], targetTypes: ['conflict'], directed: true,
  })
  api.registerView({
    id: 'conflicts', label: '冲突/战争', icon: 'combat',
    component: ConflictView,
  })
}
