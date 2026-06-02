<script setup lang="ts">
// NodePalette — 左侧节点调色板（拖拽源 + 点击添加）
//
// P3 升级:
//   - 加 emit('add-node', type) 支持 click 添加
//   - data-testid="palette-entry-{type}" 便于测试 / 拖拽
//   - 集成 WsIcon(替换文字 label)
//   - CSS token 化(去掉 hardcoded 颜色)

import { computed, onMounted } from 'vue'
import { useNodeMetadata } from '../composables/useNodeMetadata'
import type { NodeMetadata } from '../composables/useNodeMetadata'
import WsIcon from '@/ui/WsIcon.vue'

const emit = defineEmits<{ 'add-node': [type: string] }>()

const { list, load } = useNodeMetadata()

onMounted(() => {
  void load()
})

const grouped = computed(() => {
  const all = list.value ?? []
  const builtin = all.filter(n => n.category === 'builtin')
  const plugin = all.filter(n => n.category === 'plugin')
  return { builtin, plugin }
})

function onDragStart(e: DragEvent, node: NodeMetadata): void {
  if (!e.dataTransfer) return
  e.dataTransfer.setData('application/workflow-node-type', node.type)
  e.dataTransfer.effectAllowed = 'copy'
}

function onClick(node: NodeMetadata): void {
  emit('add-node', node.type)
}
</script>

<template>
  <div class="node-palette">
    <h3 class="palette-title">节点</h3>
    <section v-if="grouped.builtin.length > 0">
      <h4 class="palette-section">内置</h4>
      <ul class="palette-list">
        <li
          v-for="node in grouped.builtin"
          :key="node.type"
          :data-testid="`palette-entry-${node.type}`"
          class="palette-entry"
          draggable="true"
          @click="onClick(node)"
          @dragstart="(e) => onDragStart(e, node)"
        >
          <WsIcon :name="node.icon || 'box'" size="sm" />
          <span class="palette-entry-label">{{ node.label || node.type }}</span>
        </li>
      </ul>
    </section>
    <section v-if="grouped.plugin.length > 0">
      <h4 class="palette-section">插件</h4>
      <ul class="palette-list">
        <li
          v-for="node in grouped.plugin"
          :key="node.type"
          :data-testid="`palette-entry-${node.type}`"
          class="palette-entry"
          draggable="true"
          @click="onClick(node)"
          @dragstart="(e) => onDragStart(e, node)"
        >
          <WsIcon :name="node.icon || 'box'" size="sm" />
          <span class="palette-entry-label">{{ node.label || node.type }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.node-palette {
  width: 220px;
  height: 100%;
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border-default);
  overflow-y: auto;
  padding: 12px;
  box-sizing: border-box;
}
.palette-title {
  font-size: 13px;
  font-weight: 600;
  margin: 0 0 12px 0;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.palette-section {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-tertiary);
  margin: 12px 0 6px 0;
  text-transform: uppercase;
}
.palette-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.palette-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-default);
  border-left-width: 3px;
  border-left-color: var(--node-color, var(--color-accent-gray-subtle));
  border-radius: 4px;
  cursor: grab;
  font-family: inherit;
  font-size: 12px;
  color: var(--color-text-primary);
  transition: background 0.1s, border-color 0.1s;
}
.palette-entry:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-border-strong);
}
.palette-entry:active {
  cursor: grabbing;
}
.palette-entry-label {
  font-weight: 500;
}
</style>
