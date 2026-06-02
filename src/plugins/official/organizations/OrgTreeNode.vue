<template>
  <GenericTreeView
    :node="node"
    :depth="depth"
    :selected-id="selectedId"
    :show-checkbox="true"
    :selected-ids="selectedIds"
    @select="(e: any) => $emit('select', e)"
    @toggle-select="(id: string) => $emit('toggle-select', id)"
    @add-child="(e: any) => $emit('add-child', e)"
  >
    <template #icon="{ entity }">
      <WsIcon :name="orgIcon(entity)" size="xs" />
    </template>
    <template #typeLabel="{ entity }">
      {{ entity.properties.orgType as string || '' }}
    </template>
    <template #actions="{ entity }">
      <button class="tree-add" @click.stop="$emit('add-child', entity)" title="添加下属势力">＋</button>
    </template>
  </GenericTreeView>
</template>

<script setup lang="ts">
import { GenericTreeView, type TreeNodeData } from '@worldsmith/ui-kit'
import WsIcon from '../../../ui/WsIcon.vue'

const props = defineProps<{
  node: TreeNodeData
  depth: number
  selectedId?: string
  selectedIds?: Set<string>
}>()

defineEmits<{
  select: [entity: any]
  'toggle-select': [id: string]
  'add-child': [entity: any]
}>()

function orgIcon(entity: any): string {
  const t = entity.properties.orgType as string
  const icons: Record<string, string> = {
    '王国': 'war', '帝国': 'war', '部落': 'location', '教会': 'building',
    '公会': 'settings', '佣兵团': 'war', '学派': 'manuscript', '家族': 'home',
    '商团': 'tag', '联盟': 'link',
  }
  return icons[t] || 'war'
}
</script>

<style scoped>
.tree-add {
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: var(--font-size-base);
  color: var(--text-tertiary);
  opacity: 0;
  border-radius: 4px;
  transition: opacity 0.1s;
}
.tree-row:hover .tree-add {
  opacity: 1;
}
.tree-add:hover {
  background: var(--bg);
  color: var(--primary);
}
</style>
