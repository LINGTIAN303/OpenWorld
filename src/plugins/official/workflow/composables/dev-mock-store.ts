// 工作流 dev 模式 mock 存储
//
// 浏览器 dev 模式（无 __TAURI_INTERNALS__）下，所有 workflow_* 命令走本地 mock。
// 本模块用 localStorage 持久化，让 Agent 工具（workflow-tools.ts）+ UI 客户端
// （useWorkflowClient.ts）共享同一份数据。
//
// 触发条件：isTauri() === false
// 存储位置：localStorage['worldsmith:workflow:dev-mock-defs:v1']
//
// Tauri 模式下不使用本模块；调用走 Rust Sqlite（src-tauri/src/workflow/storage）。

import { builtinNodeMetadata, type NodeMetadata } from '../node-metadata'

const STORAGE_KEY = 'worldsmith:workflow:dev-mock-defs:v1'
const RUNS_KEY = 'worldsmith:workflow:dev-mock-runs:v1'

export interface MockDefinition {
  id: string
  name: string
  version: number
  description?: string | null
  category?: string
  params?: unknown
  timeoutMs?: number | null
  nodes: unknown[]
  edges: unknown[]
  schemaVersion: number
  createdAt: number
  updatedAt: number
}

export interface MockSummary {
  id: string
  latestVersion: number
  name: string
  category: string
  description: string | null
  updatedAt: number
}

export interface MockRun {
  runId: string
  workflowId: string
  workflowVersion: number
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'paused'
  triggeredBy: string
  startedAt: number
  completedAt: number | null
  error: string | null
  currentNodeId: string | null
}

function hasStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function loadAll(): MockDefinition[] {
  if (!hasStorage()) return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as MockDefinition[]
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function persistAll(arr: MockDefinition[]): void {
  if (!hasStorage()) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(arr))
  } catch (e) {
    console.warn('[dev-mock] save defs 失败:', e)
  }
}

function loadRuns(): MockRun[] {
  if (!hasStorage()) return []
  try {
    const raw = window.localStorage.getItem(RUNS_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as MockRun[]
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function persistRuns(arr: MockRun[]): void {
  if (!hasStorage()) return
  try {
    window.localStorage.setItem(RUNS_KEY, JSON.stringify(arr))
  } catch (e) {
    console.warn('[dev-mock] save runs 失败:', e)
  }
}

// ─── List / Get ─────────────────────────────────────────────────────────────

export function mockList(
  category?: string | null,
  keyword?: string | null,
  limit = 50,
): MockSummary[] {
  const all = loadAll()
  const cat = category ?? null
  const kw = (keyword ?? '').toLowerCase()
  return all
    .filter((d) => {
      const dCat = d.category || 'custom'
      if (cat && dCat !== cat) return false
      if (kw) {
        return (d.name ?? '').toLowerCase().includes(kw) ||
               (d.description ?? '').toLowerCase().includes(kw) ||
               dCat.toLowerCase().includes(kw)
      }
      return true
    })
    .map((d) => ({
      id: d.id,
      latestVersion: d.version ?? 1,
      name: d.name,
      category: d.category || 'custom',
      description: d.description ?? null,
      updatedAt: d.updatedAt ?? 0,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit)
}

export function mockGet(id: string): MockDefinition | null {
  return loadAll().find((d) => d.id === id) ?? null
}

// ─── Create / Update / Delete ───────────────────────────────────────────────

type CreateInput = {
  id: string
  name: string
  nodes: unknown[]
  edges: unknown[]
  schemaVersion: number
  version?: number
  description?: string | null
  category?: string
  params?: unknown
  timeoutMs?: number | null
}

export function mockCreate(def: CreateInput): MockDefinition {
  const all = loadAll()
  if (all.find((d) => d.id === def.id)) {
    throw new Error(`工作流 ${def.id} 已存在；请用 mockUpdate`)
  }
  const now = Date.now()
  const stored: MockDefinition = {
    id: def.id,
    name: def.name,
    version: def.version ?? 1,
    description: def.description ?? null,
    category: def.category ?? 'custom',
    params: def.params ?? null,
    timeoutMs: def.timeoutMs ?? null,
    nodes: def.nodes,
    edges: def.edges,
    schemaVersion: def.schemaVersion,
    createdAt: now,
    updatedAt: now,
  }
  all.push(stored)
  persistAll(all)
  return stored
}

type UpdateInput = {
  nodes: unknown[]
  edges: unknown[]
  name?: string
  description?: string | null
  category?: string
  params?: unknown
  timeoutMs?: number | null
  schemaVersion?: number
}

export function mockUpdate(id: string, def: UpdateInput): MockDefinition {
  const all = loadAll()
  const idx = all.findIndex((d) => d.id === id)
  if (idx === -1) throw new Error(`工作流 ${id} 不存在`)
  const now = Date.now()
  const existing = all[idx]
  const stored: MockDefinition = {
    id,
    name: def.name ?? existing.name,
    version: (existing.version ?? 1) + 1,
    description: def.description ?? existing.description ?? null,
    category: def.category ?? existing.category ?? 'custom',
    params: def.params ?? existing.params ?? null,
    timeoutMs: def.timeoutMs ?? existing.timeoutMs ?? null,
    nodes: def.nodes,
    edges: def.edges,
    schemaVersion: def.schemaVersion ?? existing.schemaVersion ?? 1,
    createdAt: existing.createdAt ?? now,
    updatedAt: now,
  }
  all[idx] = stored
  persistAll(all)
  return stored
}

export function mockDelete(id: string): void {
  const all = loadAll()
  const idx = all.findIndex((d) => d.id === id)
  if (idx === -1) throw new Error(`工作流 ${id} 不存在`)
  all.splice(idx, 1)
  persistAll(all)
}

// ─── Import / Export (dev mock 仅支持 JSON) ─────────────────────────────────

export function mockExport(id: string, _format: 'json' | 'yaml' = 'json'): string {
  const def = mockGet(id)
  if (!def) throw new Error(`工作流 ${id} 不存在`)
  return JSON.stringify(def, null, 2)
}

export function mockImport(source: string, _format: 'auto' | 'json' | 'yaml' = 'auto'): MockDefinition {
  let def: Record<string, unknown>
  try {
    def = JSON.parse(source)
  } catch (e) {
    throw new Error(`JSON 解析失败: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (!def.id || !def.name || !Array.isArray(def.nodes) || !Array.isArray(def.edges)) {
    throw new Error('definition 必须含 id/name/nodes/edges')
  }
  return mockCreate({
    id: String(def.id),
    name: String(def.name),
    nodes: def.nodes,
    edges: def.edges,
    schemaVersion: Number(def.schemaVersion) || 1,
    version: def.version != null ? Number(def.version) : undefined,
    description: def.description != null ? String(def.description) : null,
    category: def.category != null ? String(def.category) : undefined,
    params: def.params,
    timeoutMs: def.timeoutMs != null ? Number(def.timeoutMs) : null,
  })
}

// ─── Dry Run (极简校验) ─────────────────────────────────────────────────────

export function mockDryRun(id: string): { ok: boolean; errors: string[]; nodeCount: number; edgeCount: number } {
  const def = mockGet(id)
  if (!def) throw new Error(`工作流 ${id} 不存在`)
  const errors: string[] = []
  const nodes = def.nodes as Array<{ type?: string }>
  const hasStart = nodes.some((n) => n.type === 'start')
  const hasEnd = nodes.some((n) => n.type === 'end')
  if (!hasStart) errors.push('缺少 start 节点')
  if (!hasEnd) errors.push('缺少 end 节点')
  if (def.edges.length === 0) errors.push('边不能为空')
  return {
    ok: errors.length === 0,
    errors,
    nodeCount: nodes.length,
    edgeCount: def.edges.length,
  }
}

// ─── Run (dev mock 不真跑，直接 completed) ──────────────────────────────────

export function mockRun(workflowId: string, triggeredBy: string): MockRun {
  const def = mockGet(workflowId)
  if (!def) throw new Error(`工作流 ${workflowId} 不存在`)
  const run: MockRun = {
    runId: `mock-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    workflowId,
    workflowVersion: def.version ?? 1,
    status: 'completed',
    triggeredBy,
    startedAt: Date.now(),
    completedAt: Date.now() + 100,
    error: null,
    currentNodeId: null,
  }
  const all = loadRuns()
  all.push(run)
  persistRuns(all)
  return run
}

export function mockRunSync(workflowId: string, triggeredBy: string): { run: MockRun; status: 'completed'; output: null } {
  return { run: mockRun(workflowId, triggeredBy), status: 'completed', output: null }
}

export function mockStatus(_runId: string): null {
  return null
}

export function mockListRuns(workflowId?: string | null, _status?: string | null, _limit = 50): MockRun[] {
  const all = loadRuns()
  return all.filter((r) => !workflowId || r.workflowId === workflowId)
}

export function mockGetRun(runId: string): MockRun | null {
  return loadRuns().find((r) => r.runId === runId) ?? null
}

// ─── Node metadata (dev mock 始终返回 14 个 builtin) ────────────────────────

export function mockListNodeTypes(): NodeMetadata[] {
  return builtinNodeMetadata
}

export function mockGetNodeSchema(type: string): NodeMetadata | null {
  return builtinNodeMetadata.find((n) => n.type === type) ?? null
}
