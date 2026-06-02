import type { PluginAPIType } from '@worldsmith/entity-core'
import PlantView from './PlantView.vue'

export const manifest = {
  id: 'official.plants',
  name: '植物/生态',
  version: '1.0.0',
  description: '管理世界观中的植物、药草、菌类、魔法植物',
  author: 'WorldSmith',
  agentSkills: ['worldbuilding'],
  agentCapabilities: [
    { action: 'create_entity', description: '创建植物', params: ['name', 'description'] },
    { action: 'update_entity', description: '更新植物属性', params: ['entityId', 'changes'] },
  ],
}

export function activate(api: PluginAPIType) {
  api.registerEntityType({
    type: 'plant',
    label: '植物',
    icon: 'plant',
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true, placeholder: '植物名称' },
      { key: 'description', label: '描述', type: 'textarea' },
      { key: 'plantType', label: '类型', type: 'select', options: ['药草', '树木', '菌类', '魔法植物', '花卉', '谷物', '水生植物', '藤本', '其他'] },
      { key: 'habitat', label: '生长环境', type: 'text' },
      { key: 'rarity', label: '稀有度', type: 'select', options: ['常见', '少见', '稀有', '极稀有', '传说'] },
      { key: 'usage', label: '用途', type: 'multi-select', options: ['炼金', '食用', '建材', '仪式', '制毒', '纺织', '观赏'] },
      { key: 'appearance', label: '外观', type: 'textarea' },
      { key: 'toxicity', label: '毒性/副作用', type: 'textarea' },
      { key: 'growthCycle', label: '生长周期', type: 'text' },
      { key: 'relatedProducts', label: '制成品', type: 'textarea' },
      { key: 'coverImage', label: '封面图', type: 'image' },
      { key: 'tags', label: '标签', type: 'tags' },
    ],
  })
  api.registerRelationType({
    type: 'native_to', label: '原生地',
    sourceTypes: ['plant'], targetTypes: ['region'], directed: true,
  })
  api.registerRelationType({
    type: 'materials_from', label: '制成物',
    sourceTypes: ['plant'], targetTypes: ['item'], directed: true,
  })
  api.registerRelationType({
    type: 'used_by', label: '使用者',
    sourceTypes: ['plant'], targetTypes: ['species', 'character'], directed: true,
  })
  api.registerRelationType({
    type: 'magic_material', label: '施法材料',
    sourceTypes: ['plant'], targetTypes: ['magic'], directed: true,
  })
  api.registerView({
    id: 'plants', label: '植物/生态', icon: 'plant',
    component: PlantView,
  })
}
