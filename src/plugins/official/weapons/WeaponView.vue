<template>
  <div class="weapon-view">
    <div v-if="viewMode === 'lineage'" class="wv-lineage">
      <div class="wv-back-bar">
        <button class="btn-ghost" @click="viewMode = 'list'">← 返回列表</button>
        <span class="wv-title">传承谱系</span>
      </div>
      <WeaponLineageView />
    </div>
    <SchemaRenderer v-else type-key="weapon" :detail-tabs="weaponTabs">
      <template #toolbar-extra>
        <button class="wv-lin-btn" @click="viewMode = 'lineage'" title="传承谱系视图">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="8" cy="3" r="2" />
            <circle cx="4" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <line x1="8" y1="5" x2="4" y2="10" />
            <line x1="8" y1="5" x2="12" y2="10" />
          </svg>
          谱系
        </button>
      </template>
    </SchemaRenderer>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { SchemaRenderer, type RelationTabDef } from '@worldsmith/ui-kit'
import WeaponLineageView from './WeaponLineageView.vue'

const viewMode = ref<'list' | 'lineage'>('list')
const weaponTabs: RelationTabDef[] = [
  { id: 'wielded_by', label: '持有者', icon: 'user', relationType: 'wielded_by', reverseDirection: true },
  { id: 'related_weapon', label: '关联武器', icon: 'link', relationType: 'related_weapon' },
  { id: 'used_in_battle', label: '关联战役', icon: 'shield', relationType: 'used_in_battle', reverseDirection: true },
]
</script>

<style scoped>
.weapon-view { height: 100%; }
.wv-back-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border, #333);
}
.wv-title { font-weight: var(--font-weight-semibold); font-size: var(--font-size-base); }
.wv-lin-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  font-size: var(--font-size-sm);
  font-family: inherit;
  color: var(--text-secondary, #aaa);
  background: var(--bg-secondary, #222);
  border: 1px solid var(--border, #333);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.15s;
}
.wv-lin-btn:hover {
  color: var(--text-primary, #eee);
  background: var(--bg-tertiary, #333);
}
</style>
