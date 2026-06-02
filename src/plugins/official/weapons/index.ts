import type { PluginAPIType } from '@worldsmith/entity-core'
import WeaponView from './WeaponView.vue'

export const manifest = { id: 'official.weapons', name: '武器', version: '1.0.0', description: '管理武器精细数据', author: 'WorldSmith',
  agentSkills: ['content-craft'],
  agentCapabilities: [
    { action: 'create_entity', description: '创建武器', params: ['name', 'description'] },
    { action: 'update_entity', description: '更新武器属性', params: ['entityId', 'changes'] },
  ],
}

export function activate(api: PluginAPIType) {
  api.registerEntityType({ type: 'weapon', label: '武器', icon: 'weapon', fields: [
    { key: 'name', label: '名称', type: 'text', required: true, placeholder: '武器名称' },
    { key: 'description', label: '描述', type: 'textarea' },
    { key: 'weaponType', label: '类型', type: 'select', options: ['剑', '刀', '枪', '弓', '法器', '盾', '暗器', '其他'] },
    { key: 'rank', label: '品级/稀有度', type: 'select', options: ['凡品', '祥品', '灵品', '圣器', '神器'] },
    { key: 'material', label: '材质', type: 'text' },
    { key: 'smith', label: '锻造者', type: 'text' },
    { key: 'forgedAt', label: '锻造时间', type: 'text' },
    { key: 'status', label: '现状', type: 'select', options: ['流传', '损毁', '遗失', '封印'] },
    { key: 'specialAbility', label: '特殊能力', type: 'textarea' },
    { key: 'battles', label: '战绩摘要', type: 'textarea' },
    { key: 'coverImage', label: '封面图', type: 'image' },
    { key: 'tags', label: '标签', type: 'tags' },
  ] })
  api.registerRelationType({ type: 'current_holder', label: '当前持有者', sourceTypes: ['weapon'], targetTypes: ['character'], directed: true })
  api.registerRelationType({ type: 'past_holders', label: '历代持有者', sourceTypes: ['weapon'], targetTypes: ['character'], directed: true })
  api.registerRelationType({ type: 'key_battles', label: '参与关键战役', sourceTypes: ['weapon'], targetTypes: ['event'], directed: true })
  api.registerRelationType({ type: 'combat_bonus', label: '装备加成', sourceTypes: ['weapon'], targetTypes: ['combat_stat'], directed: true })
  api.registerRelationType({ type: 'forged_at', label: '锻造地/封印地', sourceTypes: ['weapon'], targetTypes: ['region'], directed: true })
  api.registerRelationType({ type: 'weapon_relation', label: '相互克制/配套', sourceTypes: ['weapon'], targetTypes: ['weapon'], directed: false })
  api.registerView({ id: 'weapons', label: '武器', icon: 'weapon', component: WeaponView })
}
