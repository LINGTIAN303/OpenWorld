import type { PluginAPIType } from '@worldsmith/entity-core'
import CharacterList from './CharacterList.vue'

export const manifest = {
  id: 'official.characters',
  name: '人物志',
  version: '1.0.0',
  description: '管理世界观中的所有角色',
  author: 'WorldSmith',
  agentSkills: ['worldbuilding', 'content-craft', 'roleplay'],
  agentCapabilities: [
    { action: 'create_entity', description: '创建角色实体', params: ['name', 'description'] },
    { action: 'update_entity', description: '更新角色属性', params: ['entityId', 'changes'] },
  ],
}

export function activate(api: PluginAPIType) {
  // 注册实体类型
  api.registerEntityType({
    type: 'character',
    label: '角色',
    icon: 'character',
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true, placeholder: '角色名称' },
      { key: 'description', label: '描述', type: 'textarea' },
      { key: 'age', label: '年龄', type: 'text' },
      { key: 'gender', label: '性别', type: 'text' },
      { key: 'race', label: '种族', type: 'text', autoLink: { targetType: 'race', relationType: 'belongs_to' } },
      { key: 'occupation', label: '职业', type: 'text' },
      { key: 'affiliation', label: '所属势力', type: 'text', autoLink: { targetType: 'organization', relationType: 'belongs_to' } },
      { key: 'role', label: '角色', type: 'select', options: ['主角', '反派', '配角', '导师', '信使', '其他'] },
      { key: 'appearance', label: '外貌特征', type: 'textarea' },
      { key: 'personality', label: '性格', type: 'textarea' },
      { key: 'background', label: '背景故事', type: 'textarea' },
      { key: 'coverImage', label: '封面图', type: 'image' },
      { key: 'tags', label: '标签', type: 'text' },
    ],
  })

  // 注册关系类型
  api.registerRelationType({
    type: 'knows',
    label: '认识',
    sourceTypes: ['character'],
    targetTypes: ['character'],
    directed: false,
  })
  api.registerRelationType({
    type: 'resides_in',
    label: '居住',
    sourceTypes: ['character'],
    targetTypes: ['location'],
    directed: true,
  })
  api.registerRelationType({
    type: 'belongs_to',
    label: '属于',
    sourceTypes: ['character'],
    targetTypes: ['organization'],
    directed: true,
  })
  api.registerRelationType({
    type: 'parent_of',
    label: '父母',
    sourceTypes: ['character'],
    targetTypes: ['character'],
    directed: true,
  })
  api.registerRelationType({
    type: 'ally_of',
    label: '盟友',
    sourceTypes: ['character'],
    targetTypes: ['character'],
    directed: false,
  })
  api.registerRelationType({
    type: 'owns',
    label: '拥有',
    sourceTypes: ['character'],
    targetTypes: ['item'],
    directed: true,
  })
  api.registerRelationType({
    type: 'participated_in',
    label: '参与事件',
    sourceTypes: ['character'],
    targetTypes: ['event'],
    directed: true,
  })
  api.registerRelationType({
    type: 'associated_with',
    label: '关联概念',
    sourceTypes: ['character'],
    targetTypes: ['concept'],
    directed: false,
  })

  api.registerRelationType({
    type: 'rival_of',
    label: '敌对',
    sourceTypes: ['character'],
    targetTypes: ['character'],
    directed: false,
  })

  api.registerRelationType({
    type: 'spouse_of',
    label: '配偶',
    sourceTypes: ['character'],
    targetTypes: ['character'],
    directed: false,
  })
  api.registerRelationType({
    type: 'sibling_of',
    label: '兄弟姐妹',
    sourceTypes: ['character'],
    targetTypes: ['character'],
    directed: false,
  })
  api.registerRelationType({
    type: 'mentor_of',
    label: '师徒',
    sourceTypes: ['character'],
    targetTypes: ['character'],
    directed: true,
  })

  // 注册视图
  api.registerView({
    id: 'characters',
    label: '人物志',
    icon: 'character',
    component: CharacterList,
  })
}
