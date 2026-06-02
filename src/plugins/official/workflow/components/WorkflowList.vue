<template>
  <div class="ws-workflow-list">
    <div class="ws-workflow-list__header">
      <h3 class="ws-workflow-list__title">工作流</h3>
      <div class="ws-workflow-list__tools">
        <input
          v-model="keyword"
          type="text"
          placeholder="搜索工作流..."
          class="search-input"
          aria-label="搜索工作流"
        />
        <WsSegmentedControl
          v-model="sortKey"
          :options="sortOptions"
          size="sm"
          aria-label="排序"
        />
      </div>
    </div>

    <WorkflowEmptyState
      v-if="filteredWorkflows.length === 0"
      :no-results="keyword.trim().length > 0"
      :keyword="keyword"
    />

    <div v-else class="ws-workflow-list__grid">
      <WorkflowCard
        v-for="wf in filteredWorkflows"
        :key="wf.id"
        :workflow="wf"
        @edit="(id) => emit('edit', id)"
        @launch="(id) => emit('launch', id)"
        @delete="(id) => emit('delete', id)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import WsSegmentedControl from '@/ui/WsSegmentedControl.vue'
import WorkflowCard from './WorkflowCard.vue'
import WorkflowEmptyState from './WorkflowEmptyState.vue'
import type { WorkflowSummary } from '../types'

type SortKey = 'created-desc' | 'name-asc' | 'updated-desc'

const props = defineProps<{
  workflows: readonly WorkflowSummary[]
}>()

const emit = defineEmits<{
  edit: [workflowId: string]
  launch: [workflowId: string]
  delete: [workflowId: string]
}>()

const keyword = ref('')
const sortKey = ref<SortKey>('created-desc')

const sortOptions: ReadonlyArray<{ label: string; value: SortKey }> = [
  { label: '最新', value: 'created-desc' },
  { label: '名称', value: 'name-asc' },
  { label: '最近运行', value: 'updated-desc' },
]

function compareWorkflows(a: WorkflowSummary, b: WorkflowSummary, key: SortKey): number {
  switch (key) {
    case 'name-asc':
      return a.name.localeCompare(b.name, 'zh-Hans-CN')
    case 'updated-desc':
      return b.updatedAt - a.updatedAt
    case 'created-desc':
    default: {
      // createdAt 可能缺失,降级到 updatedAt
      const aTime = a.createdAt ? Date.parse(a.createdAt) : a.updatedAt
      const bTime = b.createdAt ? Date.parse(b.createdAt) : b.updatedAt
      return bTime - aTime
    }
  }
}

const filteredWorkflows = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  const filtered = kw
    ? props.workflows.filter(
        (wf) =>
          wf.name.toLowerCase().includes(kw) ||
          wf.category.toLowerCase().includes(kw) ||
          (wf.description ?? '').toLowerCase().includes(kw),
      )
    : [...props.workflows]
  filtered.sort((a, b) => compareWorkflows(a, b, sortKey.value))
  return filtered
})
</script>

<style scoped>
.ws-workflow-list {
  padding: var(--space-4);
}
.ws-workflow-list__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
  flex-wrap: wrap;
}
.ws-workflow-list__title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}
.ws-workflow-list__tools {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.search-input {
  padding: 6px 12px;
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm, 6px);
  font-size: var(--font-size-sm);
  background: var(--color-bg-input, var(--color-bg-primary));
  color: var(--color-text-primary);
  width: 200px;
  font-family: var(--font-family-base);
}
.search-input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: var(--shadow-focus-ring);
}
.ws-workflow-list__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-3);
}
</style>
