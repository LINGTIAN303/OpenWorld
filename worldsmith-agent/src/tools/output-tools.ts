/**
 * 输出块工具集
 *
 * 提供 12 个交互式输出工具，用于在聊天消息中渲染 UI 组件，
 * 替代传统的 Markdown 表格/代码块/编号列表等方式。
 *
 * 工具列表:
 *   output_table     — 表格数据
 *   output_choice    — 单选/多选（点击自动回传）
 *   output_code      — 语法高亮代码块
 *   output_entity_card — 实体信息卡片
 *   output_alert     — info/success/warning/error 提示
 *   output_stat      — 统计指标卡片
 *   output_list      — 带图标的项目列表
 *   output_progress  — 进度条
 *   output_comparison — 双栏对比视图
 *   output_timeline  — 时间线
 *   output_image     — 图片展示
 *   output_accordion — 可折叠内容区
 *
 * 每个工具通过 ctx.appendBlock() 将组件数据追加到当前消息，
 * 由前端 Block 渲染器按 type 分发到对应的 Vue 组件。
 */

import type { ToolDefinition } from '../bridge-types'
import type { TableBlock, ChoiceBlock, CodeBlockData, EntityCardBlock, AlertBlock, StatBlock, ListBlock, ProgressBlock, ComparisonBlock, TimelineBlock, ImageBlock, AccordionBlock } from '../bridge-types'

/** 全局 Block ID 计数器，确保每个 block 的 ID 全局唯一 */
let blockCounter = 0

/** 生成下一个 Block ID，格式: {prefix}-{timestamp36}-{counter} */
function nextId(prefix: string): string {
  blockCounter++
  return `${prefix}-${Date.now().toString(36)}-${blockCounter}`
}

/**
 * output_table — 展示表格数据
 * columns 和 rows 参数接受 JSON 字符串或已解析数组
 */
export const outputTable: ToolDefinition = {
  name: 'output_table',
  description: '向用户展示结构化表格数据，渲染为可折叠的交互组件。当你需要展示数据对比、列表、属性等信息时，必须调用此工具而非使用 Markdown 表格。',
  parameters: {
    title: { type: 'string', description: '表格标题', required: false },
    columns: { type: 'string', description: '列定义的 JSON 数组字符串。每项包含 key(字段名)、label(显示名)、align(对齐方式，可选 left/center/right)。示例: [{"key":"name","label":"名称"},{"key":"value","label":"数值","align":"right"}]', required: true },
    rows: { type: 'string', description: '行数据的 JSON 数组字符串。每项是一个对象，key 与 columns 的 key 对应。示例: [{"name":"攻击力","value":85},{"name":"防御力","value":60}]', required: true },
  },
  execute: async (args, ctx) => {
    let columns: TableBlock['columns']
    let rows: TableBlock['rows']

    try {
      columns = typeof args.columns === 'string' ? JSON.parse(args.columns) : args.columns as TableBlock['columns']
    } catch { return '错误：columns 参数必须是有效的 JSON 数组' }
    try {
      rows = typeof args.rows === 'string' ? JSON.parse(args.rows) : args.rows as TableBlock['rows']
    } catch { return '错误：rows 参数必须是有效的 JSON 数组' }

    if (!Array.isArray(columns) || columns.length === 0) return '错误：columns 必须是非空数组'
    if (!Array.isArray(rows)) return '错误：rows 必须是数组'

    const blockId = nextId('tbl')
    const block: TableBlock = {
      type: 'table', id: blockId,
      title: args.title ? String(args.title) : undefined,
      columns, rows,
      collapsible: true,
    }
    ctx.appendBlock?.(block)
    return `已创建表格组件"${block.title || '数据'}"(${block.rows.length}行×${block.columns.length}列)，组件会自动显示在消息中。无需在文本中重复表格内容。`
  },
}

/**
 * output_choice — 让用户做选择
 * 用户点击选项后自动回传选择结果给 Agent
 */
export const outputChoice: ToolDefinition = {
  name: 'output_choice',
  description: '向用户展示选项，用户点击后自动回传选择结果给 Agent。当你需要让用户做选择时，必须调用此工具而非用编号列表让用户手动输入。',
  parameters: {
    title: { type: 'string', description: '选择提示标题', required: false },
    mode: { type: 'string', description: 'single(单选) 或 multi(多选)', required: false, enum: ['single', 'multi'] },
    options: { type: 'string', description: '选项的 JSON 数组字符串。每项包含 value(选项值)、label(显示文本)、description(描述，可选)。示例: [{"value":"attack","label":"攻击","description":"对目标造成伤害"},{"value":"defend","label":"防御","description":"减少受到的伤害"}]', required: true },
  },
  execute: async (args, ctx) => {
    let options: ChoiceBlock['options']
    try {
      options = typeof args.options === 'string' ? JSON.parse(args.options) : args.options as ChoiceBlock['options']
    } catch { return '错误：options 参数必须是有效的 JSON 数组' }

    if (!Array.isArray(options) || options.length === 0) return '错误：options 必须是非空数组'

    const blockId = nextId('ch')
    const block: ChoiceBlock = {
      type: 'choice', id: blockId,
      title: args.title ? String(args.title) : undefined,
      mode: (args.mode === 'multi' ? 'multi' : 'single') as ChoiceBlock['mode'],
      options, collapsible: false,
    }
    ctx.appendBlock?.(block)
    return `已创建选择组件"${block.title || '请选择'}"(${block.options.length}个选项)，用户点击后自动回传选择结果。`
  },
}

/** output_code — 展示语法高亮代码块 */
export const outputCode: ToolDefinition = {
  name: 'output_code',
  description: '向用户展示代码，带语法高亮和可选运行按钮。替代 Markdown 代码块，提供更好的展示效果。',
  parameters: {
    language: { type: 'string', description: '编程语言，如 typescript、python、json', required: true },
    code: { type: 'string', description: '代码内容', required: true },
    runnable: { type: 'boolean', description: '是否显示运行按钮（默认 false）', required: false },
  },
  execute: async (args, ctx) => {
    const blockId = nextId('code')
    const block: CodeBlockData = {
      type: 'code', id: blockId,
      language: String(args.language),
      code: String(args.code),
      runnable: args.runnable === true,
      collapsible: true,
    }
    ctx.appendBlock?.(block)
    return `已创建代码组件(${block.language}, ${block.code.split('\n').length}行)，组件会自动显示在消息中。`
  },
}

/** output_entity_card — 展示实体信息卡片，需要先通过 entity_get 获取实体数据 */
export const outputEntityCard: ToolDefinition = {
  name: 'output_entity_card',
  description: '向用户展示实体信息卡片。如果实体不存在则返回错误。替代文本描述实体的方式。',
  parameters: {
    entityId: { type: 'string', description: '实体 ID', required: true },
  },
  execute: async (args, ctx) => {
    const entityId = String(args.entityId)
    const entity = await ctx.stores.entity.getById(entityId)
    if (!entity) return JSON.stringify({ ok: false, error: `实体 ${entityId} 不存在` })
    const blockId = nextId('ec')
    const block: EntityCardBlock = {
      type: 'entity-card', id: blockId,
      entityId: entity.id, entityType: entity.type, name: entity.name,
      description: entity.description, tags: entity.tags,
      properties: entity.properties, collapsible: true,
    }
    ctx.appendBlock?.(block)
    return `已创建实体卡片组件"${block.name}"(${block.entityType})，组件会自动显示在消息中。`
  },
}

/** output_alert — 展示 info/success/warning/error 级别的提示 */
export const outputAlert: ToolDefinition = {
  name: 'output_alert',
  description: '向用户展示提示信息（info/success/warning/error）。当你需要提示、警告或确认反馈时，必须调用此工具而非在文本中写⚠️等符号。',
  parameters: {
    level: { type: 'string', description: '提示级别: info(信息)、success(成功)、warning(警告)、error(错误)', required: true, enum: ['info', 'success', 'warning', 'error'] },
    title: { type: 'string', description: '提示标题', required: false },
    message: { type: 'string', description: '提示内容', required: true },
  },
  execute: async (args, ctx) => {
    const levels = ['info', 'success', 'warning', 'error']
    const level = levels.includes(args.level as string) ? args.level as AlertBlock['level'] : 'info'
    const blockId = nextId('alert')
    const block: AlertBlock = {
      type: 'alert', id: blockId, level,
      title: args.title ? String(args.title) : undefined,
      message: String(args.message), collapsible: false,
    }
    ctx.appendBlock?.(block)
    return `已创建${level}提示组件，组件会自动显示在消息中。`
  },
}

/** output_stat — 展示统计指标卡片组 */
export const outputStat: ToolDefinition = {
  name: 'output_stat',
  description: '向用户展示统计指标卡片组。当你需要展示数字概览（如"共23个角色、8个地区"）时，必须调用此工具而非用文本罗列。',
  parameters: {
    title: { type: 'string', description: '统计标题', required: false },
    items: { type: 'string', description: '统计项的 JSON 数组字符串。每项包含 label(标签)、value(数值)、icon(图标，可选)、trend(趋势 up/down/flat，可选)。示例: [{"label":"角色","value":23,"icon":"👤","trend":"up"},{"label":"地区","value":8}]', required: true },
  },
  execute: async (args, ctx) => {
    let items: StatBlock['items']
    try {
      items = typeof args.items === 'string' ? JSON.parse(args.items) : args.items as StatBlock['items']
    } catch { return '错误：items 参数必须是有效的 JSON 数组' }
    if (!Array.isArray(items) || items.length === 0) return '错误：items 必须是非空数组'
    const blockId = nextId('stat')
    const block: StatBlock = {
      type: 'stat', id: blockId,
      title: args.title ? String(args.title) : undefined,
      items, collapsible: true,
    }
    ctx.appendBlock?.(block)
    return `已创建统计组件"${block.title || '概览'}"(${block.items.length}项)，组件会自动显示在消息中。`
  },
}

/** output_list — 展示带图标的项目列表 */
export const outputList: ToolDefinition = {
  name: 'output_list',
  description: '向用户展示带图标的项目列表。当你需要展示角色列表、物品清单等轻量列表时，调用此工具。',
  parameters: {
    title: { type: 'string', description: '列表标题', required: false },
    items: { type: 'string', description: '列表项的 JSON 数组字符串。每项包含 icon(图标，可选)、label(标题)、description(描述，可选)、value(附加值，可选)。示例: [{"icon":"👤","label":"战士","description":"近战输出","value":"Lv.5"}]', required: true },
  },
  execute: async (args, ctx) => {
    let items: ListBlock['items']
    try {
      items = typeof args.items === 'string' ? JSON.parse(args.items) : args.items as ListBlock['items']
    } catch { return '错误：items 参数必须是有效的 JSON 数组' }
    if (!Array.isArray(items) || items.length === 0) return '错误：items 必须是非空数组'
    const blockId = nextId('list')
    const block: ListBlock = {
      type: 'list', id: blockId,
      title: args.title ? String(args.title) : undefined,
      items, collapsible: true,
    }
    ctx.appendBlock?.(block)
    return `已创建列表组件"${block.title || '列表'}"(${block.items.length}项)，组件会自动显示在消息中。`
  },
}

/** output_progress — 展示进度条，用于长操作反馈 */
export const outputProgress: ToolDefinition = {
  name: 'output_progress',
  description: '向用户展示进度条。当执行长操作（一致性检查、导出、批量操作）时，调用此工具展示进度。',
  parameters: {
    label: { type: 'string', description: '进度标签', required: true },
    progress: { type: 'number', description: '进度百分比 0-100', required: true },
    status: { type: 'string', description: '状态: running(进行中)、completed(已完成)、failed(失败)', required: true, enum: ['running', 'completed', 'failed'] },
  },
  execute: async (args, ctx) => {
    const progress = Math.max(0, Math.min(100, Number(args.progress) || 0))
    const statuses = ['running', 'completed', 'failed']
    const status = statuses.includes(args.status as string) ? args.status as ProgressBlock['status'] : 'running'
    const blockId = nextId('prog')
    const block: ProgressBlock = {
      type: 'progress', id: blockId,
      label: String(args.label), progress, status,
      collapsible: false,
    }
    ctx.appendBlock?.(block)
    return `已创建进度组件"${block.label}"(${block.progress}%, ${block.status})，组件会自动显示在消息中。`
  },
}

/** output_comparison — 展示两个实体的双栏对比视图 */
export const outputComparison: ToolDefinition = {
  name: 'output_comparison',
  description: '向用户展示两个实体的对比视图。当你需要对比角色、地区等实体时，调用此工具。',
  parameters: {
    title: { type: 'string', description: '对比标题', required: false },
    left: { type: 'string', description: '左侧实体的 JSON 对象。包含 label(名称) 和 items(属性键值对)。示例: {"label":"战士","items":{"攻击力":"85","防御力":"60"}}', required: true },
    right: { type: 'string', description: '右侧实体的 JSON 对象。格式同 left。示例: {"label":"法师","items":{"攻击力":"40","防御力":"30"}}', required: true },
  },
  execute: async (args, ctx) => {
    let left: ComparisonBlock['left']
    let right: ComparisonBlock['right']
    try { left = typeof args.left === 'string' ? JSON.parse(args.left) : args.left as ComparisonBlock['left'] } catch { return '错误：left 参数必须是有效的 JSON 对象' }
    try { right = typeof args.right === 'string' ? JSON.parse(args.right) : args.right as ComparisonBlock['right'] } catch { return '错误：right 参数必须是有效的 JSON 对象' }
    if (!left?.label || !left?.items || !right?.label || !right?.items) return '错误：left 和 right 都必须包含 label 和 items 字段'
    const blockId = nextId('cmp')
    const block: ComparisonBlock = {
      type: 'comparison', id: blockId,
      title: args.title ? String(args.title) : undefined,
      left, right, collapsible: true,
    }
    ctx.appendBlock?.(block)
    return `已创建对比组件"${block.title || '对比'}"(${block.left.label} vs ${block.right.label})，组件会自动显示在消息中。`
  },
}

/** output_timeline — 展示时间线事件序列 */
export const outputTimeline: ToolDefinition = {
  name: 'output_timeline',
  description: '向用户展示时间线。当你需要展示事件序列、历史时间线时，调用此工具。',
  parameters: {
    title: { type: 'string', description: '时间线标题', required: false },
    events: { type: 'string', description: '事件的 JSON 数组字符串。每项包含 time(时间点)、label(事件名)、description(描述，可选)。示例: [{"time":"1000年","label":"建国","description":"阿尔王国建立"},{"time":"1050年","label":"战争","description":"与邻国爆发冲突"}]', required: true },
  },
  execute: async (args, ctx) => {
    let events: TimelineBlock['events']
    try { events = typeof args.events === 'string' ? JSON.parse(args.events) : args.events as TimelineBlock['events'] } catch { return '错误：events 参数必须是有效的 JSON 数组' }
    if (!Array.isArray(events) || events.length === 0) return '错误：events 必须是非空数组'
    const blockId = nextId('tl')
    const block: TimelineBlock = {
      type: 'timeline', id: blockId,
      title: args.title ? String(args.title) : undefined,
      events, collapsible: true,
    }
    ctx.appendBlock?.(block)
    return `已创建时间线组件"${block.title || '时间线'}"(${block.events.length}个事件)，组件会自动显示在消息中。`
  },
}

/** output_image — 展示图片（URL 或 base64） */
export const outputImage: ToolDefinition = {
  name: 'output_image',
  description: '向用户展示图片。当你需要展示图片时，调用此工具。',
  parameters: {
    src: { type: 'string', description: '图片 URL 或 base64 数据', required: true },
    alt: { type: 'string', description: '图片替代文本', required: false },
    caption: { type: 'string', description: '图片说明', required: false },
  },
  execute: async (args, ctx) => {
    if (!args.src || !String(args.src).trim()) return '错误：src 参数不能为空'
    const blockId = nextId('img')
    const block: ImageBlock = {
      type: 'image', id: blockId,
      src: String(args.src),
      alt: args.alt ? String(args.alt) : undefined,
      caption: args.caption ? String(args.caption) : undefined,
      collapsible: true,
    }
    ctx.appendBlock?.(block)
    return `已创建图片组件，组件会自动显示在消息中。`
  },
}

/** output_accordion — 展示可折叠内容区 */
export const outputAccordion: ToolDefinition = {
  name: 'output_accordion',
  description: '向用户展示可折叠的内容区。当你需要展示多个可独立展开/收起的内容段时，调用此工具。',
  parameters: {
    title: { type: 'string', description: '折叠区标题', required: false },
    sections: { type: 'string', description: '内容段的 JSON 数组字符串。每项包含 title(段标题) 和 content(段内容)。示例: [{"title":"背景","content":"这是一个古老的王国..."},{"title":"现状","content":"王国正处于内战..."}]', required: true },
  },
  execute: async (args, ctx) => {
    let sections: AccordionBlock['sections']
    try {
      sections = typeof args.sections === 'string' ? JSON.parse(args.sections) : args.sections as AccordionBlock['sections']
    } catch { return '错误：sections 参数必须是有效的 JSON 数组' }
    if (!Array.isArray(sections) || sections.length === 0) return '错误：sections 必须是非空数组'
    const blockId = nextId('acc')
    const block: AccordionBlock = {
      type: 'accordion', id: blockId,
      title: args.title ? String(args.title) : undefined,
      sections, collapsible: true,
    }
    ctx.appendBlock?.(block)
    return `已创建折叠区组件"${block.title || '详情'}"(${block.sections.length}段)，组件会自动显示在消息中。`
  },
}

/** 所有 12 个输出工具的集合 */
export const outputTools: ToolDefinition[] = [
  outputTable, outputChoice, outputCode,
  outputEntityCard, outputAlert, outputStat,
  outputList, outputProgress, outputComparison,
  outputTimeline, outputImage, outputAccordion,
]
