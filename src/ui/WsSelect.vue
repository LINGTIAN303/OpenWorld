<template>
  <div :class="['ws-select', { 'ws-select--disabled': disabled, 'ws-select--error': error }]" ref="wrapperRef">
    <label v-if="label" :id="labelId" class="ws-select__label">{{ label }}</label>
    <button
      class="ws-select__trigger"
      role="combobox"
      :aria-expanded="isOpen"
      :aria-haspopup="'listbox'"
      :aria-labelledby="label ? labelId : undefined"
      :aria-activedescendant="activeDescendant"
      :disabled="disabled"
      @click="toggle"
      @keydown="onTriggerKeydown"
    >
      <span v-if="selectedLabel" class="ws-select__value">{{ selectedLabel }}</span>
      <span v-else class="ws-select__placeholder">{{ placeholder }}</span>
      <span class="ws-select__arrow" :class="{ open: isOpen }">▾</span>
    </button>
    <div v-if="error" :id="errorId" class="ws-select__error">{{ error }}</div>
    <Teleport to="body">
      <Transition name="ws-select">
        <div
          v-if="isOpen"
          :id="listboxId"
          class="ws-select__dropdown"
          :style="dropdownStyle"
          ref="dropdownRef"
          role="listbox"
          :aria-labelledby="label ? labelId : undefined"
        >
          <div
            v-for="(opt, idx) in options"
            :id="`${listboxId}-opt-${opt.value}`"
            :key="opt.value"
            :class="['ws-select__option', { 'ws-select__option--active': modelValue === opt.value, 'ws-select__option--focused': activeIndex === idx, 'ws-select__option--disabled': opt.disabled }]"
            role="option"
            :aria-selected="modelValue === opt.value"
            :aria-disabled="opt.disabled"
            @click="onSelect(opt)"
          >
            {{ opt.label }}
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'

export interface SelectOption {
  label: string
  value: string | number
  disabled?: boolean
}

let selectIdCounter = 0

const props = withDefaults(defineProps<{
  modelValue?: string | number
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  label?: string
  error?: string
}>(), {
  placeholder: '请选择',
  disabled: false,
})

const emit = defineEmits<{ 'update:modelValue': [value: string | number] }>()

const wrapperRef = ref<HTMLElement | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)
const isOpen = ref(false)
const dropdownPos = ref({ top: 0, left: 0, width: 0 })
const activeIndex = ref(-1)

const instanceId = ++selectIdCounter
const labelId = `ws-select-label-${instanceId}`
const listboxId = `ws-select-listbox-${instanceId}`
const errorId = `ws-select-error-${instanceId}`

const activeDescendant = computed(() => {
  if (activeIndex.value < 0 || activeIndex.value >= props.options.length) return undefined
  return `${listboxId}-opt-${props.options[activeIndex.value].value}`
})

const selectedLabel = computed(() => {
  const opt = props.options.find(o => o.value === props.modelValue)
  return opt?.label ?? ''
})

const dropdownStyle = computed(() => ({
  top: `${dropdownPos.value.top}px`,
  left: `${dropdownPos.value.left}px`,
  width: `${dropdownPos.value.width}px`,
}))

function toggle() {
  if (props.disabled) return
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    activeIndex.value = props.options.findIndex(o => o.value === props.modelValue)
    nextTick(updatePosition)
  }
}

function updatePosition() {
  if (!wrapperRef.value) return
  const rect = wrapperRef.value.getBoundingClientRect()
  dropdownPos.value = {
    top: rect.bottom + 4,
    left: rect.left,
    width: rect.width,
  }
}

function onSelect(opt: SelectOption) {
  if (opt.disabled) return
  emit('update:modelValue', opt.value)
  isOpen.value = false
}

function onTriggerKeydown(e: KeyboardEvent) {
  if (!isOpen.value) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      isOpen.value = true
      activeIndex.value = props.options.findIndex(o => o.value === props.modelValue)
      nextTick(updatePosition)
    }
    return
  }

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      if (activeIndex.value < props.options.length - 1) {
        activeIndex.value++
        scrollToActive()
      }
      break
    case 'ArrowUp':
      e.preventDefault()
      if (activeIndex.value > 0) {
        activeIndex.value--
        scrollToActive()
      }
      break
    case 'Enter':
    case ' ':
      e.preventDefault()
      if (activeIndex.value >= 0 && activeIndex.value < props.options.length) {
        onSelect(props.options[activeIndex.value])
      }
      break
    case 'Escape':
      e.preventDefault()
      isOpen.value = false
      break
    case 'Home':
      e.preventDefault()
      activeIndex.value = 0
      scrollToActive()
      break
    case 'End':
      e.preventDefault()
      activeIndex.value = props.options.length - 1
      scrollToActive()
      break
  }
}

function scrollToActive() {
  nextTick(() => {
    if (!dropdownRef.value) return
    const focusedEl = dropdownRef.value.querySelector('.ws-select__option--focused') as HTMLElement
      || dropdownRef.value.children[activeIndex.value] as HTMLElement
    focusedEl?.scrollIntoView({ block: 'nearest' })
  })
}

function onClickOutside(e: MouseEvent) {
  if (!isOpen.value) return
  const target = e.target as Node
  if (wrapperRef.value?.contains(target)) return
  if (dropdownRef.value?.contains(target)) return
  isOpen.value = false
}

onMounted(() => {
  document.addEventListener('mousedown', onClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onClickOutside)
})
</script>

<style scoped>
.ws-select { display: flex; flex-direction: column; gap: var(--space-1); }
.ws-select__label { font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); color: var(--color-text-secondary); }
.ws-select__trigger {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--input-padding); border: 1px solid var(--select-border);
  border-radius: var(--select-radius); background: var(--select-bg);
  font-size: var(--font-size-base); font-family: var(--font-family-base);
  color: var(--input-color); cursor: pointer; outline: none; text-align: left;
  transition: border-color var(--duration-fast) var(--ease-default), box-shadow var(--duration-fast) var(--ease-default);
}
.ws-select__trigger:focus-visible { border-color: var(--select-border-focus); box-shadow: var(--shadow-focus-ring); }
.ws-select__value { flex: 1; }
.ws-select__placeholder { flex: 1; color: var(--input-placeholder); }
.ws-select__arrow { font-size: var(--font-size-sm); color: var(--color-text-tertiary); transition: transform var(--duration-fast) var(--ease-default); }
.ws-select__arrow.open { transform: rotate(180deg); }
.ws-select--disabled .ws-select__trigger { opacity: 0.5; cursor: not-allowed; }
.ws-select--error .ws-select__trigger { border-color: var(--color-danger); }
.ws-select__error { font-size: var(--font-size-xs); color: var(--color-danger); }

.ws-select__dropdown {
  position: fixed; z-index: var(--z-popover);
  background: var(--dropdown-bg); border: 1px solid var(--dropdown-border);
  border-radius: var(--dropdown-radius); box-shadow: var(--dropdown-shadow);
  max-height: 240px; overflow-y: auto; padding: var(--space-1);
}
.ws-select__option {
  padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm);
  font-size: var(--font-size-sm); cursor: pointer; color: var(--color-text-primary);
  transition: background var(--duration-fast) var(--ease-default);
}
.ws-select__option:hover { background: var(--select-option-hover); }
.ws-select__option--active { background: var(--select-option-active); color: var(--color-primary); font-weight: var(--font-weight-medium); }
.ws-select__option--focused { background: var(--color-bg-hover); }
.ws-select__option:focus-visible { box-shadow: inset var(--shadow-focus-ring); outline: none; }
.ws-select__option--disabled { opacity: 0.5; cursor: not-allowed; }

.ws-select-enter-active { transition: opacity var(--duration-fast) var(--ease-default), transform var(--duration-fast) var(--ease-default); }
.ws-select-leave-active { transition: opacity var(--duration-instant) var(--ease-default); }
.ws-select-enter-from, .ws-select-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
