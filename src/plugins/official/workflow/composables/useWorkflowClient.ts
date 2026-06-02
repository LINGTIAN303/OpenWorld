// useWorkflowClient
//
// 封装所有 workflow 相关的 Tauri Command 调用。
// TS 端按用户决定走 `@tauri-apps/api/core` 的 `invoke`（无 form 库）。
// 浏览器 dev 模式（无 Tauri）下用内存 mock，方便 UI 调试。

import { invoke } from '@tauri-apps/api/core'
import type {
  WorkflowDefinition,
  WorkflowSummary,
  RunSummary,
  RunStatusInfo,
  ParseFormat,
} from '../types'
import { isTauri } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// Tauri path
// ─────────────────────────────────────────────────────────────────────────────

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    return mockInvoke<T>(cmd, args)
  }
  return await invoke<T>(cmd, args)
}

export function useWorkflowClient() {
  return {
    // definitions
    list: (category?: string, keyword?: string, limit = 50) =>
      call<WorkflowSummary[]>('workflow_list', {
        category: category ?? null,
        keyword: keyword ?? null,
        limit,
      }),
    get: (id: string) => call<WorkflowDefinition>('workflow_get', { id }),
    create: (definition: WorkflowDefinition) =>
      call<WorkflowDefinition>('workflow_create', { definition }),
    update: (id: string, definition: WorkflowDefinition) =>
      call<WorkflowDefinition>('workflow_update', { id, definition }),
    delete: (id: string) => call<void>('workflow_delete', { id }),
    export: (id: string, format: 'json' | 'yaml') =>
      call<string>('workflow_export', { id, format }),
    import: (source: string, format?: ParseFormat) =>
      call<WorkflowDefinition>('workflow_import', { source, format: format ?? null }),

    // runs
    run: (id: string, params: unknown, triggeredBy: string) =>
      call<string>('workflow_run', { id, params, triggeredBy }),
    runSync: (id: string, params: unknown, triggeredBy: string) =>
      call<Record<string, unknown>>('workflow_run_sync', { id, params, triggeredBy }),
    pause: (runId: string) => call<void>('workflow_pause', { runId }),
    resume: (runId: string, decision?: unknown) =>
      call<void>('workflow_resume', { runId, decision: decision ?? null }),
    cancel: (runId: string) => call<void>('workflow_cancel', { runId }),
    skipTo: (runId: string, targetNodeId: string) =>
      call<void>('workflow_skip_to', { runId, targetNodeId }),
    status: (runId: string) => call<RunStatusInfo | null>('workflow_status', { runId }),
    listRuns: (workflowId?: string, status?: string, limit = 50) =>
      call<RunSummary[]>('workflow_list_runs', {
        workflowId: workflowId ?? null,
        status: status ?? null,
        limit,
      }),
    getRun: (runId: string) => call<RunSummary>('workflow_get_run', { runId }),

    // settings
    getSetting: (key: string) => call<string | null>('workflow_get_setting', { key }),
    setSetting: (key: string, value: string) =>
      call<void>('workflow_set_setting', { key, value }),
    purgeRunsNow: () => call<number>('workflow_purge_runs_now'),

    // node metadata (Phase 3.1)
    listNodeTypes: () =>
      call<Array<{
        type: string
        category: 'builtin' | 'plugin'
        label: string
        icon: string
        color: string
        pluginId: string
        description: string
        configSchema: Record<string, { type: string; required?: boolean; default?: unknown; description?: string; options?: string[] }>
      }>>('workflow_list_node_types'),
    getNodeSchema: (type: string) =>
      call<{
        type: string
        category: 'builtin' | 'plugin'
        label: string
        icon: string
        color: string
        pluginId: string
        description: string
        configSchema: Record<string, { type: string; required?: boolean; default?: unknown; description?: string; options?: string[] }>
      }>('workflow_get_node_schema', { type_: type }),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Browser dev mock（无 Tauri 时走 dev-mock-store，localStorage 持久化）
//
// 跟 worldsmith-agent/src/tools/workflow-tools.ts 共享同一份存储，
// 让 Agent 工具 + UI 客户端在浏览器 dev 模式下数据互通。
// ─────────────────────────────────────────────────────────────────────────────

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
} from './dev-mock-store'

async function mockInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  console.debug(`[mockInvoke] ${cmd}`, args)
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
