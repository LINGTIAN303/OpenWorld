<template>
  <Teleport to="body">
    <Transition name="ws-inspector-backdrop">
      <div v-if="show" class="ws-inspector-backdrop"></div>
    </Transition>
    <Transition name="ws-inspector" @after-enter="onAfterEnter" @before-leave="onBeforeLeave">
      <div
        v-if="show"
        :class="['ws-inspector', { 'ws-inspector--resizing': isResizing }]"
        :style="{ width: `${panelWidth}px`, top: 'var(--layout-menubar-height)', height: `calc(100vh - var(--layout-menubar-height))` }"
        ref="panelRef"
        role="dialog"
        aria-modal="true"
        :aria-label="title || 'Inspector panel'"
      >
        <div class="ws-inspector__resize-handle" @mousedown="onResizeStart"></div>
        <div v-if="title" class="ws-inspector__header">
          <span class="ws-inspector__title">{{ title }}</span>
          <button class="ws-inspector__close" aria-label="关闭" @click="$emit('close')"><WsIcon name="close" size="xs" /></button>
        </div>
        <div class="ws-inspector__body">
          <slot />
        </div>
        <div v-if="$slots.footer" class="ws-inspector__footer">
          <slot name="footer" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onBeforeUnmount, toRef } from 'vue'
import { useFocusTrap } from '../composables/useFocusTrap'
import WsIcon from './WsIcon.vue'

const props = withDefaults(defineProps<{
  show: boolean
  title?: string
  defaultWidth?: number
  minWidth?: number
  maxWidth?: number
  closeOnBackdrop?: boolean
}>(), {
  defaultWidth: 400,
  minWidth: 280,
  maxWidth: 600,
  closeOnBackdrop: true,
})

const emit = defineEmits<{ close: [] }>()

const panelRef = ref<HTMLElement | null>(null)
const panelWidth = ref(props.defaultWidth)
const isResizing = ref(false)
let startX = 0
let startWidth = 0

const { activate, deactivate } = useFocusTrap(panelRef, {
  active: toRef(props, 'show'),
  restoreFocus: true,
  escapeDeactivates: true,
  onEscape: () => emit('close'),
})

function onAfterEnter() {
  activate()
}

function onBeforeLeave() {
  deactivate()
}

function onResizeStart(e: MouseEvent) {
  e.preventDefault()
  isResizing.value = true
  startX = e.clientX
  startWidth = panelWidth.value
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeEnd)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function onResizeMove(e: MouseEvent) {
  if (!isResizing.value) return
  const delta = startX - e.clientX
  const newWidth = Math.min(props.maxWidth, Math.max(props.minWidth, startWidth + delta))
  panelWidth.value = newWidth
}

function onResizeEnd() {
  isResizing.value = false
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
})
</script>

<style scoped>
.ws-inspector-backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--z-detail-backdrop);
  background: var(--color-overlay);
  pointer-events: none;
}

.ws-inspector {
  position: fixed;
  right: 0;
  z-index: var(--z-detail);
  display: flex;
  flex-direction: column;
  background: var(--color-bg-surface);
  border-left: var(--layout-divider-width) solid var(--layout-divider-color);
  box-shadow: var(--shadow-xl);
  overflow: hidden;
}

.ws-inspector--resizing {
  transition: none;
}

.ws-inspector__resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: col-resize;
  z-index: 1;
}
.ws-inspector__resize-handle:hover {
  background: var(--color-primary-subtle);
}

.ws-inspector__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border-subtle);
  flex-shrink: 0;
}

.ws-inspector__title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ws-inspector__close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--font-size-base);
  color: var(--color-text-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--duration-fast) var(--ease-default);
  flex-shrink: 0;
}
.ws-inspector__close:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}
.ws-inspector__close:focus-visible { box-shadow: var(--shadow-focus-ring); outline: none; }

.ws-inspector__body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
}

.ws-inspector__footer {
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--color-border-subtle);
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
  flex-shrink: 0;
}
</style>
