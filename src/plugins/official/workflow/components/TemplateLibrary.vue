<template>
  <div class="template-library">
    <div
      v-for="template in templates"
      :key="template.id"
      class="template-card"
      @click="$emit('select', template.id)"
    >
      <span class="template-icon">{{ template.icon }}</span>
      <div class="template-info">
        <div class="template-name">{{ template.name_zh }}</div>
        <div class="template-desc">{{ template.description_zh }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { WorkflowTemplate } from '../workflow-templates'

defineProps<{
  templates: WorkflowTemplate[]
}>()

defineEmits<{
  select: [id: string]
}>()
</script>

<style scoped>
.template-library {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 12px;
}

.template-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  background: var(--bg-primary, white);
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.template-card:hover {
  border-color: #6366f1;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.15);
}

.template-icon {
  font-size: var(--font-size-2xl);
  line-height: 1;
  flex-shrink: 0;
}

.template-info {
  min-width: 0;
}

.template-name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary, #1f2937);
  margin-bottom: 4px;
}

.template-desc {
  font-size: var(--font-size-xs);
  color: #94a3b8;
  line-height: 1.4;
}
</style>
