import type { ToolDefinition } from '../bridge-types'
import { emitEntityCard } from './a2ui-helpers'
import { indexEntity } from '../embedding/index'

function emitPluginEvent(pluginId: string, action: string, payload: unknown): string {
  try {
    const detail = { pluginId, action, payload, timestamp: Date.now() }
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('worldsmith:agent:plugin-action', { detail }))
    }
    return JSON.stringify({ ok: true, pluginId, action, dispatched: true })
  } catch (e) {
    return JSON.stringify({ ok: false, error: String(e) })
  }
}

function emitPluginQuery(pluginId: string, query: string, params?: unknown): string {
  try {
    const detail = { pluginId, query, params, timestamp: Date.now() }
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('worldsmith:agent:plugin-query', { detail }))
    }
    return JSON.stringify({ ok: true, pluginId, query, dispatched: true, note: '需要通过UI状态读取查询结果' })
  } catch (e) {
    return JSON.stringify({ ok: false, error: String(e) })
  }
}

/**
 * 插件后端工具集
 *
 * 通过 window CustomEvent 机制与前端插件通信，提供：
 * - 时间线插件: 创建/更新/排序/冲突检测/导出事件
 * - 图谱插件: 节点/边管理、路径查找、聚类分析、快照导出
 * - 思维导图插件: 节点 CRUD、结构查询、自动布局、图片导出
 *
 * 所有操作通过 window.dispatchEvent 通知前端插件，
 * 插件处理后通过 UI 状态更新返回结果。
 */

// ============================================================
// Timeline Tools
// ============================================================

export const timelineCreateEventTool: ToolDefinition = {
  name: 'timeline_create_event',
  description: '创建时间线事件',
  parameters: {
    name: { type: 'string', description: '事件名称', required: true },
    date: { type: 'string', description: '事件日期（如 1200-01-15 或 第三纪元1420年）' },
    dateEnd: { type: 'string', description: '结束日期（持续事件）' },
    description: { type: 'string', description: '事件描述' },
    era: { type: 'string', description: '所属年代' },
    importance: { type: 'string', description: '重要性: 普通/重要/关键/细微' },
    status: { type: 'string', description: '状态: 正史/传闻/传说' },
    location: { type: 'string', description: '发生地点' },
    parentId: { type: 'string', description: '父级事件名称' },
    tags: { type: 'array', description: '标签列表' },
  },
  execute: async (args, ctx) => {
    const entityName = String(args.name)
    const entities = await ctx.stores.entity.getAllEntities()
    const duplicate = entities.some((e: any) => e.type === 'event' && e.name === entityName)
    if (duplicate) {
      return JSON.stringify({ error: `已存在同名事件 "${entityName}"`, hint: '请使用不同名称或先用 timeline_get_events 查看' })
    }
    const entity = {
      id: crypto.randomUUID(),
      type: 'event',
      name: entityName,
      description: String(args.description || ''),
      properties: {
        date: args.date || '',
        dateEnd: args.dateEnd || '',
        era: args.era || '',
        importance: args.importance || '普通',
        status: args.status || '正史',
        location: args.location || '',
        parentId: args.parentId || '',
      },
      tags: Array.isArray(args.tags) ? args.tags : [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const id = await ctx.stores.entity.add(entity, 'agent')
    emitEntityCard(ctx, { ...entity, id })
    indexEntity({ ...entity, id }).catch(() => {})
    emitPluginEvent('timeline', 'create_event', { ...args, id })
    return JSON.stringify({ success: true, id, name: entity.name })
  },
}

export const timelineUpdateEventTool: ToolDefinition = {
  name: 'timeline_update_event',
  description: '更新时间线事件',
  parameters: {
    eventId: { type: 'string', description: '事件ID', required: true },
    changes: { type: 'object', description: '要修改的字段 { name?, date?, dateEnd?, description?, era?, importance?, status?, location?, parentId? }', required: true },
  },
  execute: async (args, ctx) => {
    const entityId = String(args.eventId)
    const existing = await ctx.stores.entity.getById(entityId)
    if (!existing) return JSON.stringify({ error: `事件 ${entityId} 不存在`, hint: '请使用 timeline_get_events 查看现有事件' })
    const changes = (args.changes || {}) as Record<string, unknown>
    const updates: Record<string, unknown> = {}
    if (changes.name) updates.name = String(changes.name)
    if (changes.description) updates.description = String(changes.description)
    const newProps = { ...(existing.properties || {}) }
    if (changes.date !== undefined) newProps.date = changes.date
    if (changes.dateEnd !== undefined) newProps.dateEnd = changes.dateEnd
    if (changes.era !== undefined) newProps.era = changes.era
    if (changes.importance !== undefined) newProps.importance = changes.importance
    if (changes.status !== undefined) newProps.status = changes.status
    if (changes.location !== undefined) newProps.location = changes.location
    if (changes.parentId !== undefined) newProps.parentId = changes.parentId
    updates.properties = newProps
    await ctx.stores.entity.update(entityId, updates, 'agent')
    const updated = await ctx.stores.entity.getById(entityId)
    if (updated) {
      emitEntityCard(ctx, updated)
      indexEntity(updated).catch(() => {})
    }
    emitPluginEvent('timeline', 'update_event', args)
    return JSON.stringify({ success: true, id: entityId })
  },
}

export const timelineSortEventsTool: ToolDefinition = {
  name: 'timeline_sort_events',
  description: '按时间排序所有事件',
  parameters: {
    method: { type: 'string', description: '排序方式: chronological(时间顺序) / reverse(倒序)' },
  },
  execute: async (args, _ctx) => {
    return emitPluginEvent('timeline', 'sort_events', args)
  },
}

export const timelineDetectConflictsTool: ToolDefinition = {
  name: 'timeline_detect_conflicts',
  description: '检测时间线中的时间冲突',
  parameters: {
    threshold: { type: 'number', description: '冲突检测的时间阈值（天），默认30' },
  },
  execute: async (args, ctx) => {
    const entities = await ctx.stores.entity.getAllEntities()
    const events = entities.filter((e: any) => e.type === 'event' && e.properties?.date)
    const threshold = Number(args.threshold) || 30
    const conflicts: Array<{ event1: string; event2: string; daysApart: number }> = []
    const parsedDates: Array<{ id: string; name: string; dateStr: string; time: number }> = []
    for (const e of events) {
      const dateStr = String(e.properties?.date || '')
      const time = new Date(dateStr).getTime()
      if (!isNaN(time)) {
        parsedDates.push({ id: e.id, name: e.name, dateStr, time })
      }
    }
    parsedDates.sort((a, b) => a.time - b.time)
    for (let i = 0; i < parsedDates.length; i++) {
      for (let j = i + 1; j < parsedDates.length; j++) {
        const daysApart = Math.abs(parsedDates[j].time - parsedDates[i].time) / (86400000)
        if (daysApart <= threshold && daysApart > 0) {
          conflicts.push({ event1: parsedDates[i].name, event2: parsedDates[j].name, daysApart: Math.round(daysApart) })
        }
      }
    }
    return JSON.stringify({ total: conflicts.length, threshold, conflicts })
  },
}

export const timelineGetEventsTool: ToolDefinition = {
  name: 'timeline_get_events',
  description: '获取时间线事件列表',
  parameters: {
    era: { type: 'string', description: '按年代过滤' },
    keyword: { type: 'string', description: '按关键词搜索' },
    importance: { type: 'string', description: '按重要性过滤: 普通/重要/关键/细微' },
    limit: { type: 'number', description: '返回数量上限，默认20' },
  },
  execute: async (args, ctx) => {
    let entities = await ctx.stores.entity.getAllEntities()
    let events = entities.filter((e: any) => e.type === 'event')
    if (args.era) {
      const eraVal = String(args.era)
      events = events.filter((e: any) => e.properties?.era === eraVal)
    }
    if (args.importance) {
      const impVal = String(args.importance)
      events = events.filter((e: any) => e.properties?.importance === impVal)
    }
    if (args.keyword) {
      const kw = String(args.keyword).toLowerCase()
      events = events.filter((e: any) =>
        e.name.toLowerCase().includes(kw) ||
        (e.description || '').toLowerCase().includes(kw)
      )
    }
    const limit = Number(args.limit) || 20
    const results = events.slice(0, limit).map((e: any) => ({
      id: e.id,
      name: e.name,
      description: e.description || '',
      date: e.properties?.date || '',
      dateEnd: e.properties?.dateEnd || '',
      era: e.properties?.era || '',
      importance: e.properties?.importance || '',
      status: e.properties?.status || '',
      location: e.properties?.location || '',
    }))
    return JSON.stringify({ total: events.length, showing: results.length, events: results })
  },
}

export const timelineExportTool: ToolDefinition = {
  name: 'timeline_export_timeline',
  description: '导出时间线数据',
  parameters: {
    format: { type: 'string', description: '导出格式: json / csv / mermaid' },
  },
  execute: async (args, _ctx) => {
    return emitPluginEvent('timeline', 'export', args)
  },
}

export const TIMELINE_BACKEND_TOOLS: ToolDefinition[] = [
  timelineCreateEventTool,
  timelineUpdateEventTool,
  timelineSortEventsTool,
  timelineDetectConflictsTool,
  timelineGetEventsTool,
  timelineExportTool,
]

// ============================================================
// Graph Tools
// ============================================================

export const graphGetNodesTool: ToolDefinition = {
  name: 'graph_get_nodes',
  description: '获取关系图谱中的节点',
  parameters: {
    type: { type: 'string', description: '实体类型过滤' },
    keyword: { type: 'string', description: '关键词搜索' },
  },
  execute: async (args, _ctx) => {
    return emitPluginQuery('graph', 'get_nodes', args)
  },
}

export const graphGetEdgesTool: ToolDefinition = {
  name: 'graph_get_edges',
  description: '获取关系图谱中的边',
  parameters: {
    sourceId: { type: 'string', description: '源节点ID' },
    targetId: { type: 'string', description: '目标节点ID' },
    type: { type: 'string', description: '关系类型过滤' },
  },
  execute: async (args, _ctx) => {
    return emitPluginQuery('graph', 'get_edges', args)
  },
}

export const graphFindPathTool: ToolDefinition = {
  name: 'graph_find_path',
  description: '查找两个节点之间的最短路径',
  parameters: {
    sourceId: { type: 'string', description: '起始节点ID', required: true },
    targetId: { type: 'string', description: '目标节点ID', required: true },
  },
  execute: async (args, _ctx) => {
    return emitPluginQuery('graph', 'find_path', args)
  },
}

export const graphClusterAnalysisTool: ToolDefinition = {
  name: 'graph_cluster_analysis',
  description: '对关系网络执行聚类分析',
  parameters: {
    method: { type: 'string', description: '聚类算法: louvain / label_propagation / k_means' },
  },
  execute: async (args, _ctx) => {
    return emitPluginQuery('graph', 'cluster_analysis', args)
  },
}

export const graphHighlightNodesTool: ToolDefinition = {
  name: 'graph_highlight_nodes',
  description: '高亮显示指定节点',
  parameters: {
    nodeIds: { type: 'array', description: '要高亮的节点ID列表', required: true },
  },
  execute: async (args, _ctx) => {
    return emitPluginEvent('graph', 'highlight_nodes', args)
  },
}

export const graphExportSnapshotTool: ToolDefinition = {
  name: 'graph_export_snapshot',
  description: '导出图谱当前视图为快照',
  parameters: {
    format: { type: 'string', description: '导出格式: png / svg / json' },
  },
  execute: async (args, _ctx) => {
    return emitPluginEvent('graph', 'export_snapshot', args)
  },
}

export const GRAPH_BACKEND_TOOLS: ToolDefinition[] = [
  graphGetNodesTool,
  graphGetEdgesTool,
  graphFindPathTool,
  graphClusterAnalysisTool,
  graphHighlightNodesTool,
  graphExportSnapshotTool,
]

// ============================================================
// Mindmap Tools
// ============================================================

export const mindmapCreateNodeTool: ToolDefinition = {
  name: 'mindmap_create_node',
  description: '在思维导图中创建节点',
  parameters: {
    parentId: { type: 'string', description: '父节点ID（根节点则为root）', required: true },
    label: { type: 'string', description: '节点标签', required: true },
    style: { type: 'object', description: '节点样式配置' },
  },
  execute: async (args, _ctx) => {
    return emitPluginEvent('mindmap', 'create_node', args)
  },
}

export const mindmapUpdateNodeTool: ToolDefinition = {
  name: 'mindmap_update_node',
  description: '更新思维导图节点',
  parameters: {
    nodeId: { type: 'string', description: '节点ID', required: true },
    changes: { type: 'object', description: '要修改的字段 { label?, style?, collapsed? }', required: true },
  },
  execute: async (args, _ctx) => {
    return emitPluginEvent('mindmap', 'update_node', args)
  },
}

export const mindmapDeleteNodeTool: ToolDefinition = {
  name: 'mindmap_delete_node',
  description: '删除思维导图节点',
  parameters: {
    nodeId: { type: 'string', description: '要删除的节点ID', required: true },
  },
  execute: async (args, _ctx) => {
    return emitPluginEvent('mindmap', 'delete_node', args)
  },
}

export const mindmapGetStructureTool: ToolDefinition = {
  name: 'mindmap_get_structure',
  description: '获取思维导图完整树结构',
  parameters: {},
  execute: async (_args, _ctx) => {
    return emitPluginQuery('mindmap', 'get_structure')
  },
}

export const mindmapAutoLayoutTool: ToolDefinition = {
  name: 'mindmap_auto_layout',
  description: '自动布局思维导图',
  parameters: {
    algorithm: { type: 'string', description: '布局算法: tree / radial / fishbone' },
  },
  execute: async (args, _ctx) => {
    return emitPluginEvent('mindmap', 'auto_layout', args)
  },
}

export const mindmapExportImageTool: ToolDefinition = {
  name: 'mindmap_export_image',
  description: '导出思维导图为图片',
  parameters: {
    format: { type: 'string', description: '格式: png / svg' },
  },
  execute: async (args, _ctx) => {
    return emitPluginEvent('mindmap', 'export_image', args)
  },
}

export const MINDMAP_BACKEND_TOOLS: ToolDefinition[] = [
  mindmapCreateNodeTool,
  mindmapUpdateNodeTool,
  mindmapDeleteNodeTool,
  mindmapGetStructureTool,
  mindmapAutoLayoutTool,
  mindmapExportImageTool,
]

// ============================================================
// Manuscript Tools
// ============================================================

export const manuscriptCreateChapterTool: ToolDefinition = {
  name: 'manuscript_create_chapter',
  description: '创建新章节',
  parameters: {
    title: { type: 'string', description: '章节标题', required: true },
    content: { type: 'string', description: '初始正文内容' },
    volumeName: { type: 'string', description: '所属卷名' },
    status: { type: 'string', description: '状态: draft / writing / review / done' },
  },
  execute: async (args, _ctx) => {
    return emitPluginEvent('manuscript', 'create_chapter', args)
  },
}

export const manuscriptUpdateChapterTool: ToolDefinition = {
  name: 'manuscript_update_chapter',
  description: '更新章节内容或状态',
  parameters: {
    chapterId: { type: 'string', description: '章节ID', required: true },
    content: { type: 'string', description: '新正文内容' },
    status: { type: 'string', description: '状态变更' },
  },
  execute: async (args, _ctx) => {
    return emitPluginEvent('manuscript', 'update_chapter', args)
  },
}

export const manuscriptListChaptersTool: ToolDefinition = {
  name: 'manuscript_list_chapters',
  description: '列出所有章节',
  parameters: {
    volumeName: { type: 'string', description: '按卷名过滤' },
  },
  execute: async (args, _ctx) => {
    return emitPluginQuery('manuscript', 'list_chapters', args)
  },
}

export const manuscriptGetChapterContentTool: ToolDefinition = {
  name: 'manuscript_get_chapter_content',
  description: '获取章节的完整内容',
  parameters: {
    chapterId: { type: 'string', description: '章节ID', required: true },
  },
  execute: async (args, _ctx) => {
    return emitPluginQuery('manuscript', 'get_chapter_content', args)
  },
}

export const manuscriptInsertMentionTool: ToolDefinition = {
  name: 'manuscript_insert_mention',
  description: '在章节中插入实体引用',
  parameters: {
    chapterId: { type: 'string', description: '章节ID', required: true },
    entityId: { type: 'string', description: '要引用的实体ID', required: true },
    position: { type: 'number', description: '插入位置（字符偏移）' },
  },
  execute: async (args, _ctx) => {
    return emitPluginEvent('manuscript', 'insert_mention', args)
  },
}

export const manuscriptExportDocumentTool: ToolDefinition = {
  name: 'manuscript_export_document',
  description: '导出正文文档',
  parameters: {
    format: { type: 'string', description: '导出格式: html / pdf / markdown / docx' },
    chapters: { type: 'array', description: '指定导出的章节ID列表' },
  },
  execute: async (args, _ctx) => {
    return emitPluginEvent('manuscript', 'export_document', args)
  },
}

export const MANUSCRIPT_BACKEND_TOOLS: ToolDefinition[] = [
  manuscriptCreateChapterTool,
  manuscriptUpdateChapterTool,
  manuscriptListChaptersTool,
  manuscriptGetChapterContentTool,
  manuscriptInsertMentionTool,
  manuscriptExportDocumentTool,
]

// ============================================================
// Outline Tools
// ============================================================

export const outlineCreateNodeTool: ToolDefinition = {
  name: 'outline_create_node',
  description: '创建大纲节点',
  parameters: {
    title: { type: 'string', description: '节点标题', required: true },
    parentId: { type: 'string', description: '父节点ID（根节点为root）' },
    type: { type: 'string', description: '节点类型: act / sequence / scene / beat' },
  },
  execute: async (args, _ctx) => {
    return emitPluginEvent('outline', 'create_node', args)
  },
}

export const outlineUpdateNodeTool: ToolDefinition = {
  name: 'outline_update_node',
  description: '更新大纲节点',
  parameters: {
    nodeId: { type: 'string', description: '节点ID', required: true },
    changes: { type: 'object', description: '要修改的字段 { title?, type?, description?, status? }', required: true },
  },
  execute: async (args, _ctx) => {
    return emitPluginEvent('outline', 'update_node', args)
  },
}

export const outlineMoveNodeTool: ToolDefinition = {
  name: 'outline_move_node',
  description: '移动大纲节点',
  parameters: {
    nodeId: { type: 'string', description: '节点ID', required: true },
    newParentId: { type: 'string', description: '新父节点ID' },
    position: { type: 'number', description: '在新父节点中的位置索引' },
  },
  execute: async (args, _ctx) => {
    return emitPluginEvent('outline', 'move_node', args)
  },
}

export const outlineGetStructureTool: ToolDefinition = {
  name: 'outline_get_structure',
  description: '获取大纲完整树结构',
  parameters: {},
  execute: async (_args, _ctx) => {
    return emitPluginQuery('outline', 'get_structure')
  },
}

export const outlineLinkEntityTool: ToolDefinition = {
  name: 'outline_link_entity',
  description: '关联实体到大纲节点',
  parameters: {
    nodeId: { type: 'string', description: '大纲节点ID', required: true },
    entityId: { type: 'string', description: '实体ID', required: true },
  },
  execute: async (args, _ctx) => {
    return emitPluginEvent('outline', 'link_entity', args)
  },
}

export const outlineExportOutlineTool: ToolDefinition = {
  name: 'outline_export_outline',
  description: '导出大纲',
  parameters: {
    format: { type: 'string', description: '导出格式: text / json / markdown' },
  },
  execute: async (args, _ctx) => {
    return emitPluginEvent('outline', 'export', args)
  },
}

export const OUTLINE_BACKEND_TOOLS: ToolDefinition[] = [
  outlineCreateNodeTool,
  outlineUpdateNodeTool,
  outlineMoveNodeTool,
  outlineGetStructureTool,
  outlineLinkEntityTool,
  outlineExportOutlineTool,
]

// ============================================================
// Notebook Tools
// ============================================================

export const notebookCreateNoteTool: ToolDefinition = {
  name: 'notebook_create_note',
  description: '创建笔记',
  parameters: {
    content: { type: 'string', description: '笔记内容（Markdown格式）', required: true },
    noteType: { type: 'string', description: '类型: log / research / diagnosis / code' },
    folderId: { type: 'string', description: '文件夹ID' },
    tags: { type: 'array', description: '标签列表' },
  },
  execute: async (args, _ctx) => {
    return emitPluginEvent('notebook', 'create_note', args)
  },
}

export const notebookUpdateNoteTool: ToolDefinition = {
  name: 'notebook_update_note',
  description: '更新笔记',
  parameters: {
    noteId: { type: 'string', description: '笔记ID', required: true },
    content: { type: 'string', description: '新内容' },
    tags: { type: 'array', description: '更新标签' },
  },
  execute: async (args, _ctx) => {
    return emitPluginEvent('notebook', 'update_note', args)
  },
}

export const notebookListNotesTool: ToolDefinition = {
  name: 'notebook_list_notes',
  description: '列出笔记',
  parameters: {
    folderId: { type: 'string', description: '按文件夹过滤' },
    keyword: { type: 'string', description: '按关键词搜索' },
  },
  execute: async (args, _ctx) => {
    return emitPluginQuery('notebook', 'list_notes', args)
  },
}

export const notebookExecuteCodeTool: ToolDefinition = {
  name: 'notebook_execute_code',
  description: '在笔记中执行代码',
  parameters: {
    noteId: { type: 'string', description: '笔记ID', required: true },
    code: { type: 'string', description: '代码内容', required: true },
  },
  execute: async (args, _ctx) => {
    return emitPluginEvent('notebook', 'execute_code', args)
  },
}

export const notebookCreateBacklinkTool: ToolDefinition = {
  name: 'notebook_create_backlink',
  description: '创建笔记间双向链接',
  parameters: {
    sourceId: { type: 'string', description: '源笔记ID', required: true },
    targetId: { type: 'string', description: '目标笔记ID', required: true },
  },
  execute: async (args, _ctx) => {
    return emitPluginEvent('notebook', 'create_backlink', args)
  },
}

export const notebookExportNoteTool: ToolDefinition = {
  name: 'notebook_export_note',
  description: '导出笔记',
  parameters: {
    noteId: { type: 'string', description: '笔记ID', required: true },
    format: { type: 'string', description: '导出格式: markdown / html / pdf' },
  },
  execute: async (args, _ctx) => {
    return emitPluginEvent('notebook', 'export_note', args)
  },
}

export const NOTEBOOK_BACKEND_TOOLS: ToolDefinition[] = [
  notebookCreateNoteTool,
  notebookUpdateNoteTool,
  notebookListNotesTool,
  notebookExecuteCodeTool,
  notebookCreateBacklinkTool,
  notebookExportNoteTool,
]

// ============================================================
// Tactical Tools
// ============================================================

export const tacticalDeployUnitTool: ToolDefinition = {
  name: 'tactical_deploy_unit',
  description: '在战术面板上部署单位',
  parameters: {
    unitId: { type: 'string', description: '单位ID', required: true },
    position: { type: 'object', description: '坐标 { x: number, y: number }', required: true },
    formation: { type: 'string', description: '编队/阵型名称' },
  },
  execute: async (args, _ctx) => {
    return emitPluginEvent('tactical-board', 'deploy_unit', args)
  },
}

export const tacticalMoveUnitTool: ToolDefinition = {
  name: 'tactical_move_unit',
  description: '移动战斗单位',
  parameters: {
    unitId: { type: 'string', description: '单位ID', required: true },
    newPosition: { type: 'object', description: '新坐标 { x: number, y: number }', required: true },
  },
  execute: async (args, _ctx) => {
    return emitPluginEvent('tactical-board', 'move_unit', args)
  },
}

export const tacticalGetBattleStateTool: ToolDefinition = {
  name: 'tactical_get_battle_state',
  description: '获取当前战场状态（全部单位和部署）',
  parameters: {},
  execute: async (_args, _ctx) => {
    return emitPluginQuery('tactical-board', 'get_battle_state')
  },
}

export const tacticalSimulateTurnTool: ToolDefinition = {
  name: 'tactical_simulate_turn',
  description: '模拟一回合战斗',
  parameters: {
    actions: { type: 'array', description: '行动列表 [{ unitId, action, target?, ... }]' },
  },
  execute: async (args, _ctx) => {
    return emitPluginEvent('tactical-board', 'simulate_turn', args)
  },
}

export const tacticalExportBattleLogTool: ToolDefinition = {
  name: 'tactical_export_battle_log',
  description: '导出战斗日志',
  parameters: {
    format: { type: 'string', description: '导出格式: json / markdown / html' },
  },
  execute: async (args, _ctx) => {
    return emitPluginEvent('tactical-board', 'export_battle_log', args)
  },
}

export const TACTICAL_BACKEND_TOOLS: ToolDefinition[] = [
  tacticalDeployUnitTool,
  tacticalMoveUnitTool,
  tacticalGetBattleStateTool,
  tacticalSimulateTurnTool,
  tacticalExportBattleLogTool,
]

// ============================================================
// Magic Tools
// ============================================================

export const magicCreateSkillNodeTool: ToolDefinition = {
  name: 'magic_create_skill_node',
  description: '在魔法技能树中创建节点',
  parameters: {
    name: { type: 'string', description: '技能名称', required: true },
    parentId: { type: 'string', description: '父节点ID（root表示根技能）' },
    cost: { type: 'number', description: '技能点花费' },
    description: { type: 'string', description: '技能描述' },
    effects: { type: 'object', description: '技能效果配置' },
  },
  execute: async (args, _ctx) => {
    return emitPluginEvent('magic', 'create_skill_node', args)
  },
}

export const magicUpdateSkillNodeTool: ToolDefinition = {
  name: 'magic_update_skill_node',
  description: '更新技能树节点',
  parameters: {
    nodeId: { type: 'string', description: '节点ID', required: true },
    changes: { type: 'object', description: '要修改的字段 { name?, cost?, description?, effects? }', required: true },
  },
  execute: async (args, _ctx) => {
    return emitPluginEvent('magic', 'update_skill_node', args)
  },
}

export const magicGetSkillTreeTool: ToolDefinition = {
  name: 'magic_get_skill_tree',
  description: '获取完整技能树结构',
  parameters: {},
  execute: async (_args, _ctx) => {
    return emitPluginQuery('magic', 'get_skill_tree')
  },
}

export const magicValidateTreeTool: ToolDefinition = {
  name: 'magic_validate_tree',
  description: '验证技能树平衡性',
  parameters: {},
  execute: async (_args, _ctx) => {
    return emitPluginQuery('magic', 'validate_tree')
  },
}

export const magicExportSkillTreeTool: ToolDefinition = {
  name: 'magic_export_skill_tree',
  description: '导出技能树',
  parameters: {
    format: { type: 'string', description: '导出格式: json / png / svg' },
  },
  execute: async (args, _ctx) => {
    return emitPluginEvent('magic', 'export_skill_tree', args)
  },
}

export const MAGIC_BACKEND_TOOLS: ToolDefinition[] = [
  magicCreateSkillNodeTool,
  magicUpdateSkillNodeTool,
  magicGetSkillTreeTool,
  magicValidateTreeTool,
  magicExportSkillTreeTool,
]

// ============================================================
// Unified Export
// ============================================================

export const PLUGIN_BACKEND_TOOLS: ToolDefinition[] = [
  ...TIMELINE_BACKEND_TOOLS,
  ...GRAPH_BACKEND_TOOLS,
  ...MINDMAP_BACKEND_TOOLS,
  ...MANUSCRIPT_BACKEND_TOOLS,
  ...OUTLINE_BACKEND_TOOLS,
  ...NOTEBOOK_BACKEND_TOOLS,
  ...TACTICAL_BACKEND_TOOLS,
  ...MAGIC_BACKEND_TOOLS,
]