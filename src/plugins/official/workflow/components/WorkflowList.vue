<template>
  <div class="workflow-list">
    <div class="list-header">
      <h3><WsIcon name="outline" size="sm" /> 工作流</h3>
      <div class="search-bar">
        <input
          v-model="keyword"
          type="text"
          placeholder="搜索工作流..."
          class="search-input"
          aria-label="搜索工作流"
        />
      </div>
    </div>

    <WsEmpty v-if="filteredWorkflows.length === 0" preset="no-data" title="暂无工作流" description="告诉 AI Agent &quot;创建一个工作流&quot; 即可开始" />

    <div v-else class="workflow-cards">
      <div
        v-for="wf in filteredWorkflows"
        :key="wf.id"
        class="workflow-card"
      >
        <div class="card-header">
          <span class="card-icon"><WsIcon name="lightning" size="sm" /></span>
          <span class="card-name">{{ wf.name }}</span>
        </div>
        <div class="card-meta">
          <span class="card-category">{{ wf.category }}</span>
        </div>
        <p v-if="wf.description" class="card-desc">{{ wf.description }}</p>
        <div class="card-actions">
          <button class="card-btn edit" @click="$emit('edit', wf.id)" title="编辑"><WsIcon name="edit" size="xs" /> 编辑</button>
          <button class="card-btn launch" @click="$emit('launch', wf.id)" title="运行"><WsIcon name="arrow-up" size="xs" /> 运行</button>
          <button class="card-btn delete" @click="$emit('delete', wf.id)" title="删除"><WsIcon name="delete" size="xs" /> 删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import WsIcon from '../../../../ui/WsIcon.vue'
import WsEmpty from '../../../../ui/WsEmpty.vue'
import type { WorkflowSummary } from '../types'

const props = defineProps<{
  workflows: readonly WorkflowSummary[]
}>()

defineEmits<{
  launch: [workflowId: string]
  edit: [workflowId: string]
  delete: [workflowId: string]
}>()

const keyword = ref('')

const filteredWorkflows = computed(() => {
  if (!keyword.value) return props.workflows
  const kw = keyword.value.toLowerCase()
  return props.workflows.filter(wf =>
    wf.name.toLowerCase().includes(kw) ||
    wf.category.toLowerCase().includes(kw) ||
    (wf.description ?? '').toLowerCase().includes(kw)
  )
})
</script>

<style scoped>
.workflow-list {
  padding: 16px;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.list-header h3 {
  margin: 0;
  font-size: var(--font-size-lg);
}

.search-input {
  padding: 6px 12px;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  font-size: var(--font-size-sm);
  width: 200px;
}

.workflow-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}

.workflow-card {
  padding: 14px;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  transition: all 0.15s;
}

.workflow-card:hover {
  border-color: var(--primary, #3b82f6);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.card-icon {
  font-size: var(--font-size-xl);
}

.card-name {
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-base);
}

.card-meta {
  margin-bottom: 4px;
}

.card-category {
  font-size: var(--font-size-xs);
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--hover-bg, #f3f4f6);
  color: var(--text-secondary, #6b7280);
}

.card-desc {
  font-size: var(--font-size-sm);
  color: var(--text-secondary, #6b7280);
  margin: 0 0 10px 0;
  line-height: 1.4;
}

.card-actions {
  display: flex;
  gap: 6px;
}

.card-btn {
  padding: 4px 10px;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 5px;
  background: var(--color-bg-surface);
  cursor: pointer;
  font-size: var(--font-size-xs);
  transition: all 0.15s;
}

.card-btn:hover {
  border-color: var(--primary, #3b82f6);
  color: var(--primary, #3b82f6);
}

.card-btn.launch {
  border-color: var(--color-success);
  color: var(--color-success);
}

.card-btn.launch:hover {
  background: color-mix(in srgb, var(--color-success) 15%, transparent);
}

.card-btn.delete {
  border-color: color-mix(in srgb, var(--color-danger) 50%, transparent);
  color: var(--color-danger);
}

.card-btn.delete:hover {
  background: color-mix(in srgb, var(--color-danger) 15%, transparent);
}
</style>
