<template>
  <div class="cd-wrapper" :class="{ disabled }" ref="wrapperRef">
    <button class="cd-trigger" @click="toggle" :disabled="disabled">
      <span class="cd-value">{{ selectedLabel || placeholder || '—' }}</span>
      <span class="cd-arrow" :class="{ open: isOpen }">▾</span>
    </button>
    <Transition name="ws-menu">
      <div v-if="isOpen" class="cd-dropdown">
        <button
          v-for="(opt, i) in options"
          :key="opt.value"
          class="cd-option"
          :class="{ selected: opt.value === modelValue }"
          :style="{ animationDelay: i * 30 + 'ms' }"
          @click="select(opt.value)">
          {{ opt.label }}
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

interface Props {
  modelValue: string
  options: { value: string; label: string }[]
  placeholder?: string
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '',
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const isOpen = ref(false)
const wrapperRef = ref<HTMLDivElement>()

const selectedLabel = computed(() => {
  const opt = props.options.find(o => o.value === props.modelValue)
  return opt?.label || ''
})

function toggle() {
  if (props.disabled) return
  isOpen.value = !isOpen.value
}

function select(value: string) {
  emit('update:modelValue', value)
  isOpen.value = false
}

function onClickOutside(e: MouseEvent) {
  if (wrapperRef.value && !wrapperRef.value.contains(e.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', onClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside)
})
</script>

<style scoped>
.cd-wrapper {
  position: relative;
  display: inline-block;
}
.cd-wrapper.disabled {
  opacity: 0.5;
  pointer-events: none;
}
.cd-trigger {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--input-bg, #fff);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 4px 8px;
  cursor: pointer;
  color: var(--text);
  font-size: inherit;
  font-family: inherit;
  min-width: 60px;
}
.cd-trigger:disabled {
  cursor: not-allowed;
}
.cd-value {
  flex: 1;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cd-arrow {
  transition: transform 0.15s ease;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}
.cd-arrow.open {
  transform: rotate(180deg);
}
.cd-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 100;
  background: var(--modal-bg, #fff);
  border: 1px solid var(--border);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  min-width: 100%;
  padding: 4px 0;
  margin-top: 2px;
}
.cd-option {
  display: block;
  width: 100%;
  padding: 6px 12px;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
  font-size: inherit;
  font-family: inherit;
  color: var(--text);
  white-space: nowrap;
}
.cd-option:hover {
  background: var(--hover-bg, rgba(0,0,0,0.05));
}
.cd-option.selected {
  background: var(--accent-bg, rgba(167,139,250,0.1));
  color: var(--accent);
  font-weight: var(--font-weight-semibold);
}


</style>
