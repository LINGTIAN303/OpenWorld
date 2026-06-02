import type { PluginAPIType } from '@worldsmith/entity-core'
import ApparelView from './ApparelView.vue'

export const manifest = {
  id: 'official.apparel',
  name: '服饰/装备',
  version: '1.0.0',
  description: '管理角色的服装、护甲与饰品',
  author: 'WorldSmith',
  agentSkills: ['content-craft'],
  agentCapabilities: [
    { action: 'create_entity', description: '创建服装', params: ['name', 'description'] },
    { action: 'update_entity', description: '更新服装属性', params: ['entityId', 'changes'] },
  ],
}

export function activate(api: PluginAPIType) {
  api.registerEntityType({
    type: 'apparel',
    label: '服饰/装备',
    icon: 'apparel',
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true, placeholder: '服饰名称' },
      { key: 'description', label: '描述', type: 'textarea' },
      { key: 'apparelType', label: '类型', type: 'select',
        options: ['上衣', '下装', '连衣裙', '外套/披风', '头饰',
          '鞋履', '手套', '饰品/首饰', '轻甲', '中甲', '重甲', '盾牌', '法袍', '套装'] },
      { key: 'armorClass', label: '护甲等级', type: 'select',
        options: ['无防护', '布甲', '皮甲', '锁甲', '板甲', '法袍', '饰品'] },
      { key: 'material', label: '材质', type: 'text' },
      { key: 'color', label: '颜色', type: 'text' },
      { key: 'style', label: '风格', type: 'select',
        options: ['朴素', '华丽', '异域', '军用', '仪式', '日常', '伪装', '工装'] },
      { key: 'defense', label: '防御值', type: 'number' },
      { key: 'weight', label: '重量', type: 'select',
        options: ['极轻', '轻', '中等', '重', '极重'] },
      { key: 'durability', label: '耐久度', type: 'select',
        options: ['易损', '普通', '耐用', '坚固', '不毁'] },
      { key: 'origin', label: '产地', type: 'text' },
      { key: 'era', label: '时代', type: 'text' },
      { key: 'condition', label: '状况', type: 'select',
        options: ['完好', '轻微磨损', '破损', '已修复', '已毁', '遗失'] },
      { key: 'significance', label: '意义', type: 'textarea' },
      { key: 'coverImage', label: '封面图', type: 'image' },
      { key: 'tags', label: '标签', type: 'text' },
    ],
  })

  api.registerRelationType({
    type: 'worn_by',
    label: '被穿着',
    sourceTypes: ['apparel'],
    targetTypes: ['character'],
    directed: true,
    properties: [
      { key: 'since', label: '开始穿着时间', type: 'text' },
    ],
  })
  api.registerRelationType({
    type: 'enchanted_with',
    label: '被附魔',
    sourceTypes: ['apparel'],
    targetTypes: ['magic'],
    directed: true,
    properties: [
      { key: 'spell', label: '附魔效果', type: 'text' },
    ],
  })
  api.registerRelationType({
    type: 'manufactured_by',
    label: '由...制造',
    sourceTypes: ['apparel'],
    targetTypes: ['character', 'organization'],
    directed: true,
  })
  api.registerRelationType({
    type: 'related_apparel',
    label: '关联服饰',
    sourceTypes: ['apparel'],
    targetTypes: ['apparel'],
    directed: false,
    properties: [
      { key: 'relation', label: '关联类型', type: 'select',
        options: ['同一套', '成套', '相克', '升级形态', '同源'] },
    ],
  })

  api.registerRelationType({
    type: 'located_at',
    label: '位于',
    sourceTypes: ['apparel'],
    targetTypes: ['region'],
    directed: true,
  })
  api.registerRelationType({
    type: 'owned_by',
    label: '被拥有',
    sourceTypes: ['apparel'],
    targetTypes: ['character'],
    directed: true,
  })
  api.registerRelationType({
    type: 'created_by',
    label: '由...制造',
    sourceTypes: ['apparel'],
    targetTypes: ['character', 'organization'],
    directed: true,
  })

  api.registerView({
    id: 'apparel',
    label: '服饰/装备',
    icon: 'apparel',
    component: ApparelView,
  })
}
