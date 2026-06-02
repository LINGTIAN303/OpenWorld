import type { PluginAPIType } from '@worldsmith/entity-core'
import OrganizationView from './OrganizationView.vue'

export const manifest = {
  id: 'official.organizations',
  name: '势力/组织',
  version: '1.0.0',
  description: '管理世界观中的势力、组织、派系及其关系',
  author: 'WorldSmith',
  agentSkills: ['worldbuilding'],
  agentCapabilities: [
    { action: 'create_entity', description: '创建组织', params: ['name', 'description'] },
    { action: 'update_entity', description: '更新组织属性', params: ['entityId', 'changes'] },
  ],
}

export function activate(api: PluginAPIType) {
  api.registerEntityType({
    type: 'organization',
    label: '势力',
    icon: 'organization',
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true, placeholder: '势力名称' },
      { key: 'description', label: '描述', type: 'textarea' },
      { key: 'orgType', label: '类型', type: 'select',
        options: ['王国', '帝国', '部落', '教会', '公会', '佣兵团', '学派', '家族', '商团', '联盟', '其他'] },
      { key: 'founder', label: '创立者', type: 'text' },
      { key: 'foundedYear', label: '创立时间', type: 'text' },
      { key: 'dissolutionYear', label: '瓦解时间', type: 'text' },
      { key: 'ideology', label: '理念/宗旨', type: 'textarea' },
      { key: 'structure', label: '组织结构', type: 'textarea' },
      { key: 'headquarters', label: '总部/首都', type: 'text' },
      { key: 'population', label: '规模/人口', type: 'number' },
      { key: 'wealth', label: '财富水平', type: 'text' },
      { key: 'symbol', label: '旗帜/徽记', type: 'text' },
      { key: 'coverImage', label: '封面图', type: 'image' },
      { key: 'tags', label: '标签', type: 'text' },
    ],
  })

  // 关系类型
  api.registerRelationType({
    type: 'member_of',
    label: '成员',
    sourceTypes: ['character'],
    targetTypes: ['organization'],
    directed: true,
    properties: [
      { key: 'role', label: '职位/称号', type: 'text' },
      { key: 'since', label: '加入时间', type: 'text' },
    ],
  })
  api.registerRelationType({
    type: 'sub_organization',
    label: '下属势力',
    sourceTypes: ['organization'],
    targetTypes: ['organization'],
    directed: true,
  })
  api.registerRelationType({
    type: 'allied_with',
    label: '盟友',
    sourceTypes: ['organization'],
    targetTypes: ['organization'],
    directed: false,
    properties: [
      { key: 'treaty', label: '盟约名称', type: 'text' },
      { key: 'since', label: '起始时间', type: 'text' },
    ],
  })
  api.registerRelationType({
    type: 'at_war_with',
    label: '交战',
    sourceTypes: ['organization'],
    targetTypes: ['organization'],
    directed: false,
    properties: [
      { key: 'cause', label: '原因', type: 'text' },
    ],
  })
  api.registerRelationType({
    type: 'controls',
    label: '控制区域',
    sourceTypes: ['organization'],
    targetTypes: ['region'],
    directed: true,
    properties: [
      { key: 'since', label: '起始时间', type: 'text' },
    ],
  })
  api.registerRelationType({
    type: 'trade_with',
    label: '贸易',
    sourceTypes: ['organization'],
    targetTypes: ['organization'],
    directed: false,
    properties: [
      { key: 'goods', label: '贸易品', type: 'text' },
    ],
  })

  // 跨插件关系
  api.registerRelationType({
    type: 'member_of',
    label: '成员',
    sourceTypes: ['character'],
    targetTypes: ['organization'],
    directed: true,
  })
  api.registerRelationType({
    type: 'involved_in',
    label: '涉及事件',
    sourceTypes: ['organization'],
    targetTypes: ['event'],
    directed: true,
  })
  api.registerRelationType({
    type: 'allied_with',
    label: '同盟',
    sourceTypes: ['organization'],
    targetTypes: ['organization'],
    directed: false,
  })
  api.registerRelationType({
    type: 'hostile_to',
    label: '敌对',
    sourceTypes: ['organization'],
    targetTypes: ['organization'],
    directed: false,
  })

  api.registerView({
    id: 'organizations',
    label: '势力/组织',
    icon: 'organization',
    component: OrganizationView,
  })
}
