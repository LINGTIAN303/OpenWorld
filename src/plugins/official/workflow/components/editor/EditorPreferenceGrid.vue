<script setup lang="ts">
// EditorPreferenceGrid — 3 列 edit method 网格
//
// P3 偏好设置:sidebar / inline / hover 三个 edit method 三选一。

import type { EditMethod } from '../../composables/useEditorPreferences'

defineProps<{ value: EditMethod }>()
const emit = defineEmits<{ change: [method: EditMethod] }>()

const OPTIONS: Array<{ key: EditMethod; label: string; desc: string }> = [
  { key: 'sidebar', label: '侧边栏', desc: '右侧 360px 检查器,适合大屏' },
  { key: 'inline', label: '内联', desc: '节点下方展开,适合中屏' },
  { key: 'hover', label: '悬浮', desc: 'hover 触发浮层,适合大屏' },
]
</script>

<template>
  <div class="pref-grid">
    <button
      v-for="o in OPTIONS"
      :key="o.key"
      :data-testid="`grid-${o.key}`"
      :class="['pref-grid-cell', { active: value === o.key }]"
      type="button"
      @click="emit('change', o.key)"
    >
      <span class="pref-grid-label">{{ o.label }}</span>
      <span class="pref-grid-desc">{{ o.desc }}</span>
    </button>
  </div>
</template>

<style scoped>
.pref-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.pref-grid-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 10px 12px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
  text-align: left;
  color: var(--color-text-primary);
  transition: background 0.1s, border-color 0.1s;
}
.pref-grid-cell:hover {
  background: var(--color-bg-hover);
}
.pref-grid-cell.active {
  background: var(--color-primary-subtle);
  border-color: var(--color-primary);
}
.pref-grid-label {
  font-size: 13px;
  font-weight: 500;
}
.pref-grid-desc {
  font-size: 11px;
  color: var(--color-text-tertiary);
  line-height: 1.4;
}
</style>
