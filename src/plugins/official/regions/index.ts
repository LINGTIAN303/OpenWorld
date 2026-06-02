import type { PluginAPIType } from '@worldsmith/entity-core'
import RegionList from './RegionList.vue'

export const manifest = {
  id: 'official.regions',
  name: '区域图谱',
  version: '1.0.0',
  description: '管理世界观中的地理区域与层级关系',
  author: 'WorldSmith',
  agentSkills: ['worldbuilding', 'content-craft'],
  agentCapabilities: [
    { action: 'create_region', description: '创建区域', params: ['name', 'description'] },
    { action: 'update_region', description: '更新区域属性', params: ['entityId', 'changes'] },
  ],
}

export function activate(api: PluginAPIType) {
  // 注册实体类型
  api.registerEntityType({
    type: 'region',
    label: '区域',
    icon: 'region',
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true, placeholder: '区域名称' },
      { key: 'description', label: '描述', type: 'textarea' },
      { key: 'regionType', label: '类型', type: 'select',
        options: ['大陆', '国家', '行省', '城市', '地标', '区域'] },
      { key: 'climate', label: '气候', type: 'select',
        options: ['热带雨林', '热带草原', '热带沙漠', '地中海', '温带海洋', '温带大陆',
          '温带季风', '亚寒带', '寒带苔原', '寒带冰原', '高山高原', '自定义'] },
      { key: 'population', label: '人口', type: 'text' },
      { key: 'area', label: '面积', type: 'text' },
      { key: 'government', label: '政体/统治', type: 'select', options: ['君主制', '共和制', '民主制', '寡头制', '神权制', '军事独裁', '部落制', '联邦制', '其他'] },
      { key: 'significance', label: '重要性', type: 'textarea' },
      { key: 'mapImage', label: '地图图片', type: 'image' },
      { key: 'mapX', label: '地图X坐标', type: 'number' },
      { key: 'mapY', label: '地图Y坐标', type: 'number' },
      { key: 'tags', label: '标签', type: 'text' },
    ],
  })

  // 注册关系类型
  api.registerRelationType({
    type: 'located_in',
    label: '位于',
    sourceTypes: ['region'],
    targetTypes: ['region'],
    directed: true,
    properties: [
      { key: 'note', label: '备注', type: 'text' },
    ],
  })
  api.registerRelationType({
    type: 'borders',
    label: '接壤',
    sourceTypes: ['region'],
    targetTypes: ['region'],
    directed: false,
  })
  api.registerRelationType({
    type: 'controlled_by',
    label: '被控制',
    sourceTypes: ['region'],
    targetTypes: ['organization'],
    directed: true,
  })
  api.registerRelationType({
    type: 'route',
    label: '路线',
    sourceTypes: ['region'],
    targetTypes: ['region'],
    directed: false,
    properties: [
      { key: 'routeType', label: '路线类型', type: 'select',
        options: ['陆路', '水路', '空路', '魔法通道', '海路', '山路'] },
      { key: 'duration', label: '耗时', type: 'text' },
      { key: 'danger', label: '危险等级', type: 'select',
        options: ['安全', '低风险', '中等风险', '高风险', '极度危险'] },
      { key: 'description', label: '路线描述', type: 'textarea' },
    ],
  })
  api.registerRelationType({
    type: 'enclave_of',
    label: '飞地属于',
    sourceTypes: ['region'],
    targetTypes: ['region'],
    directed: true,
    properties: [
      { key: 'note', label: '备注', type: 'text' },
    ],
  })

  // 注册视图
  // 跨插件关系
  api.registerRelationType({
    type: 'contains',
    label: '包含子区域',
    sourceTypes: ['region'],
    targetTypes: ['region'],
    directed: true,
  })
  api.registerRelationType({
    type: 'capital_of',
    label: '首都/中心',
    sourceTypes: ['region'],
    targetTypes: ['organization'],
    directed: true,
  })
  api.registerRelationType({
    type: 'notable_for',
    label: '以...闻名',
    sourceTypes: ['region'],
    targetTypes: ['item', 'concept', 'character'],
    directed: true,
  })

  api.registerView({
    id: 'regions',
    label: '区域图谱',
    icon: 'region',
    component: RegionList,
  })
}
