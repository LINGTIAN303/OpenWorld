<template>
  <span class="ws-badge">
    <slot />
    <span
      v-if="!hidden"
      :class="['ws-badge__dot', `ws-badge__dot--${type}`, { 'ws-badge__dot--dot': !content }]"
      role="status"
    >
      <template v-if="content">{{ displayContent }}</template>
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  content?: string | number
  type?: 'default' | 'primary' | 'success' | 'warning' | 'danger'
  max?: number
  hidden?: boolean
}>(), {
  type: 'danger',
  max: 99,
  hidden: false,
})

const displayContent = computed(() => {
  if (typeof props.content === 'number' && props.max && props.content > props.max) {
    return `${props.max}+`
  }
  return String(props.content ?? '')
})
</script>

<style scoped>
.ws-badge { position: relative; display: inline-flex; }

.ws-badge__dot {
  position: absolute; top: 0; right: 0;
  transform: translate(50%, -50%);
  background: var(--color-danger); color: #fff;
  border-radius: var(--badge-radius);
  font-size: var(--badge-font-size); font-weight: var(--font-weight-semibold);
  line-height: 1; padding: 2px 6px;
  white-space: nowrap; z-index: 1;
  border: 2px solid var(--color-bg-surface);
}
.ws-badge__dot--dot { width: 8px; height: 8px; padding: 0; min-width: 8px; }

.ws-badge__dot--default { background: var(--color-bg-elevated); color: var(--color-text-primary); }
.ws-badge__dot--primary { background: var(--color-primary); }
.ws-badge__dot--success { background: var(--color-success); }
.ws-badge__dot--warning { background: var(--color-warning); color: var(--color-text-inverse); }
.ws-badge__dot--danger { background: var(--color-danger); }
</style>
