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
  padding: var(--space-4);
}

.active-run {
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg, 8px);
  padding: var(--space-4);
}

.run-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-2);
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
  background: color-mix(in srgb, var(--color-info) 15%, transparent);
  color: var(--color-info);
}

.status-badge.completed {
  background: color-mix(in srgb, var(--color-success) 15%, transparent);
  color: var(--color-success);
}

.status-badge.failed {
  background: color-mix(in srgb, var(--color-danger) 15%, transparent);
  color: var(--color-danger);
}

.status-badge.paused {
  background: color-mix(in srgb, var(--color-warning) 15%, transparent);
  color: var(--color-warning);
}

.status-badge.cancelled {
  background: color-mix(in srgb, var(--color-text-tertiary) 15%, transparent);
  color: var(--color-text-tertiary);
}

.status-badge.small {
  font-size: var(--font-size-xs);
  padding: 2px 8px;
}

.run-meta {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-bottom: var(--space-3);
}

.node-states {
  margin-bottom: var(--space-3);
}

.node-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1_5) 0;
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
  color: var(--color-text-secondary);
}

.run-actions {
  display: flex;
  gap: var(--space-2);
}

.action-btn {
  padding: 6px 14px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md, 6px);
  background: var(--color-bg-elevated);
  color: var(--color-text-primary);
  cursor: pointer;
  font-size: var(--font-size-sm);
  transition: border-color var(--duration-fast) var(--ease-default);
}

.action-btn:hover {
  border-color: var(--color-primary);
}

.action-btn.cancel:hover {
  border-color: var(--color-danger);
  color: var(--color-danger);
}

.run-history {
  margin-top: var(--space-4);
}

.run-history h4 {
  font-size: var(--font-size-sm);
  margin-bottom: var(--space-2);
}

.history-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-1_5) 0;
  font-size: var(--font-size-sm);
}
</style>
