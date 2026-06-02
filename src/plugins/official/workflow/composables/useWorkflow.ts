import { reactive, readonly } from 'vue'
import { removePersistedWorkflow } from './useWorkflowPersistence'
import { useWorkflowClient } from './useWorkflowClient'
import type { WorkflowSummary } from '../types'

interface WorkflowRunState {
  runId: string
  workflowId: string
  status: string
  currentNodeId: string | null
  nodeStates: Record<string, any>
  startedAt: number
  params: Record<string, unknown>
}

const runs = reactive<Map<string, WorkflowRunState>>(new Map())
const activeRunId = reactive<{ value: string | null }>({ value: null })

// 数据源切换为后端 Sqlite（通过 useWorkflowClient）。
// 老的 localStorage 持久化在 activate() 阶段由 useLocalStorageMigration 一次性迁移。
const workflowList = reactive<WorkflowSummary[]>([])

let listenersRegistered = false

if (typeof window !== 'undefined') {
  ;(window as any).__worldsmith_workflow_runs = runs
}

// 启动时从后端拉一次
const client = useWorkflowClient()
client
  .list()
  .then((list) => {
    workflowList.splice(0, workflowList.length, ...list)
  })
  .catch((e) => console.warn('[useWorkflow] 加载工作流列表失败:', e))

function handleWorkflowList(_e: Event) {
  // 外部通知（包括 Agent tool）触发重新拉后端
  void refreshList()
}

function handleWorkflowRun(e: Event) {
  const detail = (e as CustomEvent).detail
  const runId = detail.runId || `run-${Date.now()}`
  const state: WorkflowRunState = {
    runId,
    workflowId: detail.workflowId,
    status: 'running',
    currentNodeId: null,
    nodeStates: {},
    startedAt: Date.now(),
    params: detail.params || {},
  }
  runs.set(runId, state)
  activeRunId.value = runId
}

function handleWorkflowCreate(e: Event) {
  const detail = (e as CustomEvent).detail
  if (detail.definition) {
    const def = detail.definition
    const existing = workflowList.findIndex((w) => w.id === def.id)
    const summary: WorkflowSummary = {
      id: def.id,
      latestVersion: def.version ?? 1,
      name: def.name,
      category: def.category || 'custom',
      description: def.description ?? null,
      updatedAt: Date.now(),
    }
    if (existing !== -1) {
      workflowList[existing] = summary
    } else {
      workflowList.push(summary)
    }
  }
}

function handleWorkflowDelete(e: Event) {
  const detail = (e as CustomEvent).detail
  const id = detail?.id
  if (!id) return
  const idx = workflowList.findIndex((w) => w.id === id)
  if (idx !== -1) workflowList.splice(idx, 1)
}

function handleWorkflowControl(e: Event) {
  const detail = (e as CustomEvent).detail
  const { action, runId } = detail
  if (!runId) return

  const run = runs.get(runId)
  if (!run) return

  switch (action) {
    case 'pause':
      run.status = 'paused'
      break
    case 'resume':
      run.status = 'running'
      break
    case 'cancel':
      run.status = 'cancelled'
      break
  }
}

function handleWorkflowNodeUpdate(e: Event) {
  const detail = (e as CustomEvent).detail
  const { runId, nodeId, output } = detail
  if (!runId || !nodeId) return

  const run = runs.get(runId)
  if (!run) return

  run.nodeStates[nodeId] = output
  run.currentNodeId = nodeId
}

function handleWorkflowCompleted(e: Event) {
  const detail = (e as CustomEvent).detail
  const { runId } = detail
  if (!runId) return

  const run = runs.get(runId)
  if (run) run.status = 'completed'
}

function handleWorkflowFailed(e: Event) {
  const detail = (e as CustomEvent).detail
  const { runId } = detail
  if (!runId) return

  const run = runs.get(runId)
  if (run) run.status = 'failed'
}

function updateRunStatus(runId: string, update: Partial<WorkflowRunState>) {
  const run = runs.get(runId)
  if (run) Object.assign(run, update)
}

function setActiveRun(runId: string | null) {
  activeRunId.value = runId
}

function removeRun(runId: string) {
  runs.delete(runId)
  if (activeRunId.value === runId) activeRunId.value = null
}

function removeWorkflow(workflowId: string) {
  const idx = workflowList.findIndex((w) => w.id === workflowId)
  if (idx !== -1) workflowList.splice(idx, 1)

  // 兜底清理老 localStorage 残留（正常情况下迁移时已清空）
  removePersistedWorkflow(workflowId)
}

function getActiveRun(): WorkflowRunState | null {
  if (!activeRunId.value) return null
  return runs.get(activeRunId.value) || null
}

/** 从后端重新拉取列表（用于 CRUD 后刷新） */
async function refreshList() {
  try {
    const list = await client.list()
    workflowList.splice(0, workflowList.length, ...list)
  } catch (e) {
    console.warn('[useWorkflow] refreshList 失败:', e)
  }
}

function registerListeners(): void {
  if (listenersRegistered || typeof window === 'undefined') return
  listenersRegistered = true
  window.addEventListener('worldsmith:workflow-list', handleWorkflowList)
  window.addEventListener('worldsmith:workflow-run', handleWorkflowRun)
  window.addEventListener('worldsmith:workflow-create', handleWorkflowCreate)
  window.addEventListener('worldsmith:workflow-delete', handleWorkflowDelete)
  window.addEventListener('worldsmith:workflow-control', handleWorkflowControl)
  window.addEventListener('worldsmith:workflow-node-update', handleWorkflowNodeUpdate)
  window.addEventListener('worldsmith:workflow-completed', handleWorkflowCompleted)
  window.addEventListener('worldsmith:workflow-failed', handleWorkflowFailed)
}

function unregisterListeners(): void {
  if (!listenersRegistered || typeof window === 'undefined') return
  listenersRegistered = false
  window.removeEventListener('worldsmith:workflow-list', handleWorkflowList)
  window.removeEventListener('worldsmith:workflow-run', handleWorkflowRun)
  window.removeEventListener('worldsmith:workflow-create', handleWorkflowCreate)
  window.removeEventListener('worldsmith:workflow-delete', handleWorkflowDelete)
  window.removeEventListener('worldsmith:workflow-control', handleWorkflowControl)
  window.removeEventListener('worldsmith:workflow-node-update', handleWorkflowNodeUpdate)
  window.removeEventListener('worldsmith:workflow-completed', handleWorkflowCompleted)
  window.removeEventListener('worldsmith:workflow-failed', handleWorkflowFailed)
}

registerListeners()

export function useWorkflow() {
  return {
    runs: readonly(runs),
    activeRunId: readonly(activeRunId),
    workflowList: readonly(workflowList),
    updateRunStatus,
    setActiveRun,
    removeRun,
    removeWorkflow,
    getActiveRun,
    refreshList,
    unregisterListeners,
  }
}
