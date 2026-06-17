<template>
  <div class="block-entity-card">
    <div class="block-toggle" @click="expanded = !expanded">
      <span class="block-icon">{{ entityIcon }}</span>
      <span class="block-title">{{ block.entityType }}: {{ block.name }}</span>
      <span class="block-meta">{{ block.entityType }}</span>
      <span class="block-arrow">{{ expanded ? '▾ 点击收起' : '▸ 点击展开' }}</span>
    </div>
    <Transition name="block-expand">
      <div v-if="expanded" class="block-content">
        <div class="ec-header">
          <span class="ec-icon">{{ entityIcon }}</span>
          <div class="ec-info">
            <span class="ec-name">{{ block.name }}</span>
            <span class="ec-type">{{ block.entityType }}</span>
          </div>
        </div>
        <p v-if="block.description" class="ec-desc">{{ block.description }}</p>
        <div v-if="block.tags?.length" class="ec-tags">
          <span v-for="tag in block.tags" :key="tag" class="ec-tag">{{ tag }}</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { EntityCardBlock } from '@agent/index'

const props = defineProps<{
  block: EntityCardBlock
}>()

const expanded = ref(false)

const ENTITY_ICONS: Record<string, string> = {
  character: '👤', region: '🗺️', item: '⚔️', building: '🏗️',
  organization: '🏛️', concept: '💡', culture: '🎭', language: '🗣️',
  magic: '✨', species: '🐾', plant: '🌿', weapon: '🗡️',
  event: '📅', manuscript: '📜', inspiration: '💎', conflict: '⚔️',
}

const entityIcon = computed(() => ENTITY_ICONS[props.block.entityType] || '📦')
</script>

<style scoped>
.block-entity-card { margin: 4px 0; }
.block-toggle {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px; border-radius: 14px; cursor: pointer;
  background: rgba(108,92,231,0.08); border: 1px solid rgba(108,92,231,0.2);
  transition: border-color 0.15s; font-size: 12px;
}
.block-toggle:hover { border-color: rgba(108,92,231,0.5); }
.block-icon { font-size: 13px; }
.block-title { font-size: 12px; color: var(--agent-accent, #b388ff); font-weight: 500; }
.block-meta { font-size: 11px; color: var(--agent-text-tertiary, #888); }
.block-arrow { font-size: 11px; color: var(--agent-text-tertiary, #888); }
.block-content {
  padding: 10px 12px; margin-top: 4px;
  background: rgba(0,0,0,0.15); border: 1px solid rgba(108,92,231,0.2);
  border-radius: 8px;
}
.ec-header { display: flex; align-items: center; gap: 8px; }
.ec-icon { font-size: 20px; }
.ec-info { display: flex; flex-direction: column; gap: 2px; }
.ec-name { font-size: 14px; font-weight: 600; color: var(--agent-text, #e0e0e0); }
.ec-type { font-size: 11px; color: var(--agent-text-tertiary, #888); }
.ec-desc { font-size: 12px; color: var(--agent-text-secondary, #aaa); margin: 6px 0 0; line-height: 1.4; }
.ec-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.ec-tag {
  font-size: 11px; padding: 1px 6px; border-radius: 3px;
  background: rgba(108,92,231,0.15); color: var(--agent-accent, #b388ff);
}
.block-expand-enter-active, .block-expand-leave-active {
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease, opacity 0.2s ease, filter 0.2s ease; overflow: hidden;
}
.block-expand-enter-from, .block-expand-leave-to {
  opacity: 0;
}
</style>
