/**
 * 插件能力桥接模块
 *
 * 连接 Skill 系统与插件系统，提供：
 * - 插件能力注册与查询
 * - 根据激活的 Skill ID 解析关联的插件工具
 * - 构建注入提示词的插件能力描述
 *
 * 预定义的内置插件能力列表 (WORLD_SMITH_PLUGIN_CAPABILITIES) 在模块加载时自动注册。
 */

import { findSkillById } from './registry'

/** 插件能力的单条声明 */
export interface PluginCapabilityDeclaration {
  action: string
  description: string
  params?: string[]
}

/** 插件的完整能力描述 */
export interface PluginCapability {
  pluginId: string
  pluginName: string
  entityTypes: string[]
  agentSkills: string[]
  capabilities: PluginCapabilityDeclaration[]
}

/** 插件能力注册中心（内存级） */
const capabilityRegistry = new Map<string, PluginCapability>()

/** 注册一个插件的能力信息 */
export function registerPluginCapability(cap: PluginCapability): void {
  capabilityRegistry.set(cap.pluginId, cap)
}

/** 根据插件 ID 查询其能力信息 */
export function getPluginCapability(pluginId: string): PluginCapability | undefined {
  return capabilityRegistry.get(pluginId)
}

/** 获取所有已注册的插件能力 */
export function getAllPluginCapabilities(): PluginCapability[] {
  return Array.from(capabilityRegistry.values())
}

/**
 * 根据激活的 Skill ID 列表，解析出关联的插件能力
 * 遍历每个 Skill 的 relatedPlugins 字段，去重合并
 */
export function resolveRelatedPlugins(skillIds: string[]): PluginCapability[] {
  const plugins = new Map<string, PluginCapability>()
  for (const id of skillIds) {
    const skill = findSkillById(id)
    if (!skill?.relatedPlugins) continue
    for (const pluginId of skill.relatedPlugins) {
      const cap = capabilityRegistry.get(pluginId)
      if (cap) plugins.set(pluginId, cap)
    }
  }
  return Array.from(plugins.values())
}

/**
 * 根据激活的 Skill ID 列表，解析出所有关联的插件专属工具名称
 * 从 Skill 的 pluginTools 绑定中提取
 */
export function resolvePluginToolNames(skillIds: string[]): string[] {
  const tools = new Set<string>()
  for (const id of skillIds) {
    const skill = findSkillById(id)
    if (!skill?.pluginTools) continue
    for (const binding of skill.pluginTools) {
      for (const tool of binding.tools) {
        tools.add(tool)
      }
    }
  }
  return Array.from(tools)
}

/**
 * 构建注入系统提示词的插件能力描述
 * 列出当前激活技能关联的所有插件及其能力，供 LLM 参考
 */
export function buildPluginCapabilityPrompt(skillIds: string[]): string {
  const plugins = resolveRelatedPlugins(skillIds)
  if (plugins.length === 0) return ''

  const lines = [
    '## 插件能力 (Plugin Capabilities)',
    '',
    '以下插件已绑定到当前激活的技能，你可以通过对应工具操作它们：',
    '',
  ]

  for (const p of plugins) {
    lines.push(`### ${p.pluginName} (\`${p.pluginId}\`)`)
    if (p.capabilities.length > 0) {
      for (const cap of p.capabilities) {
        const params = cap.params ? `(${cap.params.join(', ')})` : ''
        lines.push(`- **${cap.action}**${params}: ${cap.description}`)
      }
    }
    if (p.entityTypes.length > 0) {
      lines.push(`- 管理实体类型: ${p.entityTypes.join(', ')}`)
    }
    lines.push('')
  }

  lines.push('使用 `plugin_write` 工具可向这些插件写入数据。使用插件专属工具可进行更精细的操作。')
  return lines.join('\n')
}

/**
 * 内置插件能力列表
 * 定义所有 WorldSmith 官方插件的 Agent 可操作能力
 */
export const WORLD_SMITH_PLUGIN_CAPABILITIES: PluginCapability[] = [
  {
    pluginId: 'timeline',
    pluginName: '时间线',
    entityTypes: ['timeline_event'],
    agentSkills: ['timeline-architect'],
    capabilities: [
      { action: 'timeline_create_event', description: '创建时间线事件', params: ['name', 'date', 'description', 'era'] },
      { action: 'timeline_update_event', description: '更新事件属性', params: ['eventId', 'changes'] },
      { action: 'timeline_sort_events', description: '按时间排序事件', params: ['method'] },
      { action: 'timeline_detect_conflicts', description: '检测时间冲突', params: ['threshold'] },
      { action: 'timeline_get_events', description: '获取时间线事件列表', params: ['era', 'keyword'] },
      { action: 'timeline_export_timeline', description: '导出时间线数据', params: ['format'] },
    ],
  },
  {
    pluginId: 'graph',
    pluginName: '关系图谱',
    entityTypes: ['entity', 'relation'],
    agentSkills: ['graph-explorer'],
    capabilities: [
      { action: 'graph_get_nodes', description: '获取图谱节点列表', params: ['type', 'keyword'] },
      { action: 'graph_get_edges', description: '获取图谱边列表', params: ['sourceId', 'targetId', 'type'] },
      { action: 'graph_find_path', description: '查找两节点间路径', params: ['sourceId', 'targetId'] },
      { action: 'graph_cluster_analysis', description: '聚类分析', params: ['method'] },
      { action: 'graph_highlight_nodes', description: '高亮指定节点', params: ['nodeIds'] },
      { action: 'graph_export_snapshot', description: '导出图谱快照', params: ['format'] },
    ],
  },
  {
    pluginId: 'mindmap',
    pluginName: '思维导图',
    entityTypes: ['mindmap_node'],
    agentSkills: ['mindmap-builder'],
    capabilities: [
      { action: 'mindmap_create_node', description: '创建节点', params: ['parentId', 'label', 'style'] },
      { action: 'mindmap_update_node', description: '更新节点', params: ['nodeId', 'changes'] },
      { action: 'mindmap_delete_node', description: '删除节点', params: ['nodeId'] },
      { action: 'mindmap_get_structure', description: '获取整棵树结构' },
      { action: 'mindmap_auto_layout', description: '自动布局', params: ['algorithm'] },
      { action: 'mindmap_export_image', description: '导出为图片', params: ['format'] },
    ],
  },
  {
    pluginId: 'manuscript',
    pluginName: '正文编辑器',
    entityTypes: ['manuscript_chapter'],
    agentSkills: ['manuscript-author'],
    capabilities: [
      { action: 'manuscript_create_chapter', description: '创建章节', params: ['title', 'content', 'volumeName'] },
      { action: 'manuscript_update_chapter', description: '更新章节', params: ['chapterId', 'content', 'status'] },
      { action: 'manuscript_list_chapters', description: '列出章节', params: ['volumeName'] },
      { action: 'manuscript_get_chapter_content', description: '获取章节内容', params: ['chapterId'] },
      { action: 'manuscript_insert_mention', description: '插入实体引用', params: ['chapterId', 'entityId', 'position'] },
      { action: 'manuscript_export_document', description: '导出文档', params: ['format', 'chapters'] },
    ],
  },
  {
    pluginId: 'outline',
    pluginName: '大纲编辑器',
    entityTypes: ['outline_node'],
    agentSkills: ['outline-architect'],
    capabilities: [
      { action: 'outline_create_node', description: '创建大纲节点', params: ['title', 'parentId', 'type'] },
      { action: 'outline_update_node', description: '更新节点', params: ['nodeId', 'changes'] },
      { action: 'outline_move_node', description: '移动节点', params: ['nodeId', 'newParentId', 'position'] },
      { action: 'outline_get_structure', description: '获取大纲树结构' },
      { action: 'outline_link_entity', description: '关联实体', params: ['nodeId', 'entityId'] },
      { action: 'outline_export_outline', description: '导出大纲', params: ['format'] },
    ],
  },
  {
    pluginId: 'notebook',
    pluginName: '笔记本',
    entityTypes: ['notebook_note'],
    agentSkills: ['notebook-curator'],
    capabilities: [
      { action: 'notebook_create_note', description: '创建笔记', params: ['content', 'noteType', 'folderId'] },
      { action: 'notebook_update_note', description: '更新笔记', params: ['noteId', 'content', 'tags'] },
      { action: 'notebook_list_notes', description: '列出笔记', params: ['folderId', 'keyword'] },
      { action: 'notebook_execute_code', description: '执行代码单元格', params: ['noteId', 'code'] },
      { action: 'notebook_create_backlink', description: '创建双向链接', params: ['sourceId', 'targetId'] },
      { action: 'notebook_export_note', description: '导出笔记', params: ['noteId', 'format'] },
    ],
  },
  {
    pluginId: 'tactical-board',
    pluginName: '战术面板',
    entityTypes: ['tactical_unit', 'tactical_deployment'],
    agentSkills: ['tactical-planner'],
    capabilities: [
      { action: 'tactical_deploy_unit', description: '部署单位', params: ['unitId', 'position', 'formation'] },
      { action: 'tactical_move_unit', description: '移动单位', params: ['unitId', 'newPosition'] },
      { action: 'tactical_get_battle_state', description: '获取战场状态' },
      { action: 'tactical_simulate_turn', description: '模拟一回合', params: ['actions'] },
      { action: 'tactical_export_battle_log', description: '导出战斗日志', params: ['format'] },
    ],
  },
  {
    pluginId: 'magic',
    pluginName: '魔法技能树',
    entityTypes: ['magic_skill'],
    agentSkills: ['magic-system-designer'],
    capabilities: [
      { action: 'magic_create_skill_node', description: '创建技能节点', params: ['name', 'parentId', 'cost'] },
      { action: 'magic_update_skill_node', description: '更新技能节点', params: ['nodeId', 'changes'] },
      { action: 'magic_get_skill_tree', description: '获取技能树结构' },
      { action: 'magic_validate_tree', description: '验证技能树平衡性' },
      { action: 'magic_export_skill_tree', description: '导出技能树', params: ['format'] },
    ],
  },
  {
    pluginId: 'module-builder',
    pluginName: '模块构建器',
    entityTypes: ['custom_module'],
    agentSkills: ['module-builder', 'retrofit-architect'],
    capabilities: [
      { action: 'module_builder_add_component', description: '向模块添加UI组件', params: ['moduleId', 'componentType', 'config'] },
      { action: 'module_builder_remove_component', description: '从模块移除组件', params: ['moduleId', 'componentId'] },
      { action: 'module_builder_update_config', description: '更新组件配置', params: ['moduleId', 'componentId', 'config'] },
      { action: 'module_builder_suggest_layout', description: '建议布局方案', params: ['moduleId', 'purpose'] },
    ],
  },
]

// 模块加载时自动将所有内置插件能力注册到注册中心
WORLD_SMITH_PLUGIN_CAPABILITIES.forEach(cap => registerPluginCapability(cap))
