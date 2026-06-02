<script setup lang="ts">
// BaseNodeRenderer — 14 个节点类型共用的卡片布局
//
// 14 个 type-specific renderer（start.vue / skill.vue / ...）都 render 这个组件，
// 只通过 `iconEmoji` + `summary` 区分视觉。这样 14 个 wrapper 文件可保持极薄。
//
// 布局：
//   ┌──────────────────────────────┐
//   │ [色条]  ⏯️ Skill             │ ← header (icon + label) + meta.color 左边条
//   │         node-id              │ ← id 灰色小字
//   │ 摘要：调用 greet.skill…       │ ← type 特定摘要
//   └──────────────────────────────┘

import { computed } from 'vue'
import type { EditorNode } from '../composables/editor-types'
import type { NodeMetadata } from '../composables/useNodeMetadata'

const props = defineProps<{
  node: EditorNode
  meta: NodeMetadata | null
  iconEmoji: string
  summary: string
  selected: boolean
}>()

const accent = computed(() => props.meta?.color ?? '#64748b')
</script>

<template>
  <div
    :class="['base-node', { selected }]"
    :style="{ '--accent': accent }"
  >
    <div class="base-node-bar" />
    <div class="base-node-body">
      <div class="base-node-header">
        <span class="base-node-icon">{{ iconEmoji }}</span>
        <span class="base-node-label">{{ meta?.label ?? node.type }}</span>
      </div>
      <div class="base-node-id">{{ node.id }}</div>
      <div v-if="summary" class="base-node-summary">{{ summary }}</div>
    </div>
  </div>
</template>

<style scoped>
.base-node {
  position: relative;
  display: flex;
  background: white;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  min-width: 180px;
  max-width: 240px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  overflow: hidden;
  font-family: inherit;
  font-size: 11px;
  text-align: left;
  cursor: pointer;
  transition: box-shadow 0.1s, border-color 0.1s;
}
.base-node:hover {
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}
.base-node.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 25%, transparent);
}
.base-node-bar {
  width: 4px;
  background: var(--accent);
  flex-shrink: 0;
}
.base-node-body {
  flex: 1;
  padding: 6px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.base-node-header {
  display: flex;
  align-items: center;
  gap: 6px;
}
.base-node-icon {
  font-size: 13px;
  line-height: 1;
}
.base-node-label {
  font-weight: 600;
  color: #1e293b;
  font-size: 12px;
}
.base-node-id {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 10px;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.base-node-summary {
  margin-top: 4px;
  font-size: 10px;
  color: #475569;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
}
</style>
