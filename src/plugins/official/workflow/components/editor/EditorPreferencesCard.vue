<script setup lang="ts">
// EditorPreferencesCard — 偏好设置主卡(P3)
//
// 整合 3 个子组件:EditorPreferencesSection × 3
//   1. 添加方式  (chips 多选)
//   2. 编辑方式  (grid 3 选 1)
//   3. 悬停延迟  (range,仅 editMethod=hover 时启用)
//
// 双向绑定 useEditorPreferences().value,Save 按钮 emit save 事件
// (实际持久化在 useEditorPreferences 内部 watch 已做,Save 主要是 UI 反馈)。

import WsCard from '@/ui/WsCard.vue'
import EditorPreferenceChips from './EditorPreferenceChips.vue'
import EditorPreferenceGrid from './EditorPreferenceGrid.vue'
import EditorPreferencesSection from './EditorPreferencesSection.vue'
import { useEditorPreferences } from '../../composables/useEditorPreferences'
import type { AddMethod, EditMethod } from '../../composables/useEditorPreferences'

const emit = defineEmits<{ save: [] }>()

const prefs = useEditorPreferences()

function onToggle(method: AddMethod): void {
  prefs.toggleAddMethod(method)
}

function onChange(method: EditMethod): void {
  prefs.setEditMethod(method)
}

function onHoverDelay(e: Event): void {
  const val = Number((e.target as HTMLInputElement).value)
  prefs.value.hoverDelayMs = val
}

function onSave(): void {
  emit('save')
}
</script>

<template>
  <WsCard class="pref-card" data-testid="pref-card">
    <template #header>
      <h3 class="pref-card-title">编辑器偏好</h3>
    </template>
    <div class="pref-body">
      <EditorPreferencesSection
        title="添加方式"
        description="选择如何向画布添加节点(可多选)"
      >
        <EditorPreferenceChips
          :value="prefs.value.addMethods"
          @toggle="onToggle"
        />
      </EditorPreferencesSection>

      <EditorPreferencesSection
        title="编辑方式"
        description="选择节点的编辑交互"
      >
        <EditorPreferenceGrid
          :value="prefs.value.editMethod"
          @change="onChange"
        />
      </EditorPreferencesSection>

      <EditorPreferencesSection
        title="悬停延迟"
        description="悬停触发浮层前的等待时间(毫秒)"
      >
        <input
          type="range"
          data-testid="hover-delay"
          min="100"
          max="1000"
          step="50"
          :value="prefs.value.hoverDelayMs"
          :disabled="prefs.value.editMethod !== 'hover'"
          class="pref-range"
          @input="onHoverDelay"
        />
        <span class="pref-range-value">{{ prefs.value.hoverDelayMs }} ms</span>
      </EditorPreferencesSection>
    </div>
    <template #footer>
      <button
        type="button"
        class="pref-save-btn"
        data-testid="pref-save"
        @click="onSave"
      >
        保存
      </button>
    </template>
  </WsCard>
</template>

<style scoped>
.pref-card {
  width: 100%;
  max-width: 640px;
}
.pref-card-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}
.pref-body {
  display: flex;
  flex-direction: column;
}
.pref-range {
  width: 100%;
  accent-color: var(--color-primary);
}
.pref-range:disabled {
  opacity: 0.4;
}
.pref-range-value {
  font-size: 12px;
  color: var(--color-text-tertiary);
  font-family: ui-monospace, SFMono-Regular, monospace;
  margin-left: 8px;
}
.pref-save-btn {
  background: var(--color-primary);
  color: var(--color-text-on-primary, white);
  border: none;
  border-radius: 4px;
  padding: 6px 16px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.pref-save-btn:hover {
  filter: brightness(1.1);
}
</style>
