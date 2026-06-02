import type { PluginAPIType } from '@worldsmith/entity-core'
import TimelineView from './TimelineView.vue'

export const manifest = {
  id: 'official.timeline',
  name: '时间线',
  version: '1.0.0',
  description: '管理世界观中的事件年表与因果链，支持双模式可视化、泳道分组、缩放导航',
  author: 'WorldSmith',
  agentSkills: ['timeline-architect'],
  agentCapabilities: [
    { action: 'create_event', description: '创建时间线事件', params: ['name', 'date', 'description', 'era'] },
    { action: 'update_event', description: '更新事件属性', params: ['eventId', 'changes'] },
    { action: 'sort_events', description: '按时间排序事件', params: ['method'] },
    { action: 'detect_conflicts', description: '检测时间冲突', params: ['threshold'] },
    { action: 'set_layout_mode', description: '切换布局模式（horizontal/vertical）', params: ['mode'] },
    { action: 'set_group_mode', description: '切换泳道分组（none/character/location/era/tag）', params: ['mode'] },
    { action: 'zoom', description: '缩放时间轴（zoomIn/zoomOut/fitAll）', params: ['action'] },
    { action: 'toggle_collapse', description: '折叠/展开事件节点', params: ['eventId', 'expandAll', 'collapseAll'] },
  ],
}

export function activate(api: PluginAPIType) {
  api.registerEntityType({
    type: 'event',
    label: '事件',
    icon: 'timeline',
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true, placeholder: '事件名称' },
      { key: 'description', label: '描述', type: 'textarea' },
      { key: 'parentId', label: '父级事件', type: 'entity-ref' },
      { key: 'date', label: '日期/纪年', type: 'text' },
      { key: 'dateEnd', label: '结束日期', type: 'text' },
      { key: 'era', label: '纪元', type: 'text' },
      { key: 'importance', label: '重要程度', type: 'select',
        options: ['关键', '重要', '普通', '细微'] },
      { key: 'status', label: '状态', type: 'select',
        options: ['正史', '废案', '备选'] },
      { key: 'location', label: '发生地点', type: 'text' },
      { key: 'coverImage', label: '封面图', type: 'image' },
      { key: 'tags', label: '标签', type: 'text' },
    ],
  })

  api.registerRelationType({
    type: 'happened_in',
    label: '发生在',
    sourceTypes: ['event'],
    targetTypes: ['region'],
    directed: true,
  })
  api.registerRelationType({
    type: 'involves',
    label: '涉及',
    sourceTypes: ['event'],
    targetTypes: ['character'],
    directed: true,
    properties: [
      { key: 'role', label: '角色', type: 'text' },
    ],
  })
  api.registerRelationType({
    type: 'causes',
    label: '导致',
    sourceTypes: ['event'],
    targetTypes: ['event'],
    directed: true,
    properties: [
      { key: 'description', label: '因果描述', type: 'textarea' },
    ],
  })
  api.registerRelationType({
    type: 'parallel_to',
    label: '并行于',
    sourceTypes: ['event'],
    targetTypes: ['event'],
    directed: false,
  })

  // 跨插件关系
  api.registerRelationType({
    type: 'occurred_at',
    label: '发生于',
    sourceTypes: ['event'],
    targetTypes: ['region'],
    directed: true,
  })
  api.registerRelationType({
    type: 'caused_by',
    label: '由...引发',
    sourceTypes: ['event'],
    targetTypes: ['character', 'organization', 'event'],
    directed: true,
  })

  api.registerView({
    id: 'timeline',
    label: '时间线',
    icon: 'timeline',
    component: TimelineView,
  })
}
