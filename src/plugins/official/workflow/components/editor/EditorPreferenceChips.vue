<script setup lang="ts">
// EditorPreferenceChips — 3 个 add method 多选 chips
//
// P3 偏好设置:click / drag / contextmenu 三个 add method 多选。
// value: 当前启用的方法列表,active = value.includes(m)。

import type { AddMethod } from '../../composables/useEditorPreferences'

defineProps<{ value: AddMethod[] }>()
const emit = defineEmits<{ toggle: [method: AddMethod] }>()

const ALL: AddMethod[] = ['click', 'drag', 'contextmenu']
const LABEL: Record<AddMethod, string> = {
  click: '点击',
  drag: '拖拽',
  contextmenu: '右键',
}
</script>

<template>
  <div class="pref-chips">
    <button
      v-for="m in ALL"
      :key="m"
      :data-testid="`chip-${m}`"
      :class="['pref-chip', { active: value.includes(m) }]"
      :aria-pressed="value.includes(m)"
      type="button"
      @click="emit('toggle', m)"
    >
      {{ LABEL[m] }}
    </button>
  </div>
</template>

<style scoped>
.pref-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.pref-chip {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-default);
  border-radius: 999px;
  padding: 4px 12px;
  font: inherit;
  font-size: 12px;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: background 0.1s, border-color 0.1s, color 0.1s;
}
.pref-chip:hover {
  background: var(--color-bg-hover);
}
.pref-chip.active {
  background: var(--color-primary-subtle);
  border-color: var(--color-primary);
  color: var(--color-primary);
}
</style>
