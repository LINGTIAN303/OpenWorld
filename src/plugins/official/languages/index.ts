import type { PluginAPIType } from '@worldsmith/entity-core'
import LanguageView from './LanguageView.vue'

export const manifest = {
  id: 'official.languages',
  name: '语言/文字',
  version: '1.0.0',
  description: '管理世界观中的语言、文字系统',
  author: 'WorldSmith',
  agentSkills: ['worldbuilding'],
  agentCapabilities: [
    { action: 'create_entity', description: '创建语言', params: ['name', 'description'] },
    { action: 'update_entity', description: '更新语言属性', params: ['entityId', 'changes'] },
  ],
}

export function activate(api: PluginAPIType) {
  api.registerEntityType({
    type: 'language',
    label: '语言',
    icon: 'language',
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true, placeholder: '语言名称' },
      { key: 'description', label: '描述', type: 'textarea' },
      { key: 'langType', label: '语言类型', type: 'select',
        options: ['自然语言', '人造语言', '古代语言', '暗语/密语', '手语', '心灵感应', '其他'] },
      { key: 'scriptType', label: '文字类型', type: 'select',
        options: ['表音文字', '表意文字', '音节文字', '象形文字', '符文', '无文字', '混合'] },
      { key: 'languageFamily', label: '语系', type: 'text' },
      { key: 'scope', label: '使用范围', type: 'select',
        options: ['全球通用', '区域通用', '种族语言', '少数族群', '已灭绝', '特定群体'] },
      { key: 'maturity', label: '成熟度', type: 'select',
        options: ['完整语言', '基础词汇表', '仅有短语', '发展中'] },
      { key: 'phonology', label: '音系特点', type: 'textarea' },
      { key: 'grammar', label: '语法特点', type: 'textarea' },
      { key: 'vocabulary', label: '词汇示例', type: 'textarea' },
      { key: 'sampleText', label: '文字示例', type: 'textarea' },
      { key: 'coverImage', label: '封面图', type: 'image' },
      { key: 'tags', label: '标签', type: 'tags' },
    ],
  })
  api.registerRelationType({ type: 'spoken_by', label: '使用者', sourceTypes: ['language'], targetTypes: ['species', 'character'], directed: true })
  api.registerRelationType({ type: 'spoken_in', label: '通行区域', sourceTypes: ['language'], targetTypes: ['region'], directed: true })
  api.registerRelationType({ type: 'language_branch', label: '语系分支', sourceTypes: ['language'], targetTypes: ['language'], directed: true })
  api.registerRelationType({ type: 'related_language', label: '关联语言', sourceTypes: ['language'], targetTypes: ['language'], directed: false, properties: [{ key: 'relation', label: '关系', type: 'select', options: ['同源', '借词', '混合', '变体', '祖先语言'] }] })
  api.registerRelationType({ type: 'script_used_in', label: '文字用于', sourceTypes: ['language'], targetTypes: ['concept'], directed: true })
  api.registerView({ id: 'languages', label: '语言/文字', icon: 'language', component: LanguageView })
}
