import type { PluginAPIType } from '@worldsmith/entity-core'
import ItemView from './ItemView.vue'

export const manifest = {
  id: 'official.items',
  name: '道具总类',
  version: '1.0.0',
  description: '管理世界观中的道具、武器、法器与宝物',
  author: 'WorldSmith',
  agentSkills: ['content-craft'],
  agentCapabilities: [
    { action: 'create_entity', description: '创建物品', params: ['name', 'description'] },
    { action: 'update_entity', description: '更新物品属性', params: ['entityId', 'changes'] },
  ],
}

export function activate(api: PluginAPIType) {
  api.registerEntityType({
    type: 'item',
    label: '道具',
    icon: 'trade',
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true, placeholder: '道具名称' },
      { key: 'description', label: '描述', type: 'textarea' },
      { key: 'itemType', label: '类型', type: 'select',
        options: ['武器', '防具', '法器', '文书', '信物', '药水', '工具',
          '交通工具', '乐器', '艺术品', '容器', '食物', '衣物', '杂物', '神器', '其他'] },
      { key: 'material', label: '材质', type: 'text' },
      { key: 'origin', label: '来源/产地', type: 'text' },
      { key: 'creator', label: '制作者', type: 'text' },
      { key: 'era', label: '所属时代', type: 'text' },
      { key: 'currentOwner', label: '当前持有者', type: 'text' },
      { key: 'powers', label: '能力/功效', type: 'textarea' },
      { key: 'condition', label: '状况', type: 'select',
        options: ['完好', '轻微破损', '严重破损', '已修复', '已毁', '遗失', '未知'] },
      { key: 'rarity', label: '稀有度', type: 'select',
        options: ['普通', '珍贵', '稀有', '传说', '唯一'] },
      { key: 'significance', label: '意义/价值', type: 'textarea' },
      { key: 'coverImage', label: '封面图', type: 'image' },
      { key: 'tags', label: '标签', type: 'text' },
    ],
  })

  api.registerRelationType({
    type: 'possessed_by',
    label: '被持有',
    sourceTypes: ['item'],
    targetTypes: ['character'],
    directed: true,
    properties: [
      { key: 'since', label: '获得时间', type: 'text' },
      { key: 'until', label: '失去时间', type: 'text' },
      { key: 'circumstance', label: '获得/失去缘由', type: 'text' },
    ],
  })
  api.registerRelationType({
    type: 'kept_at',
    label: '存放于',
    sourceTypes: ['item'],
    targetTypes: ['region'],
    directed: true,
  })
  api.registerRelationType({
    type: 'used_in',
    label: '使用于',
    sourceTypes: ['item'],
    targetTypes: ['event'],
    directed: true,
    properties: [
      { key: 'manner', label: '使用方式', type: 'text' },
    ],
  })
  api.registerRelationType({
    type: 'related_item',
    label: '关联道具',
    sourceTypes: ['item'],
    targetTypes: ['item'],
    directed: false,
    properties: [
      { key: 'relation', label: '关联类型', type: 'select',
        options: ['同一套', '相克', '相生', '仿制品', '原材料', '升级形态', '同源'] },
    ],
  })

  // 跨插件关系
  api.registerRelationType({
    type: 'owned_by',
    label: '被拥有',
    sourceTypes: ['item'],
    targetTypes: ['character'],
    directed: true,
  })
  api.registerRelationType({
    type: 'located_at',
    label: '位于',
    sourceTypes: ['item'],
    targetTypes: ['region'],
    directed: true,
  })
  api.registerRelationType({
    type: 'created_by',
    label: '由...制造',
    sourceTypes: ['item'],
    targetTypes: ['character', 'organization'],
    directed: true,
  })

  api.registerView({
    id: 'items',
    label: '道具总类',
    icon: 'trade',
    component: ItemView,
  })
}
