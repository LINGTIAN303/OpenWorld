import type { PluginAPIType } from '@worldsmith/entity-core'
import CombatStatView from './CombatStatView.vue'

export const manifest = { id: 'official.combat_stats', name: '战力', version: '1.0.0', description: '管理角色战斗力数据', author: 'WorldSmith',
  agentSkills: ['analysis-engine'],
  agentCapabilities: [
    { action: 'create_entity', description: '创建战斗属性', params: ['name', 'description'] },
    { action: 'update_entity', description: '更新战斗属性', params: ['entityId', 'changes'] },
  ],
}

export function activate(api: PluginAPIType) {
  api.registerEntityType({ type: 'combat_stat', label: '战力', icon: 'combat', fields: [
    { key: 'name', label: '名称', type: 'text', required: true, placeholder: '战力体系名称' },
    { key: 'description', label: '描述', type: 'textarea' },
    { key: 'system', label: '体系', type: 'select', options: ['境界制', '等级制', '数值制'] },
    { key: 'tier', label: '层级排序', type: 'number' },
    { key: 'realm', label: '境界/等级', type: 'text' },
    { key: 'promotion', label: '晋升条件', type: 'textarea' },
    { key: 'bottleneck', label: '瓶颈/突破难点', type: 'textarea' },
    { key: 'power', label: '战力表现', type: 'textarea' },
    { key: 'culture', label: '所属文化圈', type: 'select', options: ['中式', '西式', '混合'] },
    { key: 'coverImage', label: '封面图', type: 'image' },
    { key: 'tags', label: '标签', type: 'tags' },
  ] })
  api.registerRelationType({ type: 'current_realm', label: '当前境界', sourceTypes: ['combat_stat'], targetTypes: ['character'], directed: true })
  api.registerRelationType({ type: 'required_skill', label: '所需技能', sourceTypes: ['combat_stat'], targetTypes: ['magic'], directed: true })
  api.registerRelationType({ type: 'training_ground', label: '修炼圣地', sourceTypes: ['combat_stat'], targetTypes: ['region'], directed: true })
  api.registerRelationType({ type: 'breakthrough_item', label: '突破丹药/法器', sourceTypes: ['combat_stat'], targetTypes: ['item'], directed: true })
  api.registerRelationType({ type: 'racial_cap', label: '种族战力上限', sourceTypes: ['combat_stat'], targetTypes: ['species'], directed: true })
  api.registerView({ id: 'combat_stats', label: '战力', icon: 'combat', component: CombatStatView })
}
