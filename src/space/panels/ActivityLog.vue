<template>
  <div class="activity-log">
    <div class="panel-header">
      <h3 class="panel-title">活动日志</h3>
      <div class="panel-header-actions">
        <button v-if="logs.length > 0" class="panel-action-btn" @click="clearLogs" title="清空"><WsIcon name="trash" size="xs" /></button>
        <button class="panel-close-btn" @click="emit('close')" title="关闭">✕</button>
      </div>
    </div>
    <div class="panel-body">
      <div v-if="logs.length === 0" class="panel-empty">暂无活动记录</div>
      <div v-for="log in logs" :key="log.id" class="log-item" :class="`log-${log.type}`" @click="toggleDetail(log.id)">
        <span class="log-icon"><WsIcon :name="getLogIcon(log.type)" size="xs" /></span>
        <div class="log-content">
          <span class="log-message">{{ log.message }}</span>
          <span class="log-time">{{ formatTime(log.timestamp) }}</span>
          <div v-if="expandedId === log.id && log.detail" class="log-detail">{{ log.detail }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import WsIcon from '../../ui/WsIcon.vue'
import { useActivityLog } from '../composables/useActivityLog'

const emit = defineEmits<{ close: [] }>()

const { logs, clearLogs } = useActivityLog()
const expandedId = ref<string | null>(null)

function getLogIcon(type: string): string {
  switch (type) {
    case 'info': return 'chat'
    case 'warning': return 'alert'
    case 'knowledge': return 'book'
    case 'memory': return 'brain'
    case 'error': return 'x-circle'
    default: return 'clipboard-list'
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
}

function toggleDetail(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}
</script>

<style scoped>
.activity-log {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: rgba(10, 10, 20, 0.08);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-left: 1px solid var(--color-border);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--color-border);
}

.panel-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.panel-close-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
}
.panel-close-btn:hover {
  background: var(--color-surface);
  color: var(--color-text);
}

.panel-action-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
}
.panel-action-btn:hover {
  background: var(--color-surface);
  color: var(--color-text);
}

.panel-title {
  font-size: var(--font-size-sm);
  font-weight: 600;
  margin: 0;
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 14px;
}

.panel-empty {
  text-align: center;
  color: var(--color-text-tertiary);
  padding: 24px;
  font-size: var(--font-size-xs);
}

.log-item {
  display: flex;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  margin-bottom: 4px;
  font-size: var(--font-size-xs);
  cursor: pointer;
  transition: background 0.1s;
}
.log-item:hover {
  background: var(--color-surface);
}

.log-item.log-error {
  border-left: 3px solid #e53e3e;
}
.log-item.log-tool {
  border-left: 3px solid var(--color-primary);
}
.log-item.log-knowledge {
  border-left: 3px solid #38a169;
}
.log-item.log-memory {
  border-left: 3px solid #d69e2e;
}

.log-icon {
  font-size: var(--font-size-base);
  flex-shrink: 0;
}

.log-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.log-message {
  color: var(--color-text);
  line-height: 1.4;
}

.log-time {
  color: var(--color-text-tertiary);
  font-size: var(--font-size-2xs);
  font-family: monospace;
}

.log-detail {
  margin-top: 4px;
  padding: 6px 8px;
  background: var(--color-surface);
  border-radius: 4px;
  font-size: var(--font-size-2xs);
  color: var(--color-text-secondary);
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 120px;
  overflow-y: auto;
}
</style>
