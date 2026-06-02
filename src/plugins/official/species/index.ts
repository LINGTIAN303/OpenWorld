import type { PluginAPIType } from '@worldsmith/entity-core'
import SpeciesView from './SpeciesView.vue'

export const manifest = {
  id: 'official.species',
  name: '种族/物种',
  version: '1.0.0',
  description: '管理世界观中的种族、物种及其群体属性',
  author: 'WorldSmith',
  agentSkills: ['worldbuilding'],
  agentCapabilities: [
    { action: 'create_entity', description: '创建物种', params: ['name', 'description'] },
    { action: 'update_entity', description: '更新物种属性', params: ['entityId', 'changes'] },
  ],
}

export function activate(api: PluginAPIType) {
  api.registerEntityType({
    type: 'species',
    label: '物种',
    icon: 'species',
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true, placeholder: '物种名称' },
      { key: 'description', label: '描述', type: 'textarea' },
      { key: 'speciesType', label: '类型', type: 'select',
        options: ['类人', '兽族', '精灵', '矮人', '龙族', '机械', '元素', '亡灵', '神话生物', '异界生物', '植物智能', '其他'] },
      { key: 'avgLifespan', label: '平均寿命', type: 'text' },
      { key: 'avgHeight', label: '平均身高', type: 'text' },
      { key: 'avgWeight', label: '平均体重', type: 'text' },
      { key: 'appearance', label: '外貌特征', type: 'textarea' },
      { key: 'abilities', label: '天赋能力', type: 'textarea' },
      { key: 'weakness', label: '弱点/缺陷', type: 'textarea' },
      { key: 'origin', label: '起源地', type: 'text' },
      { key: 'language', label: '语言', type: 'text' },
      { key: 'population', label: '人口/数量', type: 'number' },
      { key: 'society', label: '社会结构', type: 'textarea' },
      { key: 'coverImage', label: '封面图', type: 'image' },
      { key: 'tags', label: '标签', type: 'tags' },
    ],
  })

  api.registerRelationType({
    type: 'originates_from',
    label: '起源地',
    sourceTypes: ['species'],
    targetTypes: ['region'],
    directed: true,
  })
  api.registerRelationType({
    type: 'speaks',
    label: '语言',
    sourceTypes: ['species'],
    targetTypes: ['concept'],
    directed: true,
  })
  api.registerRelationType({
    type: 'member_of',
    label: '所属势力',
    sourceTypes: ['species'],
    targetTypes: ['organization'],
    directed: true,
  })
  api.registerRelationType({
    type: 'related_species',
    label: '关联物种',
    sourceTypes: ['species'],
    targetTypes: ['species'],
    directed: false,
    properties: [
      { key: 'relation', label: '关系类型', type: 'select', options: ['祖先', '进化', '杂交', '共生', '天敌'] },
    ],
  })
  api.registerRelationType({
    type: 'individual',
    label: '代表人物',
    sourceTypes: ['species'],
    targetTypes: ['character'],
    directed: true,
  })

  api.registerView({
    id: 'species',
    label: '种族/物种',
    icon: 'species',
    component: SpeciesView,
  })
}
