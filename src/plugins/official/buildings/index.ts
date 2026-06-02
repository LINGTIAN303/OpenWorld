import type { PluginAPIType } from '@worldsmith/entity-core'
import BuildingView from './BuildingView.vue'

export const manifest = {
  id: 'official.buildings',
  name: '建筑/地点细节',
  version: '1.0.0',
  description: '管理世界观中的建筑、场所、设施及其内部布局',
  author: 'WorldSmith',
  agentSkills: ['worldbuilding'],
  agentCapabilities: [
    { action: 'create_entity', description: '创建建筑', params: ['name', 'description'] },
    { action: 'update_entity', description: '更新建筑属性', params: ['entityId', 'changes'] },
  ],
}

export function activate(api: PluginAPIType) {
  api.registerEntityType({
    type: 'building',
    label: '建筑',
    icon: 'building',
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true, placeholder: '建筑名称' },
      { key: 'description', label: '描述', type: 'textarea' },
      { key: 'buildingType', label: '类型', type: 'select',
        options: ['宫殿', '城堡', '民居', '商铺', '神殿', '军事要塞', '学院',
          '监狱', '图书馆', '工坊', '酒馆', '桥梁', '港口', '灯塔', '墓地', '其他'] },
      { key: 'floors', label: '层数', type: 'text' },
      { key: 'area', label: '面积', type: 'text' },
      { key: 'style', label: '建筑风格', type: 'select',
        options: ['古典', '哥特', '巴洛克', '现代', '奇幻', '东方', '古典复兴', '乡村', '地下', '混合'] },
      { key: 'era', label: '建造年代', type: 'text' },
      { key: 'builder', label: '建造者', type: 'text' },
      { key: 'status', label: '现状', type: 'select',
        options: ['完好', '轻度损毁', '严重损毁', '废墟', '修缮中', '改建中'] },
      { key: 'materials', label: '主要建材', type: 'textarea' },
      { key: 'significance', label: '重要性/历史意义', type: 'textarea' },
      { key: 'mapImage', label: '平面图', type: 'image' },
      { key: 'tags', label: '标签', type: 'tags' },
    ],
  })

  api.registerRelationType({
    type: 'located_in',
    label: '位于',
    sourceTypes: ['building'],
    targetTypes: ['region'],
    directed: true,
    properties: [
      { key: 'address', label: '地址', type: 'text' },
    ],
  })
  api.registerRelationType({
    type: 'belongs_to',
    label: '归属',
    sourceTypes: ['building'],
    targetTypes: ['organization'],
    directed: true,
  })
  api.registerRelationType({
    type: 'owned_by',
    label: '拥有者',
    sourceTypes: ['building'],
    targetTypes: ['character'],
    directed: true,
    properties: [
      { key: 'since', label: '起始时间', type: 'text' },
      { key: 'role', label: '身份', type: 'text' },
    ],
  })
  api.registerRelationType({
    type: 'resident',
    label: '常驻者',
    sourceTypes: ['building'],
    targetTypes: ['character'],
    directed: true,
  })
  api.registerRelationType({
    type: 'contains',
    label: '包含建筑',
    sourceTypes: ['building'],
    targetTypes: ['building'],
    directed: true,
    properties: [
      { key: 'description', label: '关系描述', type: 'text' },
    ],
  })
  api.registerRelationType({
    type: 'connected_to',
    label: '通道连接',
    sourceTypes: ['building'],
    targetTypes: ['building'],
    directed: false,
    properties: [
      { key: 'routeType', label: '通道类型', type: 'select',
        options: ['门', '走廊', '地道', '桥', '传送门', '密道'] },
    ],
  })
  api.registerRelationType({
    type: 'stored_at',
    label: '存放道具',
    sourceTypes: ['building'],
    targetTypes: ['item'],
    directed: true,
  })
  api.registerRelationType({
    type: 'event_location',
    label: '事件发生地',
    sourceTypes: ['building'],
    targetTypes: ['event'],
    directed: true,
  })
  api.registerRelationType({
    type: 'managed_by',
    label: '管理者',
    sourceTypes: ['building'],
    targetTypes: ['character', 'organization'],
    directed: true,
  })
  api.registerRelationType({
    type: 'famous_for',
    label: '以...闻名',
    sourceTypes: ['building'],
    targetTypes: ['item', 'concept', 'character'],
    directed: true,
  })

  api.registerView({
    id: 'buildings',
    label: '建筑/地点细节',
    icon: 'building',
    component: BuildingView,
  })
}
