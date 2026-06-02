<script setup lang="ts">
// WorkflowRunsView — 运行记录列表
//
// P3 改写:用 WsTable 替代手写 table。
// 列定义:时间 / 工作流 / 触发人 / 状态 / 耗时 / 节点数 / 操作。
// emit:'view'(查看)/ 'rerun'(重跑)/ 'view-run'(旧,保留兼容)。
// prop:runs 优先,fallback 内部 useWorkflowRuns 拿。

import { ref, onMounted, computed } from 'vue'
import WsTable from '@/ui/WsTable.vue'
import WsStatusDot from '@/ui/WsStatusDot.vue'
import { useWorkflowRuns, type RunSummary } from '../composables/useWorkflowRuns'

const props = withDefaults(defineProps<{
  runs?: RunSummary[]
}>(), {
  runs: undefined,
})

const emit = defineEmits<{
  'view': [runId: string]
  'rerun': [runId: string]
  'view-run': [runId: string]
  'toast': [message: string, type: 'info' | 'error' | 'success']
}>()

const filter = ref<{ workflowId?: string; status?: string; limit?: number }>({
  limit: 50,
})

const runsApi = useWorkflowRuns(filter)

onMounted(() => {
  if (!props.runs) void runsApi.refresh()
})

const rows = computed<RunSummary[]>(() => props.runs ?? runsApi.list.value)

const columns = [
  { key: 'time', title: '时间', width: '180px' },
  { key: 'workflow', title: '工作流', width: '200px' },
  { key: 'trigger', title: '触发人', width: '160px' },
  { key: 'status', title: '状态', width: '120px' },
  { key: 'duration', title: '耗时', width: '100px' },
  { key: 'nodeCount', title: '节点数', width: '80px', align: 'right' as const },
  { key: 'actions', title: '操作', width: '160px' },
]

function formatTs(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

function triggerLabel(by: string): string {
  if (by.startsWith('user:')) return `👤 ${by.slice(5)}`
  if (by.startsWith('agent:')) return `🤖 ${by.slice(6)}`
  if (by === 'schedule') return '⏰ schedule'
  return by
}

function formatDuration(r: RunSummary): string {
  if (r.finished_at === null) return '—'
  const ms = r.finished_at - r.started_at
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function nodeCount(r: RunSummary): string {
  // 后端 RunSummary 不含 nodes 列表,这里简单显示 current_node_id
  // 或 '—'。实际节点数 P4 从 getRun 拿(详情视图)。
  return r.current_node_id ? '1+' : '—'
}

function onView(r: RunSummary): void {
  emit('view', r.run_id)
  emit('view-run', r.run_id)
}

function onRerun(r: RunSummary): void {
  emit('rerun', r.run_id)
}
</script>

<template>
  <div class="runs-view">
    <header v-if="!runs" class="runs-toolbar">
      <h2 class="runs-title">运行记录</h2>
    </header>
    <WsTable
      :columns="columns"
      :data="rows as unknown as Record<string, unknown>[]"
      :row-key="'run_id'"
      compact
    >
      <template #time="{ row }">
        <span class="ts-cell">{{ formatTs((row as RunSummary).started_at) }}</span>
      </template>
      <template #workflow="{ row }">
        <span class="mono-cell">{{ (row as RunSummary).workflow_id }} v{{ (row as RunSummary).workflow_version }}</span>
      </template>
      <template #trigger="{ row }">
        <span class="trigger-cell">{{ triggerLabel((row as RunSummary).triggered_by) }}</span>
      </template>
      <template #status="{ row }">
        <span class="status-cell">
          <WsStatusDot :status="(row as RunSummary).status" />
          {{ (row as RunSummary).status }}
        </span>
      </template>
      <template #duration="{ row }">
        <span class="duration-cell">{{ formatDuration(row as RunSummary) }}</span>
      </template>
      <template #nodeCount="{ row }">
        <span class="node-count-cell">{{ nodeCount(row as RunSummary) }}</span>
      </template>
      <template #actions="{ row }">
        <button
          class="row-btn"
          data-testid="run-view"
          @click="onView(row as RunSummary)"
        >
          查看
        </button>
        <button
          class="row-btn"
          data-testid="run-rerun"
          @click="onRerun(row as RunSummary)"
        >
          重跑
        </button>
      </template>
    </WsTable>
  </div>
</template>

<style scoped>
.runs-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg-secondary);
  padding: 12px 16px;
  box-sizing: border-box;
  overflow: auto;
}
.runs-toolbar {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}
.runs-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}
.ts-cell {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 11px;
  color: var(--color-text-tertiary);
}
.mono-cell {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 11px;
  color: var(--color-text-primary);
}
.trigger-cell {
  font-size: 12px;
  color: var(--color-text-secondary);
}
.status-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  text-transform: capitalize;
  color: var(--color-text-primary);
}
.duration-cell {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 11px;
  color: var(--color-text-secondary);
}
.node-count-cell {
  font-size: 11px;
  color: var(--color-text-tertiary);
}
.row-btn {
  padding: 2px 8px;
  margin-right: 4px;
  border: 1px solid var(--color-border-default);
  background: var(--color-bg-elevated);
  color: var(--color-text-primary);
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
  font-family: inherit;
}
.row-btn:hover {
  background: var(--color-bg-hover);
}
</style>
