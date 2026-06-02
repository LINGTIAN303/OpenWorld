import type { PluginAPIType } from '@worldsmith/entity-core'
import MagicView from './MagicView.vue'

export const manifest = {
  id: 'official.magic',
  name: '魔法/技能体系',
  version: '1.0.0',
  description: '管理世界观中的魔法、技能、能力体系',
  author: 'WorldSmith',
  agentSkills: ['magic-system-designer'],
  agentCapabilities: [
    { action: 'create_skill_node', description: '创建技能节点', params: ['name', 'parentId', 'cost'] },
    { action: 'update_skill_node', description: '更新技能节点', params: ['nodeId', 'changes'] },
    { action: 'get_skill_tree', description: '获取技能树结构' },
    { action: 'validate_tree', description: '验证技能树平衡性' },
  ],
}

export function activate(api: PluginAPIType) {
  api.registerEntityType({
    type: 'magic',
    label: '魔法/技能',
    icon: 'magic',
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true, placeholder: '技能名称' },
      { key: 'description', label: '描述', type: 'textarea' },
      { key: 'magicType', label: '体系', type: 'select',
        options: ['元素魔法', '心灵魔法', '神术/圣光', '黑魔法/诅咒', '自然魔法',
          '符文/附魔', '炼金术', '武术/战技', '科技/异能', '通用'] },
      { key: 'level', label: '等级/阶位', type: 'select',
        options: ['入门', '初级', '中级', '高级', '大师', '传说', '神级'] },
      { key: 'cost', label: '消耗', type: 'text', placeholder: '魔力/体力/材料' },
      { key: 'castingTime', label: '施法时间', type: 'text' },
      { key: 'duration', label: '持续时间', type: 'text' },
      { key: 'range', label: '范围/射程', type: 'text' },
      { key: 'requirements', label: '学习条件', type: 'textarea' },
      { key: 'effects', label: '效果', type: 'textarea' },
      { key: 'sideEffects', label: '副作用', type: 'textarea' },
      { key: 'magicSource', label: '来源', type: 'text' },
      { key: 'coverImage', label: '封面图', type: 'image' },
      { key: 'tags', label: '标签', type: 'tags' },
    ],
  })

  api.registerRelationType({
    type: 'mastered_by',
    label: '掌握者',
    sourceTypes: ['magic'],
    targetTypes: ['character'],
    directed: true,
    properties: [
      { key: 'proficiency', label: '熟练度', type: 'text' },
    ],
  })
  api.registerRelationType({
    type: 'racial_ability',
    label: '种族天赋',
    sourceTypes: ['magic'],
    targetTypes: ['species'],
    directed: true,
  })
  api.registerRelationType({
    type: 'requires_item',
    label: '需要媒介',
    sourceTypes: ['magic'],
    targetTypes: ['item'],
    directed: true,
  })
  api.registerRelationType({
    type: 'based_on',
    label: '基于原理',
    sourceTypes: ['magic'],
    targetTypes: ['concept'],
    directed: true,
    properties: [
      { key: 'explanation', label: '原理说明', type: 'textarea' },
    ],
  })
  api.registerRelationType({
    type: 'counters',
    label: '克制',
    sourceTypes: ['magic'],
    targetTypes: ['magic'],
    directed: false,
  })
  api.registerRelationType({
    type: 'upgrades_to',
    label: '进阶技能',
    sourceTypes: ['magic'],
    targetTypes: ['magic'],
    directed: true,
  })

  api.registerView({
    id: 'magic',
    label: '魔法/技能体系',
    icon: 'magic',
    component: MagicView,
  })
}
