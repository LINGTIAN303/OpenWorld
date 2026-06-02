<script setup lang="ts">
// RunTimelineItem — 运行时间线单条
//
// P3 重构:用 WsTable 替代老 list 视图后,每条 timeline 走 RunTimelineItem 渲染。
// 显示:节点名 + 类型 icon + WsStatusDot + duration。
// 状态 awaiting-decision 时加紫色呼吸光晕(--color-accent-purple-subtle)。

import { computed } from 'vue'
import WsStatusDot from '@/ui/WsStatusDot.vue'
import WsIcon from '@/ui/WsIcon.vue'
import type { RunStatus } from '../../types'

interface TimelineItem {
  nodeId: string
  nodeName: string
  nodeType: string
  status: RunStatus
  startedAt?: number
  finishedAt?: number | null
}

const props = defineProps<{ item: TimelineItem }>()

const durationLabel = computed(() => {
  if (!props.item.startedAt) return '---'
  // 已 finished 才算 duration(running / pending / awaiting 都不算)
  if (props.item.finishedAt == null) return '---'
  const diff = props.item.finishedAt - props.item.startedAt
  if (diff < 1000) return `${diff} ms`
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s`
  const m = Math.floor(diff / 60_000)
  const s = Math.floor((diff % 60_000) / 1000)
  return `${m}m ${s}s`
})

const isAwaiting = computed(() => props.item.status === 'awaiting-decision')

const iconName = computed(() => {
  switch (props.item.nodeType) {
    case 'agent_decision': return 'help'
    case 'sub_agent': return 'users'
    case 'skill': return 'box'
    case 'condition': return 'git-branch'
    case 'loop': return 'repeat'
    case 'start': return 'play'
    case 'skip': return 'skip-forward'
    default: return 'box'
  }
})
</script>

<template>
  <div
    :class="['timeline-item', { 'timeline-item--awaiting': isAwaiting }]"
    :data-status="item.status"
    data-testid="timeline-item"
  >
    <WsIcon :name="iconName" size="sm" class="timeline-icon" />
    <span class="timeline-name">{{ item.nodeName }}</span>
    <WsStatusDot :status="item.status" />
    <span class="timeline-duration">{{ durationLabel }}</span>
  </div>
</template>

<style scoped>
.timeline-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  font-size: 12px;
  color: var(--color-text-primary);
  border-bottom: 1px solid var(--color-border-default);
  transition: background 0.1s;
}
.timeline-item:hover {
  background: var(--color-bg-hover);
}
.timeline-item--awaiting {
  background: var(--color-accent-purple-subtle);
  animation: timeline-pulse 2s ease-in-out infinite;
}
.timeline-icon {
  flex-shrink: 0;
  color: var(--color-text-tertiary);
}
.timeline-name {
  flex: 1;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.timeline-duration {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 11px;
  color: var(--color-text-tertiary);
  min-width: 60px;
  text-align: right;
}
@keyframes timeline-pulse {
  0%, 100% { box-shadow: 0 0 0 0 var(--color-accent-purple-subtle); }
  50% { box-shadow: 0 0 0 4px var(--color-accent-purple-subtle); }
}
</style>
