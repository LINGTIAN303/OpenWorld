<script setup lang="ts">
// NodePalette — 左侧节点调色板（拖拽源）
//
// Phase 3.6：列出所有 builtin 节点（来自 useNodeMetadata.list），按 category 分组。
// 后续 Phase 4 plugin 接入后，会同时列出 plugin 节点。

import { computed, onMounted } from 'vue'
import { useNodeMetadata } from '../composables/useNodeMetadata'
import type { NodeMetadata } from '../composables/useNodeMetadata'

const { list, load } = useNodeMetadata()

onMounted(() => {
  void load()
})

const grouped = computed(() => {
  const all = list.value ?? []
  const builtin = all.filter((n) => n.category === 'builtin')
  const plugin = all.filter((n) => n.category === 'plugin')
  return { builtin, plugin }
})

function onDragStart(e: DragEvent, node: NodeMetadata): void {
  if (!e.dataTransfer) return
  e.dataTransfer.setData('application/workflow-node-type', node.type)
  e.dataTransfer.effectAllowed = 'copy'
}

function colorFor(node: NodeMetadata): string {
  return node.color || '#64748b'
}
</script>

<template>
  <div class="node-palette">
    <h3 class="palette-title">节点</h3>
    <section v-if="grouped.builtin.length > 0">
      <h4 class="palette-section">内置</h4>
      <div class="palette-list">
        <button
          v-for="node in grouped.builtin"
          :key="node.type"
          class="palette-item"
          :style="{ borderLeftColor: colorFor(node) }"
          :title="node.description"
          draggable="true"
          @dragstart="onDragStart($event, node)"
        >
          <span class="palette-item-label">{{ node.label }}</span>
          <span class="palette-item-type">{{ node.type }}</span>
        </button>
      </div>
    </section>
    <section v-if="grouped.plugin.length > 0">
      <h4 class="palette-section">插件</h4>
      <div class="palette-list">
        <button
          v-for="node in grouped.plugin"
          :key="node.type"
          class="palette-item"
          :style="{ borderLeftColor: colorFor(node) }"
          :title="node.description"
          draggable="true"
          @dragstart="onDragStart($event, node)"
        >
          <span class="palette-item-label">{{ node.label }}</span>
          <span class="palette-item-type">{{ node.pluginId }}</span>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.node-palette {
  width: 220px;
  height: 100%;
  background: #f8fafc;
  border-right: 1px solid #e2e8f0;
  overflow-y: auto;
  padding: 12px;
  box-sizing: border-box;
}
.palette-title {
  font-size: 13px;
  font-weight: 600;
  margin: 0 0 12px 0;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.palette-section {
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  margin: 12px 0 6px 0;
  text-transform: uppercase;
}
.palette-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.palette-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 6px 8px 6px 10px;
  background: white;
  border: 1px solid #e2e8f0;
  border-left-width: 3px;
  border-radius: 4px;
  cursor: grab;
  text-align: left;
  font-family: inherit;
  font-size: 12px;
  transition: background 0.1s, border-color 0.1s;
}
.palette-item:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
}
.palette-item:active {
  cursor: grabbing;
}
.palette-item-label {
  font-weight: 500;
  color: #1e293b;
}
.palette-item-type {
  font-size: 10px;
  color: #94a3b8;
  font-family: ui-monospace, SFMono-Regular, monospace;
  margin-top: 1px;
}
</style>
