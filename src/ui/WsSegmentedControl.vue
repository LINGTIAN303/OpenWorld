<template>
  <div
    :class="['ws-segmented', `ws-segmented--${size}`]"
    role="radiogroup"
    :aria-label="ariaLabel"
  >
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      role="radio"
      :class="[
        'ws-segmented__option',
        { 'ws-segmented__option--active': opt.value === modelValue },
      ]"
      :aria-checked="opt.value === modelValue"
      :aria-selected="opt.value === modelValue"
      :aria-label="opt.label"
      @click="onSelect(opt.value)"
    >
      <span v-if="opt.icon" class="ws-segmented__icon" aria-hidden="true">{{ opt.icon }}</span>
      <span class="ws-segmented__label">{{ opt.label }}</span>
    </button>
  </div>
</template>

<script setup lang="ts" generic="T extends string">
interface Option {
  value: T
  label: string
  icon?: string
}

const props = withDefaults(defineProps<{
  modelValue: T
  options: Option[]
  size?: 'sm' | 'md'
  ariaLabel?: string
}>(), {
  size: 'sm',
  ariaLabel: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [value: T]
}>()

function onSelect(value: T) {
  if (value !== props.modelValue) {
    emit('update:modelValue', value)
  }
}
</script>

<style scoped>
.ws-segmented {
  display: inline-flex;
  align-items: stretch;
  padding: 2px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  gap: 2px;
}
.ws-segmented--sm .ws-segmented__option { padding: 5px 10px; font-size: 12px; }
.ws-segmented--md .ws-segmented__option { padding: 7px 14px; font-size: 13px; }

.ws-segmented__option {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: transparent;
  border: none;
  color: var(--color-text-secondary);
  font-family: var(--font-family-base);
  font-weight: var(--font-weight-medium);
  border-radius: 6px;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
  white-space: nowrap;
  line-height: 1;
}
.ws-segmented__option:hover {
  color: var(--color-text-primary);
}
.ws-segmented__option--active {
  background: var(--color-bg-elevated, rgba(255, 255, 255, 0.08));
  color: var(--color-text-primary);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}
.ws-segmented__icon { font-size: 1.1em; line-height: 1; }
.ws-segmented__label { line-height: 1; }
</style>
