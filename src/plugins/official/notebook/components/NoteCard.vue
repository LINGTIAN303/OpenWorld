<template>
  <div class="note-card" @click="$emit('click', note.id)">
    <div class="nc-type-icon"><WsIcon :name="typeIcon" size="sm" /></div>
    <div class="nc-content">
      <div class="nc-name">{{ note.name }}</div>
      <div class="nc-preview">{{ preview }}</div>
    </div>
    <div v-if="note.tags?.length" class="nc-tags">
      <span v-for="tag in note.tags.slice(0, 2)" :key="tag" class="nc-tag">{{ tag }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import WsIcon from '../../../../ui/WsIcon.vue'
import { NOTE_TYPES } from '../notebookConfig'

const props = defineProps<{ note: any }>()
defineEmits<{ click: [id: string] }>()

const typeIcon = computed(() => {
  const t = props.note.properties?.noteType || 'markdown'
  return NOTE_TYPES.find(n => n.value === t)?.icon || 'edit'
})

const preview = computed(() =>
  (props.note.properties?.content || '').slice(0, 60)
)
</script>

<style scoped>
.note-card { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border: 1px solid var(--color-border-subtle); border-radius: 6px; cursor: pointer; transition: all 0.15s; }
.note-card:hover { border-color: var(--color-primary); }
.nc-type-icon { font-size: var(--font-size-xl); }
.nc-content { flex: 1; min-width: 0; }
.nc-name { font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); color: var(--color-text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nc-preview { font-size: var(--font-size-xs); color: var(--color-text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nc-tags { display: flex; gap: 3px; }
.nc-tag { font-size: var(--text-micro-font-size); padding: 1px 5px; border-radius: 3px; background: color-mix(in srgb, var(--color-primary) 15%, transparent); color: var(--color-primary); }
</style>
