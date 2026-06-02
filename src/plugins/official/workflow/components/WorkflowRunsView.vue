<script setup lang="ts">
// WorkflowRunsView — 运行记录列表
//
// Phase 4.2：列出工作流运行记录，可按 workflow_id / status 过滤、查看详情、取消。

import { ref, onMounted, computed } from 'vue'
import { useWorkflowRuns, type RunSummary } from '../composables/useWorkflowRuns'

const filter = ref<{ workflowId?: string; status?: string; limit?: number }>({
  limit: 50,
})

const { list, loading, error, refresh, cancel } = useWorkflowRuns(filter)

onMounted(() => {
  void refresh()
})

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

function formatTs(ts: number | null): string {
  if (ts === null) return '—'
  const d = new Date(ts)
  return d.toLocaleString('zh-CN', { hour12: false })
}

function durationMs(r: RunSummary): number | null {
  if (r.finished_at === null) return null
  return r.finished_at - r.started_at
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

const emit = defineEmits<{
  'view-run': [runId: string]
  'toast': [message: string, type: 'info' | 'error' | 'success']
}>()

async function onCancel(r: RunSummary): Promise<void> {
  const ok = await cancel(r.run_id)
  emit('toast', ok ? `已取消 run ${r.run_id}` : '取消失败', ok ? 'success' : 'error')
  if (ok) void refresh()
}

function applyFilter(): void {
  void refresh()
}
</script>

<template>
  <div class="runs-view">
    <header class="runs-toolbar">
      <h2 class="runs-title">运行记录</h2>
      <div class="runs-filters">
        <input
          v-model="filter.workflowId"
          type="text"
          placeholder="按 workflow_id 过滤"
          class="filter-input"
        />
        <select v-model="filter.status" class="filter-input">
          <option :value="undefined">所有状态</option>
          <option value="pending">pending</option>
          <option value="running">running</option>
          <option value="completed">completed</option>
          <option value="failed">failed</option>
          <option value="cancelled">cancelled</option>
        </select>
        <button class="filter-btn" @click="applyFilter">过滤</button>
        <button class="filter-btn" @click="refresh">刷新</button>
      </div>
    </header>

    <div v-if="error" class="runs-error">{{ error }}</div>
    <div v-else-if="loading" class="runs-loading">加载中…</div>
    <div v-else-if="list.length === 0" class="runs-empty">暂无运行记录</div>
    <table v-else class="runs-table">
      <thead>
        <tr>
          <th>run_id</th>
          <th>workflow_id</th>
          <th>状态</th>
          <th>触发者</th>
          <th>开始</th>
          <th>耗时</th>
          <th>当前节点</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in list" :key="r.run_id">
          <td class="mono-cell">
            <button class="link-btn" @click="emit('view-run', r.run_id)">{{ r.run_id }}</button>
          </td>
          <td class="mono-cell">{{ r.workflow_id }} v{{ r.workflow_version }}</td>
          <td>
            <span class="status-badge" :style="{ backgroundColor: statusColor(r.status) }">
              {{ r.status }}
            </span>
          </td>
          <td>{{ r.triggered_by }}</td>
          <td class="ts-cell">{{ formatTs(r.started_at) }}</td>
          <td>{{ formatDuration(durationMs(r)) }}</td>
          <td class="mono-cell">{{ r.current_node_id ?? '—' }}</td>
          <td>
            <button
              v-if="r.status === 'running' || r.status === 'pending'"
              class="row-btn danger"
              @click="onCancel(r)"
            >
              取消
            </button>
            <button v-else class="row-btn" @click="emit('view-run', r.run_id)">详情</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.runs-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f8fafc;
  padding: 12px 16px;
  box-sizing: border-box;
  overflow: auto;
}
.runs-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.runs-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}
.runs-filters {
  display: flex;
  gap: 6px;
}
.filter-input {
  padding: 4px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  font-size: 12px;
  font-family: inherit;
}
.filter-btn {
  padding: 4px 10px;
  border: 1px solid #cbd5e1;
  background: white;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
}
.filter-btn:hover {
  background: #f1f5f9;
}
.runs-error,
.runs-loading,
.runs-empty {
  padding: 24px;
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
}
.runs-error {
  background: #fee2e2;
  color: #b91c1c;
  border-radius: 4px;
}
.runs-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  background: white;
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}
.runs-table th,
.runs-table td {
  padding: 6px 10px;
  border-bottom: 1px solid #e2e8f0;
  text-align: left;
}
.runs-table th {
  background: #f1f5f9;
  font-weight: 600;
  color: #475569;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.runs-table tr:last-child td {
  border-bottom: none;
}
.mono-cell {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 11px;
}
.ts-cell {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 11px;
  color: #64748b;
}
.status-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  color: white;
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
}
.link-btn {
  background: none;
  border: none;
  color: #2563eb;
  cursor: pointer;
  padding: 0;
  font: inherit;
  text-decoration: underline;
}
.row-btn {
  padding: 2px 8px;
  border: 1px solid #cbd5e1;
  background: white;
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
  font-family: inherit;
}
.row-btn:hover {
  background: #f1f5f9;
}
.row-btn.danger {
  border-color: #fca5a5;
  color: #dc2626;
}
</style>
