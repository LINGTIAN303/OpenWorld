<template>
  <button
    :class="['ws-button', `ws-button--${type}`, `ws-button--${size}`, { 'ws-button--block': block, 'ws-button--loading': loading, 'ws-button--disabled': disabled }]"
    :disabled="disabled || loading"
    :type="htmlType"
    :aria-busy="loading"
    :aria-label="ariaLabel"
    @click="!disabled && !loading && $emit('click', $event)"
  >
    <span v-if="loading" class="ws-button__spinner"></span>
    <span v-if="$slots.icon && !loading" class="ws-button__icon"><slot name="icon" /></span>
    <span class="ws-button__content"><slot /></span>
  </button>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  type?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'text'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  loading?: boolean
  block?: boolean
  htmlType?: 'button' | 'submit' | 'reset'
  ariaLabel?: string
}>(), {
  type: 'primary',
  size: 'md',
  disabled: false,
  loading: false,
  block: false,
  htmlType: 'button',
})

defineEmits<{ click: [e: MouseEvent] }>()
</script>

<style scoped>
.ws-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  font-family: var(--font-family-base);
  font-weight: var(--button-font-weight);
  border: var(--button-border);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-default);
  position: relative;
  white-space: nowrap;
  user-select: none;
  outline: none;
  line-height: 1.4;
}
.ws-button:focus-visible {
  box-shadow: var(--shadow-focus-ring);
}

.ws-button--sm { padding: var(--button-padding-sm); font-size: var(--font-size-sm); border-radius: var(--button-radius); }
.ws-button--md { padding: var(--button-padding); font-size: var(--button-font-size); border-radius: var(--button-radius); }
.ws-button--lg { padding: var(--space-3) var(--space-5); font-size: var(--font-size-md); border-radius: var(--button-radius); }

.ws-button--primary { background: var(--button-bg); color: var(--button-color); }
.ws-button--primary:hover:not(.ws-button--disabled) { background: var(--button-bg-hover); }
.ws-button--primary:active:not(.ws-button--disabled) { background: var(--button-bg-active); transform: scale(var(--state-pressed-scale)); }

.ws-button--secondary { background: var(--button-secondary-bg); color: var(--button-secondary-color); border: 1px solid var(--button-secondary-border); }
.ws-button--secondary:hover:not(.ws-button--disabled) { background: var(--color-bg-hover); border-color: var(--color-primary); color: var(--color-primary); }
.ws-button--secondary:active:not(.ws-button--disabled) { transform: scale(var(--state-pressed-scale)); }

.ws-button--ghost { background: transparent; color: var(--button-ghost-color); border: 1px solid var(--button-ghost-border); }
.ws-button--ghost:hover:not(.ws-button--disabled) { background: var(--color-bg-hover); border-color: var(--color-primary); color: var(--color-primary); }
.ws-button--ghost:active:not(.ws-button--disabled) { transform: scale(var(--state-pressed-scale)); }

.ws-button--danger { background: var(--button-danger-bg); color: var(--button-danger-color); }
.ws-button--danger:hover:not(.ws-button--disabled) { filter: brightness(1.1); }
.ws-button--danger:active:not(.ws-button--disabled) { transform: scale(var(--state-pressed-scale)); }

.ws-button--text { background: transparent; color: var(--color-text-secondary); border: none; }
.ws-button--text:hover:not(.ws-button--disabled) { color: var(--color-primary); background: var(--color-primary-subtle); }
.ws-button--text:active:not(.ws-button--disabled) { transform: scale(var(--state-pressed-scale)); }

.ws-button--block { display: flex; width: 100%; }
.ws-button--disabled { opacity: 0.5; cursor: not-allowed; }
.ws-button--loading { cursor: wait; }

.ws-button__spinner {
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: ws-spin var(--duration-slow) linear infinite;
}
.ws-button__icon { display: inline-flex; align-items: center; }


</style>
