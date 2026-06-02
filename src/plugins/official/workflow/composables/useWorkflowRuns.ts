// useWorkflowRuns — 工作流运行记录数据源
//
// Phase 4.2：拉取运行记录（list_runs）+ 单条详情（get_run）+ 实时状态（status）。
// 全部走 Tauri invoke；dev 模式 fallback mock。

import { ref, computed, type Ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'

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
  }
}
