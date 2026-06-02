<template>
  <div
    :class="[
      'ws-card',
      `ws-card--${props.variant}`,
      `ws-card--p-${props.padding}`,
      { 'ws-card--hoverable': props.hoverable, 'ws-card--active': props.active, 'ws-card--compact': props.compact },
    ]"
    :role="props.hoverable ? 'button' : undefined"
    :tabindex="props.hoverable ? 0 : undefined"
  >
    <div v-if="$slots.header || props.title" class="ws-card__header">
      <slot name="header">
        <span class="ws-card__title">{{ props.title }}</span>
        <span v-if="props.subtitle" class="ws-card__subtitle">{{ props.subtitle }}</span>
      </slot>
      <div v-if="$slots.actions" class="ws-card__actions"><slot name="actions" /></div>
    </div>
    <div class="ws-card__body"><slot /></div>
    <div v-if="$slots.footer" class="ws-card__footer"><slot name="footer" /></div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  title?: string
  subtitle?: string
  hoverable?: boolean
  active?: boolean
  compact?: boolean
  variant?: 'flat' | 'elevated' | 'outlined'
  padding?: 'none' | 'sm' | 'md' | 'lg'
}>(), {
  hoverable: false,
  active: false,
  compact: false,
  variant: 'flat',
  padding: 'md',
})
</script>

<style scoped>
.ws-card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--card-radius);
  padding: var(--card-padding);
  box-shadow: var(--card-shadow);
  transition: box-shadow var(--duration-normal) var(--ease-default), transform var(--duration-normal) var(--ease-default), border-color var(--duration-fast) var(--ease-default);
}
.ws-card--compact { padding: var(--space-3); }
.ws-card--hoverable { cursor: pointer; }
.ws-card--hoverable:hover { box-shadow: var(--card-shadow-hover); transform: translateY(-1px); border-color: var(--color-primary); }
.ws-card--hoverable:focus-visible { box-shadow: var(--shadow-focus-ring); outline: none; }
.ws-card--hoverable:active { transform: scale(var(--state-pressed-scale)); }
.ws-card--active { border-color: var(--color-primary); background: var(--color-primary-subtle); }

.ws-card--flat {
  background: var(--card-bg);
  box-shadow: none;
}
.ws-card--elevated {
  background: var(--color-bg-elevated, rgba(255, 255, 255, 0.04));
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18), 0 1px 3px rgba(0, 0, 0, 0.1);
  border-color: transparent;
}
.ws-card--outlined {
  background: transparent;
  box-shadow: none;
  border-color: var(--color-border-default, rgba(255, 255, 255, 0.18));
  border-width: 1.5px;
}

.ws-card--p-none { padding: 0; }
.ws-card--p-sm { padding: var(--space-3); }
.ws-card--p-md { padding: var(--card-padding, var(--space-4)); }
.ws-card--p-lg { padding: var(--space-5); }

.ws-card__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-3); }
.ws-card__title { font-size: var(--font-size-md); font-weight: var(--font-weight-semibold); color: var(--color-text-primary); }
.ws-card__subtitle { font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-left: var(--space-2); }
.ws-card__actions { display: flex; gap: var(--space-1); }
.ws-card__footer { margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--color-border-subtle); }
</style>
