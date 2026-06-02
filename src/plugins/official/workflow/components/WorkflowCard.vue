<template>
  <WsCard
    variant="elevated"
    hoverable
    :data-testid="`workflow-card-${props.workflow.id}`"
    class="ws-workflow-card"
  >
    <template #header>
      <div class="ws-workflow-card__header">
        <h3 class="ws-workflow-card__title">{{ props.workflow.name }}</h3>
        <WsStatusDot :status="displayStatus" size="sm" />
      </div>
    </template>
    <template #actions>
      <WsButton
        type="ghost"
        size="sm"
        icon-only
        aria-label="编辑"
        data-testid="wf-card-primary"
        @click="emit('edit', props.workflow.id)"
      >
        ✎
      </WsButton>
    </template>

    <p v-if="props.workflow.description" class="ws-workflow-card__desc">
      {{ props.workflow.description }}
    </p>

    <template #footer>
      <div class="ws-workflow-card__footer">
        <WsMiniBadge variant="primary" size="sm" pill>
          {{ props.workflow.category }}
        </WsMiniBadge>
        <span v-if="nodeCountLabel" class="ws-workflow-card__meta">{{ nodeCountLabel }}</span>
        <div class="ws-workflow-card__actions">
          <WsButton
            type="secondary"
            size="sm"
            aria-label="运行"
            data-testid="wf-card-launch"
            @click="emit('launch', props.workflow.id)"
          >
            运行
          </WsButton>
          <WsButton
            type="danger"
            size="sm"
            aria-label="删除"
            data-testid="wf-card-delete"
            @click="emit('delete', props.workflow.id)"
          >
            删除
          </WsButton>
        </div>
      </div>
    </template>
  </WsCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import WsCard from '@/ui/WsCard.vue'
import WsButton from '@/ui/WsButton.vue'
import WsStatusDot from '@/ui/WsStatusDot.vue'
import WsMiniBadge from '@/ui/WsMiniBadge.vue'
import type { WorkflowSummary } from '../types'

const props = defineProps<{
  workflow: WorkflowSummary
}>()

const emit = defineEmits<{
  edit: [id: string]
  launch: [id: string]
  delete: [id: string]
}>()

/** WsStatusDot 支持的 status 子集 */
type DotStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'awaiting-decision'

/**
 * 适配器:把扩展 RunStatus(queued/cancelled)映射到 WsStatusDot 支持的状态,
 * 让 dot 始终有合法值。
 */
const displayStatus = computed<DotStatus>(() => {
  const s = props.workflow.status ?? 'idle'
  if (s === 'queued') return 'idle'
  if (s === 'cancelled') return 'skipped'
  return s
})

const nodeCountLabel = computed(() => {
  const n = props.workflow.nodeCount
  return typeof n === 'number' ? `${n} 节点` : ''
})
</script>

<style scoped>
.ws-workflow-card {
  min-width: 0;
}
.ws-workflow-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  width: 100%;
  min-width: 0;
}
.ws-workflow-card__title {
  margin: 0;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}
.ws-workflow-card__desc {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ws-workflow-card__footer {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.ws-workflow-card__meta {
  font-size: var(--font-size-xs, 11px);
  color: var(--color-text-tertiary);
  font-weight: var(--font-weight-medium);
}
.ws-workflow-card__actions {
  display: flex;
  gap: var(--space-1);
  margin-left: auto;
}
</style>
