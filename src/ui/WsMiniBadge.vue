<template>
  <span
    :class="[
      'ws-mini-badge',
      `ws-mini-badge--${variant}`,
      `ws-mini-badge--${size}`,
      { 'ws-mini-badge--pill': pill },
    ]"
  >
    <span v-if="icon" class="ws-mini-badge__icon" aria-hidden="true">{{ icon }}</span>
    <slot />
  </span>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'danger'
  size?: 'sm' | 'md'
  pill?: boolean
  icon?: string
}>(), {
  variant: 'neutral',
  size: 'sm',
  pill: true,
  icon: undefined,
})
</script>

<style scoped>
.ws-mini-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-family-base);
  font-weight: var(--font-weight-medium);
  line-height: 1;
  border: 1px solid transparent;
  white-space: nowrap;
  user-select: none;
}
.ws-mini-badge--sm { padding: 3px 8px; font-size: 10px; }
.ws-mini-badge--md { padding: 4px 10px; font-size: 11px; }
.ws-mini-badge--pill { border-radius: 999px; }
.ws-mini-badge:not(.ws-mini-badge--pill) { border-radius: 4px; }

.ws-mini-badge__icon { font-size: 1.1em; line-height: 1; }

.ws-mini-badge--neutral { background: rgba(255, 255, 255, 0.06); color: var(--color-text-secondary); border-color: rgba(255, 255, 255, 0.12); }
.ws-mini-badge--primary { background: color-mix(in srgb, var(--color-primary) 12%, transparent); color: var(--color-primary); border-color: color-mix(in srgb, var(--color-primary) 30%, transparent); }
.ws-mini-badge--accent { background: color-mix(in srgb, var(--color-accent, var(--color-primary)) 12%, transparent); color: var(--color-accent, var(--color-primary)); border-color: color-mix(in srgb, var(--color-accent, var(--color-primary)) 30%, transparent); }
.ws-mini-badge--success { background: color-mix(in srgb, var(--color-success) 12%, transparent); color: var(--color-success); border-color: color-mix(in srgb, var(--color-success) 30%, transparent); }
.ws-mini-badge--warning { background: color-mix(in srgb, var(--color-warning) 12%, transparent); color: var(--color-warning); border-color: color-mix(in srgb, var(--color-warning) 30%, transparent); }
.ws-mini-badge--danger { background: color-mix(in srgb, var(--color-danger) 12%, transparent); color: var(--color-danger); border-color: color-mix(in srgb, var(--color-danger) 30%, transparent); }
</style>
