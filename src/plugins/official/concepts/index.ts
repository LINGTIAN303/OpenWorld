import type { PluginAPIType } from '@worldsmith/entity-core'
import ConceptView from './ConceptView.vue'

export const manifest = {
  id: 'official.concepts',
  name: '概念/设定库',
  version: '1.0.0',
  description: '世界观中的概念、规则、百科条目',
  author: 'WorldSmith',
  agentSkills: ['worldbuilding'],
  agentCapabilities: [
    { action: 'create_entity', description: '创建概念', params: ['name', 'description'] },
    { action: 'update_entity', description: '更新概念属性', params: ['entityId', 'changes'] },
  ],
}

export function activate(api: PluginAPIType) {
  api.registerEntityType({
    type: 'concept',
    label: '概念',
    icon: 'concept',
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true, placeholder: '概念名称' },
      { key: 'description', label: '描述', type: 'textarea' },
      { key: 'conceptType', label: '类型', type: 'select',
        options: ['概念', '规则', '魔法', '科技', '文化', '历史', '宗教', '生物', '语言', '社会制度', '其他'] },
      { key: 'definition', label: '定义', type: 'textarea' },
      { key: 'aliases', label: '别名/同义词', type: 'tags' },
      { key: 'coverImage', label: '封面图', type: 'image' },
      { key: 'tags', label: '标签', type: 'text' },
    ],
  })

  api.registerRelationType({
    type: 'references',
    label: '引用',
    sourceTypes: ['concept'],
    targetTypes: ['concept'],
    directed: true,
  })
  api.registerRelationType({
    type: 'contradicts',
    label: '矛盾',
    sourceTypes: ['concept'],
    targetTypes: ['concept'],
    directed: false,
    properties: [
      { key: 'explanation', label: '矛盾说明', type: 'textarea' },
    ],
  })

  // 跨插件关系
  api.registerRelationType({
    type: 'broader_than',
    label: '上位概念',
    sourceTypes: ['concept'],
    targetTypes: ['concept'],
    directed: true,
  })
  api.registerRelationType({
    type: 'inspired_by',
    label: '灵感来源',
    sourceTypes: ['concept'],
    targetTypes: ['concept', 'character'],
    directed: true,
  })

  api.registerView({
    id: 'concepts',
    label: '概念/设定库',
    icon: 'concept',
    component: ConceptView,
  })
}
