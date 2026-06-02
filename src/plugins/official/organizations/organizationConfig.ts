import type { FormFieldDef } from '@worldsmith/ui-kit'

export const orgTypes = ['王国', '帝国', '部落', '教会', '公会', '佣兵团', '学派', '家族', '商团', '联盟', '其他']

export const orgTypeFilterOptions = [
  { value: '', label: '全部类型' },
  ...orgTypes.map(t => ({ value: t, label: t })),
]

export const orgFields: FormFieldDef[] = [
  { key: 'name', label: '名称', type: 'text', required: true, placeholder: '势力名称' },
  { key: 'description', label: '描述', type: 'textarea', placeholder: '简要描述' },
  { key: 'orgType', label: '类型', type: 'select', options: [
    { value: '王国', label: '王国' }, { value: '帝国', label: '帝国' },
    { value: '部落', label: '部落' }, { value: '教会', label: '教会' },
    { value: '公会', label: '公会' }, { value: '佣兵团', label: '佣兵团' },
    { value: '学派', label: '学派' }, { value: '家族', label: '家族' },
    { value: '商团', label: '商团' }, { value: '联盟', label: '联盟' },
    { value: '其他', label: '其他' },
  ] },
  { key: 'founder', label: '创立者', type: 'entityRef', refType: 'character', relationType: 'founded_by', placeholder: '搜索人物...' },
  { key: 'foundedYear', label: '创立时间', type: 'text' },
  { key: 'dissolutionYear', label: '瓦解时间', type: 'text' },
  { key: 'ideology', label: '理念/宗旨', type: 'textarea' },
  { key: 'structure', label: '组织结构', type: 'textarea' },
  { key: 'headquarters', label: '总部/首都', type: 'entityRef', refType: 'region', relationType: 'located_in', placeholder: '搜索区域...' },
  { key: 'population', label: '规模/人口', type: 'number' },
  { key: 'wealth', label: '财富水平', type: 'select', options: [
    { value: '赤贫', label: '赤贫' }, { value: '贫困', label: '贫困' },
    { value: '一般', label: '一般' }, { value: '富裕', label: '富裕' },
    { value: '极富', label: '极富' },
  ] },
  { key: 'symbol', label: '旗帜/徽记', type: 'text' },
  { key: 'tags', label: '标签', type: 'tags' },
]