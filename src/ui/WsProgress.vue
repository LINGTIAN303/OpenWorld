<template>
  <div
    :class="['ws-progress', `ws-progress--${type}`, { 'ws-progress--indeterminate': indeterminate }]"
    role="progressbar"
    :aria-valuenow="indeterminate ? undefined : Math.round(percent)"
    :aria-valuemin="0"
    :aria-valuemax="100"
    :aria-label="ariaLabel"
  >
    <div v-if="showLabel" class="ws-progress__label">
      <slot name="label">{{ Math.round(percent) }}%</slot>
    </div>
    <div class="ws-progress__track">
      <div class="ws-progress__fill" :style="fillStyle"></div>
    </div>
    <div v-if="$slots.default" class="ws-progress__info"><slot /></div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  percent?: number
  type?: 'line' | 'circle'
  status?: 'default' | 'success' | 'warning' | 'danger'
  showLabel?: boolean
  indeterminate?: boolean
  color?: string
  ariaLabel?: string
}>(), {
  percent: 0,
  type: 'line',
  status: 'default',
  showLabel: false,
  indeterminate: false,
})

const fillStyle = computed(() => {
  const style: Record<string, string> = {
    width: `${Math.min(100, Math.max(0, props.percent))}%`,
  }
  if (props.color) style.background = props.color
  if (props.status === 'success') style.background = 'var(--color-success)'
  if (props.status === 'warning') style.background = 'var(--color-warning)'
  if (props.status === 'danger') style.background = 'var(--color-danger)'
  return style
})
</script>

<style scoped>
.ws-progress { display: flex; align-items: center; gap: var(--space-2); }
.ws-progress__label { font-size: var(--font-size-xs); color: var(--color-text-secondary); min-width: 36px; text-align: right; }
.ws-progress__track {
  flex: 1; height: 6px; background: var(--progress-track);
  border-radius: var(--progress-radius); overflow: hidden;
}
.ws-progress__fill {
  height: 100%; background: var(--progress-fill);
  border-radius: var(--progress-radius);
  transition: width var(--duration-normal) var(--ease-default);
}
.ws-progress__info { font-size: var(--font-size-xs); color: var(--color-text-secondary); white-space: nowrap; }

.ws-progress--indeterminate .ws-progress__fill {
  width: 30% !important;
  animation: ws-indeterminate 1.5s var(--ease-default) infinite;
}


</style>
