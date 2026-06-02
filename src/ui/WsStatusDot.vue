<template>
  <span
    :class="[
      'ws-status-dot',
      `ws-status-dot--${status}`,
      `ws-status-dot--${size}`,
      { 'ws-status-dot--pulse': pulse },
    ]"
    role="status"
    :aria-label="label || defaultLabel"
  >
    <span class="ws-status-dot__core"></span>
    <span v-if="showLabel" class="ws-status-dot__label">{{ label || defaultLabel }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

type RunStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'skipped' | 'awaiting-decision'

const props = withDefaults(defineProps<{
  status: RunStatus
  size?: 'xs' | 'sm' | 'md'
  pulse?: boolean
  showLabel?: boolean
  label?: string
}>(), {
  size: 'sm',
  pulse: undefined,
  showLabel: false,
  label: undefined,
})

const defaultLabel = computed(() => {
  const map: Record<RunStatus, string> = {
    idle: '空闲',
    running: '运行中',
    paused: '已暂停',
    completed: '已完成',
    failed: '失败',
    skipped: '已跳过',
    'awaiting-decision': '等待决策',
  }
  return map[props.status]
})

const pulse = computed(() => props.pulse ?? (props.status === 'running' || props.status === 'awaiting-decision'))
</script>

<style scoped>
.ws-status-dot {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-family: var(--font-family-base);
  line-height: 1;
}
.ws-status-dot__core {
  display: inline-block;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}
.ws-status-dot--xs .ws-status-dot__core { width: 6px; height: 6px; }
.ws-status-dot--sm .ws-status-dot__core { width: 8px; height: 8px; }
.ws-status-dot--md .ws-status-dot__core { width: 12px; height: 12px; }
.ws-status-dot__label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.ws-status-dot--idle { color: var(--color-text-tertiary); }
.ws-status-dot--running { color: var(--color-warning); }
.ws-status-dot--paused { color: var(--color-info); }
.ws-status-dot--completed { color: var(--color-success); }
.ws-status-dot--failed { color: var(--color-danger); }
.ws-status-dot--skipped { color: var(--color-text-tertiary); }
.ws-status-dot--awaiting-decision { color: var(--color-primary); }

.ws-status-dot--pulse .ws-status-dot__core {
  position: relative;
}
.ws-status-dot--pulse .ws-status-dot__core::after {
  content: '';
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.3;
  animation: ws-pulse 1.5s ease-in-out infinite;
}
@keyframes ws-pulse {
  0%, 100% { transform: scale(1); opacity: 0.3; }
  50% { transform: scale(1.6); opacity: 0; }
}
</style>
