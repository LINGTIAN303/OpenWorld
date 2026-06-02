<template>
  <div :class="['ws-input-wrapper', { 'ws-input-wrapper--error': error, 'ws-input-wrapper--disabled': disabled }]">
    <label v-if="label" :for="inputId" class="ws-input__label">{{ label }}</label>
    <div class="ws-input__body">
      <span v-if="$slots.prefix" class="ws-input__prefix"><slot name="prefix" /></span>
      <input
        v-if="type !== 'textarea'"
        ref="inputRef"
        :id="inputId"
        :class="['ws-input', { 'ws-input--with-prefix': $slots.prefix, 'ws-input--with-suffix': $slots.suffix }]"
        :type="showPassword ? 'text' : type"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :readonly="readonly"
        :maxlength="maxlength"
        :aria-invalid="!!error"
        :aria-describedby="describedBy"
        @input="onInput"
        @focus="$emit('focus', $event)"
        @blur="$emit('blur', $event)"
      />
      <textarea
        v-else
        ref="inputRef"
        :id="inputId"
        :class="['ws-input ws-input--textarea', { 'ws-input--with-prefix': $slots.prefix }]"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :readonly="readonly"
        :rows="rows"
        :aria-invalid="!!error"
        :aria-describedby="describedBy"
        @input="onInput"
        @focus="$emit('focus', $event)"
        @blur="$emit('blur', $event)"
      />
      <span v-if="$slots.suffix" class="ws-input__suffix"><slot name="suffix" /></span>
    </div>
    <div v-if="error" :id="errorId" class="ws-input__error">{{ error }}</div>
    <div v-else-if="hint" :id="hintId" class="ws-input__hint">{{ hint }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

let inputIdCounter = 0

const props = withDefaults(defineProps<{
  modelValue?: string
  type?: string
  placeholder?: string
  disabled?: boolean
  readonly?: boolean
  label?: string
  error?: string
  hint?: string
  maxlength?: number
  rows?: number
  showPassword?: boolean
}>(), {
  modelValue: '',
  type: 'text',
  placeholder: '',
  disabled: false,
  readonly: false,
  rows: 3,
  showPassword: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  focus: [e: FocusEvent]
  blur: [e: FocusEvent]
}>()

const inputRef = ref<HTMLInputElement | HTMLTextAreaElement>()
const inputId = `ws-input-${++inputIdCounter}`
const errorId = `${inputId}-error`
const hintId = `${inputId}-hint`
const describedBy = computed(() => {
  if (props.error) return errorId
  if (props.hint) return hintId
  return undefined
})

function onInput(e: Event) {
  const val = (e.target as HTMLInputElement).value
  emit('update:modelValue', val)
}

function focus() { inputRef.value?.focus() }
function blur() { inputRef.value?.blur() }

defineExpose({ focus, blur })
</script>

<style scoped>
.ws-input-wrapper { display: flex; flex-direction: column; gap: var(--space-1); }
.ws-input__label { font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); color: var(--color-text-secondary); }
.ws-input__body { position: relative; display: flex; align-items: center; }

.ws-input {
  width: 100%;
  padding: var(--input-padding);
  border: 1px solid var(--input-border);
  border-radius: var(--input-radius);
  font-size: var(--input-font-size);
  font-family: var(--font-family-base);
  background: var(--input-bg);
  color: var(--input-color);
  outline: none;
  transition: border-color var(--duration-fast) var(--ease-default), box-shadow var(--duration-fast) var(--ease-default);
}
.ws-input::placeholder { color: var(--input-placeholder); }
.ws-input:focus-visible { border-color: var(--input-border-focus); box-shadow: var(--shadow-focus-ring); }
.ws-input--textarea { resize: vertical; min-height: 60px; }
.ws-input--with-prefix { padding-left: var(--space-8); }
.ws-input--with-suffix { padding-right: var(--space-8); }

.ws-input__prefix, .ws-input__suffix {
  position: absolute;
  display: flex;
  align-items: center;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-sm);
  pointer-events: none;
}
.ws-input__prefix { left: var(--space-3); }
.ws-input__suffix { right: var(--space-3); pointer-events: auto; }

.ws-input-wrapper--error .ws-input { border-color: var(--color-danger); }
.ws-input-wrapper--error .ws-input:focus-visible { box-shadow: var(--shadow-focus-ring), 0 0 0 3px rgba(255, 82, 82, 0.15); }
.ws-input-wrapper--disabled .ws-input { opacity: 0.5; cursor: not-allowed; }

.ws-input__error { font-size: var(--font-size-xs); color: var(--color-danger); }
.ws-input__hint { font-size: var(--font-size-xs); color: var(--color-text-tertiary); }
</style>
