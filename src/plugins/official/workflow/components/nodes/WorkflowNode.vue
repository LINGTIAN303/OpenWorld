<template>
  <div
    class="workflow-node"
    :class="[statusClass, { selected: data.selected }]"
    :style="nodeStyle"
    :title="tooltip"
  >
    <div class="node-header" :style="headerStyle">
      <span class="node-icon">{{ data.icon }}</span>
      <span class="node-label">{{ data.label }}</span>
      <span class="node-type-badge">{{ data.type }}</span>
    </div>
    <div class="node-body" v-if="displayConfig.length > 0">
      <div v-for="item in displayConfig" :key="item.key" class="config-item">
        <span class="config-key">{{ item.key }}</span>
        <span class="config-value">{{ truncate(String(item.value), 20) }}</span>
      </div>
    </div>
    <span v-if="data.status === 'success'" class="status-badge success">✓</span>
    <span v-if="data.status === 'failed'" class="status-badge failed">✕</span>
    <Handle type="target" :position="Position.Left" />
    <Handle type="source" :position="Position.Right" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { EditorNodeData } from '../../node-metadata'
import { builtinNodeMetadata } from '../../node-metadata'

const props = defineProps<{
  id: string
  data: EditorNodeData & { selected?: boolean; status?: 'idle' | 'running' | 'success' | 'failed' }
}>()

const nodeStyle = computed(() => ({
  '--node-color': props.data.color,
}))

const headerStyle = computed(() => ({
  backgroundColor: props.data.color + '20',
  borderColor: props.data.color,
}))

const statusClass = computed(() => {
  return props.data.status ? `status-${props.data.status}` : 'status-idle'
})

const tooltip = computed(() => {
  const meta = builtinNodeMetadata.find(m => m.type === props.data.type)
  return meta?.description_zh || ''
})

const displayConfig = computed(() => {
  if (!props.data.config) return []
  const result: { key: string; value: unknown }[] = []
  for (const [k, v] of Object.entries(props.data.config)) {
    if (k.startsWith('_')) continue
    if (v === null || v === undefined || v === '') continue
    result.push({ key: k, value: v })
    if (result.length >= 2) break
  }
  return result
})

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '...' : str
}
</script>

<style scoped>
.workflow-node {
  background: var(--color-bg-surface);
  border: 2px solid var(--node-color, #6B7280);
  border-radius: 8px;
  min-width: 160px;
  max-width: 240px;
  font-size: var(--font-size-sm);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  transition: box-shadow 0.15s, border-color 0.15s;
  position: relative;
}

.workflow-node.selected {
  box-shadow: 0 0 0 2px var(--node-color, #3b82f6), 0 4px 12px rgba(0, 0, 0, 0.15);
}

.workflow-node.status-idle {
  border-color: var(--node-color, #6B7280);
}

.workflow-node.status-running {
  border-color: #3B82F6;
  animation: ws-card-pulse 1.5s ease-in-out infinite;
}

.workflow-node.status-success {
  border-color: #22C55E;
}

.workflow-node.status-failed {
  border-color: #EF4444;
}

.node-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 6px 6px 0 0;
  border-bottom: 1px solid var(--node-color, #6B7280);
}

.node-icon {
  font-size: var(--font-size-base);
}

.node-label {
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-sm);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-type-badge {
  font-size: var(--text-micro-font-size);
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--node-color, #6B7280);
  color: white;
  flex-shrink: 0;
}

.node-body {
  padding: 6px 10px;
}

.config-item {
  display: flex;
  gap: 4px;
  padding: 2px 0;
  font-size: var(--font-size-xs);
}

.config-key {
  color: var(--text-secondary, #6b7280);
  min-width: 50px;
  flex-shrink: 0;
}

.config-value {
  color: var(--text-primary, #1f2937);
  word-break: break-all;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  color: white;
  line-height: 1;
}

.status-badge.success {
  background: var(--color-success);
}

.status-badge.failed {
  background: var(--color-danger);
}
</style>
