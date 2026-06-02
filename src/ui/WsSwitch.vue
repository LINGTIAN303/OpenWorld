<template>
  <label :class="['ws-switch', { 'ws-switch--on': modelValue, 'ws-switch--disabled': disabled }]">
    <input type="checkbox" class="ws-switch__input" role="switch" :aria-checked="modelValue" :checked="modelValue" :disabled="disabled" @change="onChange" />
    <span class="ws-switch__track">
      <span class="ws-switch__thumb"></span>
    </span>
    <span v-if="label" class="ws-switch__label">{{ label }}</span>
  </label>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue?: boolean
  label?: string
  disabled?: boolean
}>(), {
  modelValue: false,
  disabled: false,
})

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

function onChange() {
  if (props.disabled) return
  emit('update:modelValue', !props.modelValue)
}
</script>

<style scoped>
.ws-switch {
  display: inline-flex; align-items: center; gap: var(--space-2);
  cursor: pointer; user-select: none; font-size: var(--font-size-base);
  color: var(--color-text-primary);
}
.ws-switch--disabled { opacity: 0.5; cursor: not-allowed; }

.ws-switch__input { position: absolute; opacity: 0; width: 0; height: 0; }

.ws-switch__track {
  width: 36px; height: 20px; border-radius: 10px;
  background: var(--color-border-strong); position: relative;
  transition: background var(--duration-fast) var(--ease-default);
  flex-shrink: 0;
}
.ws-switch--on .ws-switch__track { background: var(--color-primary); }
.ws-switch:not(.ws-switch--disabled):hover .ws-switch__track { filter: brightness(1.1); }
.ws-switch:not(.ws-switch--disabled):focus-within .ws-switch__track { box-shadow: var(--shadow-focus-ring); }
.ws-switch__thumb {
  position: absolute; top: 2px; left: 2px;
  width: 16px; height: 16px; border-radius: 50%;
  background: var(--color-text-inverse); transition: transform var(--duration-fast) var(--ease-default);
  box-shadow: var(--shadow-sm);
}
.ws-switch--on .ws-switch__thumb { transform: translateX(16px); }

.ws-switch__label { line-height: 1; }
</style>
