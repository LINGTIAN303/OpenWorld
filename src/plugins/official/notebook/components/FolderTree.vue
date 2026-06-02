<template>
  <div class="folder-tree">
    <div class="ft-item ft-all" :class="{ active: !selectedFolder }" @click="$emit('select', null)">
      <WsIcon name="folder" size="xs" /> 全部笔记
    </div>
    <div
      v-for="folder in folders"
      :key="folder.id"
      class="ft-item"
      :class="{ active: selectedFolder === folder.id }"
      @click="$emit('select', folder.id)"
    >
      <WsIcon name="folder" size="xs" /> {{ folder.name }}
    </div>
  </div>
</template>

<script setup lang="ts">
import WsIcon from '../../../../ui/WsIcon.vue'
defineProps<{ folders: { id: string; name: string }[]; selectedFolder: string | null }>()
defineEmits<{ select: [id: string | null] }>()
</script>

<style scoped>
.folder-tree { padding: 4px 0; }
.ft-item { padding: 4px 12px; font-size: var(--font-size-sm); color: var(--color-text-secondary); cursor: pointer; border-radius: 4px; margin: 1px 4px; transition: all 0.1s; }
.ft-item:hover { background: var(--color-bg-hover); }
.ft-item.active { background: color-mix(in srgb, var(--color-primary) 15%, transparent); color: var(--color-primary); }
</style>
