<template>
  <div class="mindmap-toolbar">
    <input :value="searchQuery" class="search-input" placeholder="搜索节点..." @input="$emit('update:searchQuery', ($event.target as HTMLInputElement).value)" />

    <CustomDropdown :model-value="layout" :options="layoutOptions" class="layout-dropdown" @update:model-value="$emit('update:layout', $event)" />

    <div class="type-filters">
      <label v-for="type in typeFilters" :key="type.value" class="type-chip"
        :class="{ active: enabledTypes.has(type.value) }"
        :style="{ borderColor: type.color, background: enabledTypes.has(type.value) ? type.color + '18' : 'transparent' }">
        <input type="checkbox" :checked="enabledTypes.has(type.value)" @change="toggleType(type.value)" />
        {{ type.label }}
      </label>
    </div>

    <div class="toolbar-actions">
      <div class="action-group">
        <button v-if="canGoBack" class="icon-btn" @click="$emit('go-back')" title="返回上层 (Esc)">←</button>
        <button class="icon-btn" :class="{ active: detailPanelVisible }" @click="$emit('toggle-detail')" title="详情侧栏 (I)"><WsIcon name="outline" size="sm" /></button>
      </div>
      <div class="action-group">
        <button class="icon-btn" :class="{ active: editMode }" @click="$emit('toggle-edit-mode')" title="编辑模式 (E)"><WsIcon name="edit" size="sm" /></button>
        <button class="icon-btn" :class="{ active: freeDrawMode }" @click="$emit('toggle-free-draw')" title="自由绘图 (D)"><WsIcon name="brush" size="sm" /></button>
        <button class="icon-btn" @click="$emit('toggle-ai-suggest')" title="AI 关系建议 (Ctrl+J)"><WsIcon name="concept" size="sm" /></button>
        <button v-if="editMode" class="icon-btn" @click="$emit('add-textbox')" title="添加文本框"><WsIcon name="edit" size="sm" /></button>
        <button v-if="editMode" class="icon-btn" @click="$emit('add-image')" title="添加图片"><WsIcon name="image" size="sm" /></button>
        <button v-if="editMode" class="icon-btn" @click="$emit('add-note')" title="添加备注"><WsIcon name="outline" size="sm" /></button>
        <button v-if="editMode" class="icon-btn" @click="$emit('add-link')" title="添加链接"><WsIcon name="link" size="sm" /></button>
        <button v-if="editMode" class="icon-btn" @click="$emit('add-group')" title="添加分组"><WsIcon name="item" size="sm" /></button>
      </div>
      <div class="action-group">
        <button class="icon-btn" @click="$emit('add-center')" title="添加中心节点" aria-label="添加中心节点"><WsIcon name="star" size="sm" /></button>
        <button class="icon-btn" @click="$emit('fit')" title="适应视图" aria-label="适应视图">⊞</button>
        <button class="icon-btn" @click="$emit('zoom-in')" title="放大" aria-label="放大">＋</button>
        <button class="icon-btn" @click="$emit('zoom-out')" title="缩小" aria-label="缩小">－</button>
        <span class="zoom-level">{{ zoomLevel }}%</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CustomDropdown } from '@worldsmith/ui-kit'
import { LAYOUT_OPTIONS } from '../mindmapConfig'
import WsIcon from '../../../../ui/WsIcon.vue'

const props = defineProps<{
  searchQuery: string
  layout: string
  enabledTypes: Set<string>
  editMode: boolean
  freeDrawMode: boolean
  zoomLevel: number
  canGoBack: boolean
  detailPanelVisible: boolean
}>()

const emit = defineEmits<{
  'update:searchQuery': [value: string]
  'update:layout': [value: string]
  'update:enabledTypes': [value: Set<string>]
  'toggle-edit-mode': []
  'toggle-free-draw': []
  'toggle-ai-suggest': []
  'add-textbox': []
  'add-image': []
  'add-note': []
  'add-link': []
  'add-group': []
  'add-center': []
  fit: []
  'zoom-in': []
  'zoom-out': []
  'go-back': []
  'toggle-detail': []
}>()

const layoutOptions = LAYOUT_OPTIONS

const typeFilters = [
  { value: 'character', label: '角色', color: '#4a6cf7' },
  { value: 'region', label: '区域', color: '#27ae60' },
  { value: 'event', label: '事件', color: '#e67e22' },
  { value: 'organization', label: '势力', color: '#e74c3c' },
  { value: 'concept', label: '概念', color: '#9b59b6' },
  { value: 'item', label: '道具', color: '#f39c12' },
  { value: 'textbox', label: '文本框', color: '#eab308' },
  { value: 'image', label: '图片', color: '#999' },
  { value: 'note', label: '备注', color: '#ca8a04' },
  { value: 'link', label: '链接', color: '#3b82f6' },
  { value: 'group', label: '分组', color: '#999' },
]

function toggleType(type: string) {
  const next = new Set(props.enabledTypes)
  if (next.has(type)) next.delete(type)
  else next.add(type)
  emit('update:enabledTypes', next)
}
</script>

<style scoped>
.mindmap-toolbar {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 12px; background: var(--card-bg);
  border-bottom: 1px solid var(--border-color); flex-wrap: wrap;
}
.type-filters { display: flex; gap: 4px; flex-wrap: wrap; }
.type-chip {
  display: flex; align-items: center; gap: 3px;
  padding: 2px 6px; border-radius: 4px; border: 1px solid;
  font-size: var(--font-size-xs); cursor: pointer; white-space: nowrap;
}
.type-chip input { width: 12px; height: 12px; margin: 0; cursor: pointer; accent-color: var(--primary, #4f46e5); }
.toolbar-actions { display: flex; gap: 6px; margin-left: auto; align-items: center; }
.action-group { display: flex; gap: 2px; align-items: center; }
.icon-btn {
  width: 28px; height: 28px; border: 1px solid var(--border-color);
  border-radius: var(--radius-sm); background: transparent; cursor: pointer;
  font-size: var(--font-size-base); display: flex; align-items: center; justify-content: center;
  transition: all var(--transition-fast);
}
.icon-btn:hover { background: var(--hover-bg); }
.icon-btn.active { background: var(--primary-light); border-color: var(--primary); color: var(--primary); }
.zoom-level { font-size: var(--font-size-xs); color: var(--text-tertiary); min-width: 36px; text-align: center; }
</style>