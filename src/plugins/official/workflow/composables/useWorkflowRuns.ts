// useWorkflowRuns — 工作流运行记录数据源
//
// Phase 4.2：拉取运行记录（list_runs）+ 单条详情（get_run）+ 实时状态（status）。
// P3 扩展：订阅 `worldsmith:workflow-run` 事件，捕获 agent_decision 节点暂停的
// 决策上下文（activeDecision），并提供 resolveDecision / fallbackDecision
// 双向回写决策结果（dispatch `worldsmith:workflow-run-resolved`）。
// 全部走 Tauri invoke；dev 模式 fallback mock。

import { ref, computed, type Ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { DecisionContext, DecisionResult } from '../types'

export interface RunSummary {
  run_id: string
  workflow_id: string
  workflow_version: number
  status: string
  triggered_by: string
  params: Record<string, unknown>
  started_at: number
  finished_at: number | null
  error: string | null
  current_node_id: string | null
}

export interface RunListFilter {
  workflowId?: string
  status?: string
  limit?: number
}

const isTauri = (): boolean => {
  if (typeof window === 'undefined') return false
  return Boolean((window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
}

// P3 决策事件 — module-level 状态,组件 + 测试共享
const _activeDecision: Ref<DecisionContext | null> = ref(null)
let _listenersAttached = false

function handleRunEvent(e: Event): void {
  const detail = (e as CustomEvent<{ type?: string; payload?: unknown }>).detail
  if (detail?.type !== 'workflow_node_paused') return
  const payload = detail.payload as DecisionContext | undefined
  if (!payload || payload.nodeType !== 'agent_decision') return
  _activeDecision.value = payload
}

function attachDecisionListeners(): void {
  if (_listenersAttached || typeof window === 'undefined') return
  _listenersAttached = true
  window.addEventListener('worldsmith:workflow-run', handleRunEvent)
}

function detachDecisionListeners(): void {
  if (!_listenersAttached || typeof window === 'undefined') return
  _listenersAttached = false
  window.removeEventListener('worldsmith:workflow-run', handleRunEvent)
  _activeDecision.value = null
}

function dispatchResolved(runId: string, nodeId: string, result: DecisionResult): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('worldsmith:workflow-run-resolved', {
    detail: { runId, nodeId, choice: result.choice, note: result.note },
  }))
}

/** useWorkflowRuns — 列运行 + 详情 + 轮询 */
export function useWorkflowRuns(filterRef?: Ref<RunListFilter | null>) {
  const list: Ref<RunSummary[]> = ref([])
  const loading = ref(false)
  const error: Ref<string | null> = ref(null)

  async function refresh(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const f = filterRef?.value ?? {}
      if (isTauri()) {
        const rows = await invoke<RunSummary[]>('workflow_list_runs', {
          workflowId: f.workflowId ?? null,
          status: f.status ?? null,
          limit: f.limit ?? 50,
        })
        list.value = rows
      } else {
        list.value = []
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  async function getRun(runId: string): Promise<RunSummary | null> {
    if (isTauri()) {
      return await invoke<RunSummary | null>('workflow_get_run', { runId })
    }
    return null
  }

  async function getStatus(runId: string): Promise<RunSummary | null> {
    if (isTauri()) {
      return await invoke<RunSummary | null>('workflow_status', { runId })
    }
    return null
  }

  async function cancel(runId: string): Promise<boolean> {
    if (isTauri()) {
      return await invoke<boolean>('workflow_cancel', { runId })
    }
    return false
  }

  const total = computed(() => list.value.length)
  const byStatus = computed(() => {
    const map: Record<string, number> = {}
    for (const r of list.value) {
      map[r.status] = (map[r.status] ?? 0) + 1
    }
    return map
  })

  // P3 决策事件 — 第一次调用时自动 attach listener
  attachDecisionListeners()

  function resolveDecision(result: DecisionResult): void {
    const ctx = _activeDecision.value
    if (!ctx) return
    dispatchResolved(ctx.runId, ctx.nodeId, result)
    _activeDecision.value = null
  }

  function fallbackDecision(): void {
    const ctx = _activeDecision.value
    if (!ctx) return
    resolveDecision({ choice: ctx.defaultOption, note: '(fallback)' })
  }

  return {
    list,
    loading,
    error,
    total,
    byStatus,
    refresh,
    getRun,
    getStatus,
    cancel,
    // P3 决策
    activeDecision: _activeDecision,
    resolveDecision,
    fallbackDecision,
    unregisterListeners: detachDecisionListeners,
  }
}
