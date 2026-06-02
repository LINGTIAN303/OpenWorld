<template>
  <div class="workflow-progress">
    <WsEmpty v-if="!activeRun && runs.size === 0" preset="no-data" title="暂无运行中的工作流" description="启动工作流后，这里会显示执行进度" />

    <div v-else class="progress-content">
      <div v-if="activeRun" class="active-run">
        <div class="run-header">
          <h3><WsIcon name="lightning" size="sm" /> {{ activeRun.workflowId }}</h3>
          <span :class="['status-badge', activeRun.status]">
            {{ statusLabel(activeRun.status) }}
          </span>
        </div>

        <div class="run-meta">
          <span>启动时间: {{ formatTime(activeRun.startedAt) }}</span>
        </div>

        <div class="node-states">
          <div
            v-for="(state, nodeId) in activeRun.nodeStates"
            :key="nodeId"
            :class="['node-item', state.status]"
          >
            <span class="node-icon"><WsIcon :name="statusIcon(state.status)" size="xs" /></span>
            <span class="node-id">{{ nodeId }}</span>
            <span class="node-duration" v-if="state.duration">
              {{ state.duration >= 1000 ? (state.duration / 1000).toFixed(1) + 's' : state.duration + 'ms' }}
            </span>
          </div>
        </div>

        <div class="run-actions">
          <button
            v-if="activeRun.status === 'running'"
            class="action-btn pause"
            @click="$emit('pause', activeRun.runId)"
          >
            <WsIcon name="pause" size="xs" /> 暂停
          </button>
          <button
            v-if="activeRun.status === 'paused'"
            class="action-btn resume"
            @click="$emit('resume', activeRun.runId)"
          >
            <WsIcon name="arrow-up" size="xs" /> 继续
          </button>
          <button
            v-if="activeRun.status === 'running' || activeRun.status === 'paused'"
            class="action-btn cancel"
            @click="$emit('cancel', activeRun.runId)"
          >
            <WsIcon name="close" size="xs" /> 取消
          </button>
        </div>
      </div>

      <div v-if="runs.size > 1" class="run-history">
        <h4>历史执行</h4>
        <div
          v-for="[runId, run] in Array.from(runs.entries()).filter(([id]) => id !== activeRun?.runId)"
          :key="runId"
          class="history-item"
        >
          <span>{{ run.workflowId }}</span>
          <span :class="['status-badge small', run.status]">{{ statusLabel(run.status) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import WsIcon from '../../../../ui/WsIcon.vue'
import WsEmpty from '../../../../ui/WsEmpty.vue'

interface RunState {
  runId: string
  workflowId: string
  status: string
  currentNodeId: string | null
  nodeStates: Record<string, any>
  startedAt: number
  params: Record<string, unknown>
}

defineProps<{
  runs: Map<string, RunState>
  activeRun: RunState | null
}>()

defineEmits<{
  pause: [runId: string]
  resume: [runId: string]
  cancel: [runId: string]
}>()

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    running: '运行中',
    completed: '已完成',
    failed: '失败',
    paused: '已暂停',
    cancelled: '已取消',
  }
  return map[status] || status
}

function statusIcon(status: string): string {
  const map: Record<string, string> = {
    success: 'check',
    failed: 'close',
    skipped: 'arrow-up',
    running: 'arrow-up',
  }
  return map[status] || 'close'
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString()
}
</script>

<style scoped>
.workflow-progress {
  padding: 16px;
}

.active-run {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 16px;
}

.run-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.run-header h3 {
  margin: 0;
  font-size: var(--font-size-md);
}

.status-badge {
  font-size: var(--font-size-xs);
  padding: 3px 10px;
  border-radius: 10px;
  font-weight: var(--font-weight-medium);
}

.status-badge.running {
  background: #dbeafe;
  color: #2563eb;
}

.status-badge.completed {
  background: #dcfce7;
  color: #16a34a;
}

.status-badge.failed {
  background: #fee2e2;
  color: #dc2626;
}

.status-badge.paused {
  background: #fef3c7;
  color: #d97706;
}

.status-badge.cancelled {
  background: #f3f4f6;
  color: #6b7280;
}

.status-badge.small {
  font-size: var(--font-size-xs);
  padding: 2px 8px;
}

.run-meta {
  font-size: var(--font-size-sm);
  color: var(--text-secondary, #6b7280);
  margin-bottom: 12px;
}

.node-states {
  margin-bottom: 12px;
}

.node-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  font-size: var(--font-size-sm);
}

.node-icon {
  font-size: var(--font-size-base);
}

.node-id {
  flex: 1;
}

.node-duration {
  font-size: var(--font-size-xs);
  color: var(--text-secondary, #6b7280);
}

.run-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  padding: 6px 14px;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  background: var(--color-bg-surface);
  cursor: pointer;
  font-size: var(--font-size-sm);
  transition: all 0.15s;
}

.action-btn:hover {
  border-color: var(--primary, #3b82f6);
}

.action-btn.cancel:hover {
  border-color: #ef4444;
  color: #ef4444;
}

.run-history {
  margin-top: 16px;
}

.run-history h4 {
  font-size: var(--font-size-sm);
  margin-bottom: 8px;
}

.history-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  font-size: var(--font-size-sm);
}
</style>
