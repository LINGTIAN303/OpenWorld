<template>
  <div class="node-panel">
    <div class="search-box">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="搜索节点..."
        class="search-input"
      />
    </div>
    <div class="node-categories">
      <div v-for="group in filteredGroups" :key="group.key" class="node-group">
        <div class="group-header" @click="toggleGroup(group.key)">
          <span class="group-icon">{{ group.icon }}</span>
          <span class="group-label">{{ group.label }}</span>
          <span class="group-toggle">{{ collapsedGroups[group.key] ? '▸' : '▾' }}</span>
        </div>
        <div v-show="!collapsedGroups[group.key]" class="group-items">
          <div
            v-for="nodeType in getGroupItems(group.key)"
            :key="nodeType.type"
            class="node-type-item"
            :style="{ borderLeftColor: nodeType.color }"
            draggable="true"
            @dragstart="handleDragStart($event, nodeType.type)"
            @click="$emit('add-node', nodeType.type)"
          >
            <div class="node-info">
              <span class="type-icon">{{ nodeType.icon }}</span>
              <span class="type-label">{{ nodeType.label_zh }}</span>
            </div>
            <div class="type-desc">{{ nodeType.description_zh }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { NODE_GROUPS } from '../node-metadata'
import type { NodeMetadata } from '../node-metadata'

const props = defineProps<{
  availableTypes: NodeMetadata[]
}>()

defineEmits<{
  'add-node': [type: string]
}>()

const searchQuery = ref('')
const collapsedGroups = reactive<Record<string, boolean>>({})

function toggleGroup(key: string) {
  collapsedGroups[key] = !collapsedGroups[key]
}

function matchesSearch(node: NodeMetadata): boolean {
  if (!searchQuery.value.trim()) return true
  const q = searchQuery.value.toLowerCase()
  return (
    node.label_zh.toLowerCase().includes(q) ||
    node.label.toLowerCase().includes(q) ||
    node.description_zh.toLowerCase().includes(q) ||
    node.type.toLowerCase().includes(q)
  )
}

function getGroupItems(groupKey: string): NodeMetadata[] {
  return props.availableTypes.filter(n => n.group === groupKey && matchesSearch(n))
}

const filteredGroups = computed(() => {
  return NODE_GROUPS.filter(g => getGroupItems(g.key).length > 0)
})

function handleDragStart(event: DragEvent, type: string) {
  event.dataTransfer?.setData('application/workflow-node-type', type)
  event.dataTransfer!.effectAllowed = 'move'
}
</script>

<style scoped>
.node-panel {
  width: 220px;
  border-right: 1px solid var(--border-color, #e5e7eb);
  background: var(--bg-primary, white);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.search-box {
  padding: 10px 10px 6px;
}

.search-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 6px;
  font-size: var(--font-size-sm);
  outline: none;
  background: var(--color-bg-surface);
  color: var(--text-primary, #1f2937);
  box-sizing: border-box;
}

.search-input:focus {
  border-color: #94a3b8;
}

.search-input::placeholder {
  color: #94a3b8;
}

.node-categories {
  flex: 1;
  overflow-y: auto;
  padding: 0 10px 10px;
}

.node-group {
  margin-bottom: 8px;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 4px;
  cursor: pointer;
  user-select: none;
}

.group-icon {
  font-size: var(--font-size-sm);
}

.group-label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  flex: 1;
}

.group-toggle {
  font-size: var(--font-size-xs);
  color: #94a3b8;
}

.group-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.node-type-item {
  padding: 8px 10px;
  border-left: 3px solid transparent;
  border-radius: 6px;
  background: #f8fafc;
  cursor: pointer;
  transition: background 0.15s, box-shadow 0.15s;
}

.node-type-item:hover {
  background: #f1f5f9;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.node-info {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}

.type-icon {
  font-size: var(--font-size-base);
  line-height: 1;
}

.type-label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary, #1f2937);
}

.type-desc {
  font-size: var(--font-size-xs);
  color: #94a3b8;
  line-height: 1.4;
  padding-left: 20px;
}
</style>
