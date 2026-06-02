<template>
  <span :class="['ws-tag', `ws-tag--${type}`, `ws-tag--${size}`, { 'ws-tag--closable': closable }]">
    <span class="ws-tag__content"><slot /></span>
    <button v-if="closable" class="ws-tag__close" aria-label="移除标签" @click="$emit('close')">✕</button>
  </span>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  type?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info'
  size?: 'sm' | 'md'
  closable?: boolean
}>(), {
  type: 'default',
  size: 'md',
  closable: false,
})

defineEmits<{ close: [] }>()
</script>

<style scoped>
.ws-tag {
  display: inline-flex; align-items: center; gap: var(--space-1);
  border-radius: var(--tag-radius); font-weight: var(--tag-font-weight);
  white-space: nowrap; line-height: 1;
}
.ws-tag--sm { padding: 1px var(--space-1); font-size: var(--font-size-xs); }
.ws-tag--md { padding: var(--tag-padding); font-size: var(--tag-font-size); }

.ws-tag--default { background: var(--color-bg-elevated); color: var(--color-text-secondary); border: 1px solid var(--color-border); }
.ws-tag--primary { background: var(--color-primary-subtle); color: var(--color-primary); border: 1px solid transparent; }
.ws-tag--success { background: color-mix(in srgb, var(--color-success) 12%, transparent); color: var(--color-success); border: 1px solid transparent; }
.ws-tag--warning { background: color-mix(in srgb, var(--color-warning) 12%, transparent); color: var(--color-warning); border: 1px solid transparent; }
.ws-tag--danger { background: color-mix(in srgb, var(--color-danger) 12%, transparent); color: var(--color-danger); border: 1px solid transparent; }
.ws-tag--info { background: color-mix(in srgb, var(--color-info) 12%, transparent); color: var(--color-info); border: 1px solid transparent; }

.ws-tag__content { }
.ws-tag__close {
  border: none; background: transparent; cursor: pointer; font-size: var(--font-size-xs);
  color: inherit; opacity: 0.6; padding: 0; line-height: 1;
  transition: opacity var(--duration-fast) var(--ease-default);
}
.ws-tag__close:hover { opacity: 1; }
.ws-tag__close:focus-visible { box-shadow: var(--shadow-focus-ring); outline: none; }
</style>
