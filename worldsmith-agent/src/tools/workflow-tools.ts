// 工作流操作工具集（Agent Tool）
//
// Phase 4.1：所有 workflow tool 走 Tauri invoke（不再用 window.dispatchEvent + 旧 workflowEngine）。
// Phase 5：新增 2 个 node metadata tool（workflow_list_node_types / workflow_get_node_schema），
//         让 Agent 能查可用节点类型 + 单节点 configSchema。
//
// 工具列表（18 个）：
//   - workflow_list              列工作流定义
//   - workflow_get               取单个工作流定义
//   - workflow_create            创建工作流定义
//   - workflow_update            更新工作流定义
//   - workflow_delete            删除工作流定义
//   - workflow_export            导出 YAML/JSON
//   - workflow_import            从 YAML/JSON 导入
//   - workflow_dry_run           校验（不实际跑）
//   - workflow_run               启动（异步返回 run_id）
//   - workflow_run_sync          启动并等结束（调试用）
//   - workflow_status            查运行状态
//   - workflow_list_runs         列运行记录
//   - workflow_get_run           取单条 run
//   - workflow_cancel            取消运行
//   - workflow_pause/resume      暂停 / 恢复（含 agent_decision 决策喂入）
//   - workflow_list_node_types   列 14 个 builtin + 任意 plugin 节点
//   - workflow_get_node_schema   取单节点 configSchema
//
// 不在 Agent 工具面（plugin 启动时由 plugin-bridge 自动调）：
//   - workflow_register_node_type
//   - workflow_unregister_node_type
//   - workflow_node_result / chunk / heartbeat / cancel_ack（dispatch 回调）

import { invoke } from '@tauri-apps/api/core'
import type { ToolDefinition } from '../bridge-types'
// @ts-ignore — cross-project import; worldsmith-agent tsconfig rootDir=src 限制
// 在 dev 浏览器模式下使用，Tauri 模式下不调用。
// 文件：worldsmith/src/plugins/official/workflow/composables/dev-mock-store.ts
import {
  mockList as storeList,
  mockGet as storeGet,
  mockCreate as storeCreate,
  mockUpdate as storeUpdate,
  mockDelete as storeDelete,
  mockExport as storeExport,
  mockImport as storeImport,
  mockDryRun as storeDryRun,
  mockRun as storeRun,
  mockRunSync as storeRunSync,
  mockStatus as storeStatus,
  mockListRuns as storeListRuns,
  mockGetRun as storeGetRun,
  mockListNodeTypes as storeListNodeTypes,
  mockGetNodeSchema as storeGetNodeSchema,
} from '../../../src/plugins/official/workflow/composables/dev-mock-store'

// ─── Tauri 检测 + mock fallback ───

const isTauri = (): boolean => {
  if (typeof window === 'undefined') return false
  return Boolean((window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
}

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) return mockInvoke<T>(cmd, args)
  return await invoke<T>(cmd, args)
}

async function mockInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  switch (cmd) {
    case 'workflow_list':
      return storeList(
        (args?.category as string | null | undefined) ?? null,
        (args?.keyword as string | null | undefined) ?? null,
        typeof args?.limit === 'number' ? (args.limit as number) : 50,
      ) as unknown as T
    case 'workflow_get': {
      const id = String(args?.id ?? '')
      const def = storeGet(id)
      if (!def) throw new Error(`mock: workflow ${id} 不存在`)
      return def as unknown as T
    }
    case 'workflow_create': {
      const def = args?.definition as Parameters<typeof storeCreate>[0]
      return storeCreate(def) as unknown as T
    }
    case 'workflow_update': {
      const id = String(args?.id ?? '')
      const def = args?.definition as Parameters<typeof storeUpdate>[1]
      return storeUpdate(id, def) as unknown as T
    }
    case 'workflow_delete': {
      const id = String(args?.id ?? '')
      storeDelete(id)
      return undefined as unknown as T
    }
    case 'workflow_export': {
      const id = String(args?.id ?? '')
      const format = (args?.format === 'yaml' ? 'yaml' : 'json') as 'json' | 'yaml'
      return storeExport(id, format) as unknown as T
    }
    case 'workflow_import': {
      const source = String(args?.source ?? '')
      return storeImport(source) as unknown as T
    }
    case 'workflow_dry_run': {
      const id = String(args?.id ?? '')
      return storeDryRun(id) as unknown as T
    }
    case 'workflow_run': {
      const id = String(args?.id ?? '')
      const triggeredBy = String(args?.triggeredBy ?? 'agent')
      return storeRun(id, triggeredBy).runId as unknown as T
    }
    case 'workflow_run_sync': {
      const id = String(args?.id ?? '')
      const triggeredBy = String(args?.triggeredBy ?? 'agent')
      return storeRunSync(id, triggeredBy) as unknown as T
    }
    case 'workflow_pause':
    case 'workflow_resume':
    case 'workflow_cancel':
    case 'workflow_skip_to':
      return undefined as unknown as T
    case 'workflow_status':
      return storeStatus(String(args?.runId ?? '')) as unknown as T
    case 'workflow_list_runs': {
      const wid = (args?.workflowId as string | null | undefined) ?? null
      return storeListRuns(wid) as unknown as T
    }
    case 'workflow_get_run': {
      const runId = String(args?.runId ?? '')
      const run = storeGetRun(runId)
      if (!run) throw new Error(`mock: run ${runId} 不存在`)
      return run as unknown as T
    }
    case 'workflow_get_setting':
      return null as unknown as T
    case 'workflow_set_setting':
      return undefined as unknown as T
    case 'workflow_purge_runs_now':
      return 0 as unknown as T
    case 'workflow_list_node_types':
      return storeListNodeTypes() as unknown as T
    case 'workflow_get_node_schema': {
      const type_ = String(args?.type_ ?? '')
      const schema = storeGetNodeSchema(type_)
      if (!schema) throw new Error(`mock: node type ${type_} 不存在`)
      return schema as unknown as T
    }
    default:
      throw new Error(`mock: 未知命令 ${cmd}`)
  }
}

// ─── UI 通知：写操作成功后发 window 事件让 useWorkflow 同步列表 ───

/**
 * Agent 调完 CRUD 后通知同 webview 内的 UI 刷新。
 * Tauri 模式下也用（useWorkflow 通过 worldsmith:workflow-list 事件触发 refreshList）。
 * dev 浏览器模式下用 worldsmith:workflow-create / workflow-delete 让 UI 立即反映。
 */
function notifyWorkflowChanged(
  action: 'create' | 'update' | 'delete' | 'import',
  payload: Record<string, unknown>,
): void {
  if (typeof window === 'undefined') return
  // 通用刷新信号（useWorkflow.handleWorkflowList 监听到就调 refreshList）
  window.dispatchEvent(new CustomEvent('worldsmith:workflow-list', { detail: { action, ...payload } }))
  // 细分事件（create/update: useWorkflow.handleWorkflowCreate 接受 detail.definition）
  if (action === 'create' || action === 'update' || action === 'import') {
    if (payload.definition) {
      window.dispatchEvent(
        new CustomEvent('worldsmith:workflow-create', { detail: { definition: payload.definition } }),
      )
    }
  } else if (action === 'delete' && payload.id) {
    window.dispatchEvent(new CustomEvent('worldsmith:workflow-delete', { detail: { id: payload.id } }))
  }
}

// ─── 统一 ok/error 包装 ───

async function wrap<T>(fn: string, f: () => Promise<T>): Promise<string> {
  try {
    const result = await f()
    return JSON.stringify({ ok: true, [fn]: result })
  } catch (err) {
    return JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}

function parseJsonSafe<T = unknown>(s: unknown, fallback: T): T {
  if (typeof s !== 'string' || !s) return fallback
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

/** wrap() 返回的是 stringified JSON { ok, ... }；这里快速判断 ok */
function parseOk(s: string): boolean {
  return parseJsonSafe<{ ok?: boolean }>(s, { ok: false }).ok === true
}

// ─── 工具定义 ───

const workflowListTool: ToolDefinition = {
  name: 'workflow_list',
  description: '列出可用的工作流定义。可按 category / keyword 过滤。',
  parameters: {
    category: { type: 'string', description: '分类（如 dev-pipeline, content-pipeline）' },
    keyword: { type: 'string', description: '搜索关键词' },
    limit: { type: 'number', description: '最多返回条数（默认 50）' },
  },
  execute: async (args) =>
    wrap('list', () =>
      call('workflow_list', {
        category: (args.category as string) ?? null,
        keyword: (args.keyword as string) ?? null,
        limit: (args.limit as number) ?? 50,
      }),
    ),
}

const workflowGetTool: ToolDefinition = {
  name: 'workflow_get',
  description: '取单个工作流定义的完整内容。',
  parameters: {
    workflow_id: { type: 'string', description: '工作流 ID', required: true },
  },
  execute: async (args) =>
    wrap('definition', () => call('workflow_get', { id: String(args.workflow_id) })),
}

const workflowCreateTool: ToolDefinition = {
  name: 'workflow_create',
  description: '创建新的工作流定义（需要传入完整定义：name + nodes + edges）。',
  parameters: {
    definition: { type: 'string', description: '完整定义（JSON 字符串：id + name + nodes + edges）', required: true },
  },
  execute: async (args) => {
    const parsed = parseJsonSafe<Record<string, unknown>>(args.definition, {})
    if (!parsed.id || !parsed.name) {
      return JSON.stringify({ ok: false, error: 'definition 必须包含 id 和 name' })
    }
    const result = await wrap('created', () => call('workflow_create', { definition: parsed }))
    if (parseOk(result)) notifyWorkflowChanged('create', { id: String(parsed.id), definition: parsed })
    return result
  },
}

const workflowUpdateTool: ToolDefinition = {
  name: 'workflow_update',
  description: '更新工作流定义（按 id）。',
  parameters: {
    workflow_id: { type: 'string', description: '工作流 ID', required: true },
    definition: { type: 'string', description: '完整定义（JSON 字符串）', required: true },
  },
  execute: async (args) => {
    const parsed = parseJsonSafe<Record<string, unknown>>(args.definition, {})
    const result = await wrap('updated', () =>
      call('workflow_update', { id: String(args.workflow_id), definition: parsed }),
    )
    if (parseOk(result)) notifyWorkflowChanged('update', { id: String(args.workflow_id), definition: parsed })
    return result
  },
}

const workflowDeleteTool: ToolDefinition = {
  name: 'workflow_delete',
  description: '删除工作流定义。',
  parameters: {
    workflow_id: { type: 'string', description: '工作流 ID', required: true },
  },
  execute: async (args) => {
    const result = await wrap('deleted', () => call('workflow_delete', { id: String(args.workflow_id) }))
    if (parseOk(result)) notifyWorkflowChanged('delete', { id: String(args.workflow_id) })
    return result
  },
}

const workflowExportTool: ToolDefinition = {
  name: 'workflow_export',
  description: '导出工作流定义（YAML 或 JSON）。',
  parameters: {
    workflow_id: { type: 'string', description: '工作流 ID', required: true },
    format: { type: 'string', description: '格式：yaml | json（默认 yaml）' },
  },
  execute: async (args) =>
    wrap('exported', () =>
      call('workflow_export', { id: String(args.workflow_id), format: (args.format as string) || 'yaml' }),
    ),
}

const workflowImportTool: ToolDefinition = {
  name: 'workflow_import',
  description: '从 YAML/JSON 字符串导入工作流定义。',
  parameters: {
    content: { type: 'string', description: 'YAML 或 JSON 字符串', required: true },
    format: { type: 'string', description: '格式：yaml | json（默认 yaml）' },
  },
  execute: async (args) => {
    const result = await wrap('imported', () =>
      call('workflow_import', {
        source: String(args.content),
        format: (args.format as string) || null,
      }),
    )
    if (parseOk(result)) notifyWorkflowChanged('import', {})
    return result
  },
}

const workflowDryRunTool: ToolDefinition = {
  name: 'workflow_dry_run',
  description: '校验工作流定义（拓扑 / 引用 / 必填）而不实际运行。返回 errors 数组。',
  parameters: {
    workflow_id: { type: 'string', description: '工作流 ID', required: true },
  },
  execute: async (args) =>
    wrap('dryRun', () => call('workflow_dry_run', { id: String(args.workflow_id) })),
}

const workflowRunTool: ToolDefinition = {
  name: 'workflow_run',
  description: '启动一个工作流执行。立即返回 run_id；用 workflow_status 查进度。',
  parameters: {
    workflow_id: { type: 'string', description: '工作流 ID', required: true },
    params: { type: 'string', description: '入参（JSON 字符串）' },
    triggered_by: { type: 'string', description: '触发者（默认 agent）' },
  },
  execute: async (args) => {
    const params = parseJsonSafe<Record<string, unknown>>(args.params, {})
    const triggeredBy = (args.triggered_by as string) ?? 'agent'
    return wrap('run', () =>
      call('workflow_run', { id: String(args.workflow_id), params, triggeredBy }),
    )
  },
}

const workflowRunSyncTool: ToolDefinition = {
  name: 'workflow_run_sync',
  description: '启动并等待工作流结束（仅用于调试；生产推荐 workflow_run + workflow_status）。',
  parameters: {
    workflow_id: { type: 'string', description: '工作流 ID', required: true },
    params: { type: 'string', description: '入参（JSON 字符串）' },
    triggered_by: { type: 'string', description: '触发者' },
    timeout_ms: { type: 'number', description: '最大等待（默认 60000）' },
  },
  execute: async (args) => {
    const params = parseJsonSafe<Record<string, unknown>>(args.params, {})
    const triggeredBy = (args.triggered_by as string) ?? 'agent'
    const timeoutMs = (args.timeout_ms as number) ?? 60000
    return wrap('runSync', async () => {
      const start = Date.now()
      const runId = (await call('workflow_run', {
        id: String(args.workflow_id),
        params,
        triggeredBy,
      })) as string
      const terminal = ['completed', 'failed', 'cancelled']
      while (Date.now() - start < timeoutMs) {
        const status = (await call('workflow_status', { runId })) as { status: string } | null
        if (status && terminal.includes(status.status)) {
          return { runId, status, elapsedMs: Date.now() - start }
        }
        await new Promise((r) => setTimeout(r, 100))
      }
      return { runId, status: { status: 'timeout' }, elapsedMs: Date.now() - start }
    })
  },
}

const workflowStatusTool: ToolDefinition = {
  name: 'workflow_status',
  description: '查询工作流运行状态。',
  parameters: {
    run_id: { type: 'string', description: '运行 ID', required: true },
  },
  execute: async (args) =>
    wrap('status', () => call('workflow_status', { runId: String(args.run_id) })),
}

const workflowListRunsTool: ToolDefinition = {
  name: 'workflow_list_runs',
  description: '列工作流运行记录。',
  parameters: {
    workflow_id: { type: 'string', description: '按工作流 ID 过滤' },
    status: { type: 'string', description: '按状态过滤' },
    limit: { type: 'number', description: '最多返回条数（默认 50）' },
  },
  execute: async (args) =>
    wrap('runs', () =>
      call('workflow_list_runs', {
        workflowId: (args.workflow_id as string) ?? null,
        status: (args.status as string) ?? null,
        limit: (args.limit as number) ?? 50,
      }),
    ),
}

const workflowGetRunTool: ToolDefinition = {
  name: 'workflow_get_run',
  description: '取单条工作流运行详情。',
  parameters: {
    run_id: { type: 'string', description: '运行 ID', required: true },
  },
  execute: async (args) =>
    wrap('run', () => call('workflow_get_run', { runId: String(args.run_id) })),
}

const workflowCancelTool: ToolDefinition = {
  name: 'workflow_cancel',
  description: '取消正在执行的工作流。',
  parameters: {
    run_id: { type: 'string', description: '运行 ID', required: true },
  },
  execute: async (args) =>
    wrap('cancelled', () => call('workflow_cancel', { runId: String(args.run_id) })),
}

const workflowPauseTool: ToolDefinition = {
  name: 'workflow_pause',
  description: '暂停正在执行的工作流（Phase 3 占位）。',
  parameters: {
    run_id: { type: 'string', description: '运行 ID', required: true },
  },
  execute: async (args) =>
    wrap('paused', () => call('workflow_pause', { runId: String(args.run_id) })),
}

const workflowResumeTool: ToolDefinition = {
  name: 'workflow_resume',
  description: '恢复已暂停的工作流（Phase 3 占位）。',
  parameters: {
    run_id: { type: 'string', description: '运行 ID', required: true },
    decision: { type: 'string', description: '决策内容（JSON 字符串，可选）' },
  },
  execute: async (args) => {
    const decision = parseJsonSafe<Record<string, unknown> | undefined>(args.decision, undefined)
    return wrap('resumed', () => call('workflow_resume', { runId: String(args.run_id), decision: decision ?? null }))
  },
}

// 节点元数据：列所有可用节点类型（14 builtin + 任意 plugin 注入）
const workflowListNodeTypesTool: ToolDefinition = {
  name: 'workflow_list_node_types',
  description: '列出所有可用的工作流节点类型（14 个 builtin + 任意 plugin 注入）。返回每项含 type/category/label/icon/color/pluginId/description/configSchema。',
  parameters: {},
  execute: async () =>
    wrap('nodeTypes', () => call('workflow_list_node_types')),
}

// 节点元数据：取单节点 configSchema（生成表单 / 提示词模板用）
const workflowGetNodeSchemaTool: ToolDefinition = {
  name: 'workflow_get_node_schema',
  description: '取单个节点类型的 configSchema。返回 {type, category, label, configSchema, ...}。',
  parameters: {
    type: { type: 'string', description: '节点类型（如 "skill" / "condition" / plugin 自定义类型）', required: true },
  },
  execute: async (args) =>
    wrap('nodeSchema', () => call('workflow_get_node_schema', { type_: String(args.type) })),
}

export const workflowTools: ToolDefinition[] = [
  workflowListTool,
  workflowGetTool,
  workflowCreateTool,
  workflowUpdateTool,
  workflowDeleteTool,
  workflowExportTool,
  workflowImportTool,
  workflowDryRunTool,
  workflowRunTool,
  workflowRunSyncTool,
  workflowStatusTool,
  workflowListRunsTool,
  workflowGetRunTool,
  workflowCancelTool,
  workflowPauseTool,
  workflowResumeTool,
  workflowListNodeTypesTool,
  workflowGetNodeSchemaTool,
]
