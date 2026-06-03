<template>
  <div class="workflow-run-view">
    <div v-if="run" class="run-detail">
      <div class="run-header">
        <h2>{{ run.workflowId }}</h2>
        <span :class="['status-badge', run.status]">{{ statusLabel(run.status) }}</span>
      </div>

      <div class="run-meta">
        <span>运行 ID: {{ run.runId }}</span>
        <span>启动时间: {{ formatTime(run.startedAt) }}</span>
      </div>

      <div class="node-timeline">
        <h3>节点执行时间线</h3>
        <RunTimelineItem
          v-for="(state, nodeId) in run.nodeStates"
          :key="nodeId"
          :node-id="nodeId"
          :status="state.status"
          :duration="state.duration"
          :started-at="state.startedAt"
        />
      </div>

      <div v-if="run.status === 'running'" class="run-actions">
        <button class="action-btn pause" @click="$emit('pause', run.runId)">
          <WsIcon name="pause" size="xs" /> 暂停
        </button>
        <button class="action-btn cancel" @click="$emit('cancel', run.runId)">
          <WsIcon name="close" size="xs" /> 取消
        </button>
      </div>

      <div v-if="run.status === 'paused'" class="run-actions">
        <button class="action-btn resume" @click="$emit('resume', run.runId)">
          <WsIcon name="arrow-up" size="xs" /> 继续
        </button>
        <button class="action-btn cancel" @click="$emit('cancel', run.runId)">
          <WsIcon name="close" size="xs" /> 取消
        </button>
      </div>
    </div>

    <WsEmpty v-else preset="no-data" title="未找到运行记录" description="请从运行列表中选择一条记录" />
  </div>
</template>

<script setup lang="ts">
import WsIcon from '../../../../ui/WsIcon.vue'
import WsEmpty from '../../../../ui/WsEmpty.vue'
import RunTimelineItem from './run/RunTimelineItem.vue'

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
  run: RunState | null
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

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString()
}
</script>

<style scoped>
.workflow-run-view {
  padding: var(--space-4);
}

.run-detail {
  max-width: 720px;
}

.run-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-3);
}

.run-header h2 {
  margin: 0;
  font-size: var(--font-size-lg);
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

.run-meta {
  display: flex;
  gap: var(--space-4);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-bottom: var(--space-4);
}

.node-timeline {
  margin-bottom: var(--space-4);
}

.node-timeline h3 {
  font-size: var(--font-size-md);
  margin-bottom: var(--space-2);
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
</style>
