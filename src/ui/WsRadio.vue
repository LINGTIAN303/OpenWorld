<template>
  <label :class="['ws-radio', { 'ws-radio--checked': modelValue === value, 'ws-radio--disabled': disabled }]">
    <input type="radio" class="ws-radio__input" :checked="modelValue === value" :disabled="disabled" :name="name" @change="onChange" />
    <span class="ws-radio__circle">
      <span v-if="modelValue === value" class="ws-radio__dot"></span>
    </span>
    <span v-if="label" class="ws-radio__label">{{ label }}</span>
  </label>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue?: string | number
  value: string | number
  label?: string
  disabled?: boolean
  name?: string
}>(), {
  disabled: false,
})

const emit = defineEmits<{ 'update:modelValue': [value: string | number] }>()

function onChange() {
  if (props.disabled) return
  emit('update:modelValue', props.value)
}
</script>

<style scoped>
.ws-radio {
  display: inline-flex; align-items: center; gap: var(--space-2);
  cursor: pointer; user-select: none; font-size: var(--font-size-base);
  color: var(--color-text-primary);
}
.ws-radio--disabled { opacity: 0.5; cursor: not-allowed; }

.ws-radio__input { position: absolute; opacity: 0; width: 0; height: 0; }

.ws-radio__circle {
  width: 18px; height: 18px; border: 2px solid var(--color-border-strong);
  border-radius: 50%; display: flex; align-items: center; justify-content: center;
  transition: all var(--duration-fast) var(--ease-default); flex-shrink: 0;
}
.ws-radio--checked .ws-radio__circle { border-color: var(--color-primary); }
.ws-radio:not(.ws-radio--disabled):hover .ws-radio__circle { border-color: var(--color-primary); }
.ws-radio:not(.ws-radio--disabled):focus-within .ws-radio__circle { box-shadow: var(--shadow-focus-ring); }
.ws-radio__dot { width: 8px; height: 8px; border-radius: 50%; background: var(--color-primary); }

.ws-radio__label { line-height: 1; }
</style>
