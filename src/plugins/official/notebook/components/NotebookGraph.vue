<template>
  <div class="nb-graph">
    <div class="nb-graph-placeholder">
      <div class="nb-gp-icon"><WsIcon name="link" size="xl" /></div>
      <div class="nb-gp-text">知识图谱视图</div>
      <div class="nb-gp-desc">展示笔记间的双向链接关系</div>
      <div class="nb-gp-stats">{{ notes.length }} 条笔记 · {{ linkCount }} 个链接</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import WsIcon from '../../../../ui/WsIcon.vue'
import { useRelationStore } from '@worldsmith/entity-core'

defineProps<{ notes: any[] }>()
defineEmits<{ select: [id: string] }>()

const relationStore = useRelationStore()

const linkCount = computed(() =>
  relationStore.relations.filter((r: any) => r.type === 'note_link').length
)
</script>

<style scoped>
.nb-graph { display: flex; align-items: center; justify-content: center; height: 100%; }
.nb-graph-placeholder { text-align: center; }
.nb-gp-icon { font-size: var(--icon-2xl); margin-bottom: 12px; }
.nb-gp-text { font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); color: var(--color-text-primary); margin-bottom: 4px; }
.nb-gp-desc { font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-bottom: 12px; }
.nb-gp-stats { font-size: var(--font-size-sm); color: var(--color-text-tertiary); }
</style>
