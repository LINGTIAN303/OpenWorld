<template>
  <div class="nb-board">
    <div class="nb-board-grid">
      <div
        v-for="note in notes"
        :key="note.id"
        class="nb-board-card"
        @click="$emit('select', note.id)"
      >
        <div class="nb-bc-icon"><WsIcon :name="getNoteIcon(note)" size="sm" /></div>
        <div class="nb-bc-name">{{ note.name }}</div>
        <div class="nb-bc-preview">{{ (note.properties?.content || '').slice(0, 80) }}</div>
        <div v-if="note.tags?.length" class="nb-bc-tags">
          <span v-for="tag in note.tags.slice(0, 3)" :key="tag" class="nb-bc-tag">{{ tag }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { NOTE_TYPES } from '../notebookConfig'
import WsIcon from '../../../../ui/WsIcon.vue'

defineProps<{ notes: any[] }>()
defineEmits<{ select: [id: string] }>()

function getNoteIcon(note: any): string {
  const noteType = note.properties?.noteType || 'markdown'
  return NOTE_TYPES.find(t => t.value === noteType)?.icon || 'edit'
}
</script>

<style scoped>
.nb-board { padding: 16px; overflow: auto; }
.nb-board-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
.nb-board-card { background: var(--color-bg-elevated); border: 1px solid var(--color-border-subtle); border-radius: 8px; padding: 12px; cursor: pointer; transition: all 0.15s; }
.nb-board-card:hover { border-color: var(--color-primary); transform: translateY(-1px); }
.nb-bc-icon { font-size: var(--font-size-xl); margin-bottom: 6px; }
.nb-bc-name { font-size: var(--font-size-sm); font-weight: var(--font-weight-semibold); color: var(--color-text-primary); margin-bottom: 4px; }
.nb-bc-preview { font-size: var(--font-size-xs); color: var(--color-text-tertiary); line-height: 1.4; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
.nb-bc-tags { display: flex; gap: 4px; margin-top: 6px; flex-wrap: wrap; }
.nb-bc-tag { font-size: var(--font-size-xs); padding: 1px 6px; border-radius: 3px; background: color-mix(in srgb, var(--color-primary) 15%, transparent); color: var(--color-primary); }
</style>
