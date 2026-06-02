<script setup lang="ts">
// WorkflowRunView — 单条 run 详情
//
// Phase 4.3：显示 run 状态、参数、当前节点、错误。自动轮询（running 状态时）。

import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import {
  useWorkflowRuns,
  type RunSummary,
} from '../composables/useWorkflowRuns'
import { useWorkflowClient } from '../composables/useWorkflowClient'
import { isTauri } from '../types'

const props = defineProps<{
  runId: string
}>()

const emit = defineEmits<{
  'back': []
  'toast': [message: string, type: 'info' | 'error' | 'success']
}>()

const { getRun, cancel } = useWorkflowRuns()
const client = useWorkflowClient()

const run = ref<RunSummary | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

async function refresh(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    run.value = await getRun(props.runId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

function maybeStartPoll(): void {
  if (pollTimer) return
  if (!run.value) return
  if (run.value.status === 'running' || run.value.status === 'pending') {
    pollTimer = setInterval(() => void refresh(), 2_000)
  }
}

function stopPoll(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

onMounted(async () => {
  await refresh()
  maybeStartPoll()
})

onBeforeUnmount(() => {
  stopPoll()
})

watch(
  () => run.value?.status,
  () => {
    maybeStartPoll()
    if (run.value && !['running', 'pending'].includes(run.value.status)) {
      stopPoll()
    }
  },
)

async function onCancel(): Promise<void> {
  if (!run.value) return
  const ok = await cancel(run.value.run_id)
  emit('toast', ok ? '已取消' : '取消失败', ok ? 'success' : 'error')
  if (ok) await refresh()
}

function formatTs(ts: number | null): string {
  if (ts === null) return '—'
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

function formatDuration(r: RunSummary): string {
  if (r.finished_at === null) {
    if (r.started_at) {
      return `${((Date.now() - r.started_at) / 1000).toFixed(1)}s (运行中)`
    }
    return '—'
  }
  const ms = r.finished_at - r.started_at
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function statusColor(status: string): string {
  switch (status) {
    case 'completed':
      return '#22c55e'
    case 'failed':
      return '#ef4444'
    case 'cancelled':
      return '#94a3b8'
    case 'running':
      return '#3b82f6'
    case 'pending':
      return '#f59e0b'
    default:
      return '#64748b'
  }
}
</script>

<template>
  <div class="run-view">
    <header class="run-toolbar">
      <button class="toolbar-btn" @click="emit('back')">← 返回</button>
      <h2 class="run-title">Run {{ runId }}</h2>
      <button class="toolbar-btn" @click="refresh">刷新</button>
    </header>

    <div v-if="error" class="run-error">{{ error }}</div>
    <div v-else-if="loading && !run" class="run-loading">加载中…</div>
    <div v-else-if="!run" class="run-empty">未找到该 run</div>
    <div v-else class="run-content">
      <section class="run-section">
        <h3 class="section-title">状态</h3>
        <div class="status-row">
          <span class="status-badge" :style="{ backgroundColor: statusColor(run.status) }">
            {{ run.status }}
          </span>
          <span class="duration">耗时 {{ formatDuration(run) }}</span>
          <button
            v-if="run.status === 'running' || run.status === 'pending'"
            class="toolbar-btn danger"
            @click="onCancel"
          >
            取消
          </button>
        </div>
      </section>

      <section class="run-section">
        <h3 class="section-title">基本信息</h3>
        <table class="info-table">
          <tbody>
            <tr><th>run_id</th><td class="mono">{{ run.run_id }}</td></tr>
            <tr><th>workflow_id</th><td class="mono">{{ run.workflow_id }} v{{ run.workflow_version }}</td></tr>
            <tr><th>triggered_by</th><td>{{ run.triggered_by }}</td></tr>
            <tr><th>started_at</th><td class="mono">{{ formatTs(run.started_at) }}</td></tr>
            <tr><th>finished_at</th><td class="mono">{{ formatTs(run.finished_at) }}</td></tr>
            <tr><th>current_node_id</th><td class="mono">{{ run.current_node_id ?? '—' }}</td></tr>
          </tbody>
        </table>
      </section>

      <section class="run-section">
        <h3 class="section-title">参数</h3>
        <pre class="json-block">{{ JSON.stringify(run.params, null, 2) }}</pre>
      </section>

      <section v-if="run.error" class="run-section">
        <h3 class="section-title error">错误</h3>
        <pre class="error-block">{{ run.error }}</pre>
      </section>
    </div>
  </div>
</template>

<style scoped>
.run-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f8fafc;
  padding: 12px 16px;
  box-sizing: border-box;
  overflow: auto;
}
.run-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}
.run-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  flex: 1;
  font-family: ui-monospace, SFMono-Regular, monospace;
}
.toolbar-btn {
  padding: 4px 10px;
  border: 1px solid #cbd5e1;
  background: white;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
}
.toolbar-btn:hover {
  background: #f1f5f9;
}
.toolbar-btn.danger {
  border-color: #fca5a5;
  color: #dc2626;
}
.run-error,
.run-loading,
.run-empty {
  padding: 24px;
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
}
.run-error {
  background: #fee2e2;
  color: #b91c1c;
  border-radius: 4px;
}
.run-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.run-section {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 12px 16px;
}
.section-title {
  margin: 0 0 8px 0;
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.section-title.error {
  color: #dc2626;
}
.status-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.status-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 3px;
  color: white;
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
}
.duration {
  font-size: 12px;
  color: #64748b;
  font-family: ui-monospace, SFMono-Regular, monospace;
}
.info-table {
  width: 100%;
  font-size: 12px;
}
.info-table th {
  text-align: left;
  padding: 3px 12px 3px 0;
  color: #64748b;
  font-weight: 500;
  width: 140px;
}
.info-table td {
  padding: 3px 0;
  color: #1e293b;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 11px;
}
.json-block,
.error-block {
  background: #0f172a;
  color: #e2e8f0;
  padding: 10px 12px;
  border-radius: 4px;
  font-size: 11px;
  line-height: 1.5;
  font-family: ui-monospace, SFMono-Regular, monospace;
  overflow-x: auto;
  margin: 0;
}
.error-block {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
}
</style>
