<template>
  <div class="ws-tooltip-wrapper" ref="wrapperRef" @mouseenter="show" @mouseleave="hide" @focusin="show" @focusout="hide">
    <slot />
    <Teleport to="body">
      <Transition name="ws-tooltip">
        <div
          v-if="visible"
          :class="['ws-tooltip', `ws-tooltip--${placement}`]"
          :style="positionStyle"
          role="tooltip"
        >
          <slot name="content">
            <span class="ws-tooltip__text">{{ content }}</span>
          </slot>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'

const props = withDefaults(defineProps<{
  content?: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
  delay?: number
}>(), {
  placement: 'top',
  delay: 200,
})

const wrapperRef = ref<HTMLElement | null>(null)
const visible = ref(false)
const pos = ref({ top: 0, left: 0 })
let timer: ReturnType<typeof setTimeout> | null = null

function show() {
  timer = setTimeout(() => {
    visible.value = true
    nextTick(updatePosition)
  }, props.delay)
}

function hide() {
  if (timer) { clearTimeout(timer); timer = null }
  visible.value = false
}

function updatePosition() {
  if (!wrapperRef.value) return
  const rect = wrapperRef.value.getBoundingClientRect()
  const gap = 8
  switch (props.placement) {
    case 'top':
      pos.value = { top: rect.top - gap, left: rect.left + rect.width / 2 }
      break
    case 'bottom':
      pos.value = { top: rect.bottom + gap, left: rect.left + rect.width / 2 }
      break
    case 'left':
      pos.value = { top: rect.top + rect.height / 2, left: rect.left - gap }
      break
    case 'right':
      pos.value = { top: rect.top + rect.height / 2, left: rect.right + gap }
      break
  }
}

const positionStyle = computed(() => {
  const base: Record<string, string> = {}
  switch (props.placement) {
    case 'top':
      base.bottom = `${window.innerHeight - pos.value.top}px`
      base.left = `${pos.value.left}px`
      base.transform = 'translateX(-50%)'
      break
    case 'bottom':
      base.top = `${pos.value.top}px`
      base.left = `${pos.value.left}px`
      base.transform = 'translateX(-50%)'
      break
    case 'left':
      base.right = `${window.innerWidth - pos.value.left}px`
      base.top = `${pos.value.top}px`
      base.transform = 'translateY(-50%)'
      break
    case 'right':
      base.left = `${pos.value.left}px`
      base.top = `${pos.value.top}px`
      base.transform = 'translateY(-50%)'
      break
  }
  return base
})
</script>

<style scoped>
.ws-tooltip-wrapper { display: inline-flex; }

.ws-tooltip {
  position: fixed; z-index: var(--z-tooltip);
  background: var(--tooltip-bg); color: var(--tooltip-color);
  border-radius: var(--tooltip-radius); box-shadow: var(--tooltip-shadow);
  padding: var(--space-1) var(--space-2);
  font-size: var(--font-size-xs); line-height: 1.4;
  pointer-events: none; white-space: nowrap;
  max-width: 280px; word-wrap: break-word; white-space: normal;
}
.ws-tooltip__text { }

.ws-tooltip-enter-active { transition: opacity var(--duration-fast) var(--ease-default), transform var(--duration-fast) var(--ease-default); }
.ws-tooltip-leave-active { transition: opacity var(--duration-instant) var(--ease-default); }
.ws-tooltip-enter-from, .ws-tooltip-leave-to { opacity: 0; }

.ws-tooltip--top.ws-tooltip-enter-from { transform: translateX(-50%) translateY(4px); }
.ws-tooltip--bottom.ws-tooltip-enter-from { transform: translateX(-50%) translateY(-4px); }
.ws-tooltip--left.ws-tooltip-enter-from { transform: translateY(-50%) translateX(4px); }
.ws-tooltip--right.ws-tooltip-enter-from { transform: translateY(-50%) translateX(-4px); }
</style>
