<template>
  <svg
    v-if="def"
    :class="['ws-icon', `ws-icon--${resolvedSize}`, { 'ws-icon--fill': def.fill }]"
    :width="resolvedPixelSize"
    :height="resolvedPixelSize"
    viewBox="0 0 24 24"
    :fill="def.fill ? 'currentColor' : 'none'"
    stroke="currentColor"
    :stroke-width="def.fill ? 0 : resolvedStrokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path v-if="def.d" :d="def.d" />
  </svg>
  <component
    v-else-if="lucideIcon"
    :is="lucideIcon"
    :size="resolvedPixelSize"
    :stroke-width="resolvedStrokeWidth"
    class="ws-icon ws-icon--lucide"
    :class="[`ws-icon--${resolvedSize}`]"
  />
  <span v-else-if="fallback" class="ws-icon-fallback">{{ fallback }}</span>
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue'
import { getIcon } from '../assets/iconRegistry'
import { resolveLucideIcon } from './lucideMap'

type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const SIZE_MAP: Record<IconSize, number> = {
  xs: 14,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
}

const props = withDefaults(defineProps<{
  name: string
  size?: IconSize | number | string
  strokeWidth?: number
  fallback?: string
}>(), {
  size: 'md',
  strokeWidth: 0,
  fallback: '',
})

const def = computed(() => getIcon(props.name))

const lucideIcon = computed<Component | null>(() => {
  if (def.value) return null
  return resolveLucideIcon(props.name)
})

const resolvedSize = computed<IconSize | 'custom'>(() => {
  if (typeof props.size === 'string' && props.size in SIZE_MAP) return props.size as IconSize
  return 'custom'
})

const resolvedPixelSize = computed(() => {
  if (typeof props.size === 'string' && props.size in SIZE_MAP) return SIZE_MAP[props.size as IconSize]
  if (typeof props.size === 'number') return props.size
  return parseInt(String(props.size), 10) || 20
})

const resolvedStrokeWidth = computed(() => {
  if (props.strokeWidth > 0) return props.strokeWidth
  const px = resolvedPixelSize.value
  if (px <= 16) return 1.5
  if (px <= 24) return 2
  return 2
})
</script>

<style scoped>
.ws-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  vertical-align: -0.125em;
  transition: color var(--duration-fast) var(--ease-default);
  stroke-linecap: var(--icon-stroke-linecap, round);
  stroke-linejoin: var(--icon-stroke-linejoin, round);
}

.ws-icon--lucide {
  color: currentColor;
}

.ws-icon--xs { width: var(--icon-size-xs, 14px); height: var(--icon-size-xs, 14px); }
.ws-icon--sm { width: var(--icon-size-sm, 16px); height: var(--icon-size-sm, 16px); }
.ws-icon--md { width: var(--icon-size-md, 20px); height: var(--icon-size-md, 20px); }
.ws-icon--lg { width: var(--icon-size-lg, 24px); height: var(--icon-size-lg, 24px); }
.ws-icon--xl { width: var(--icon-size-xl, 32px); height: var(--icon-size-xl, 32px); }

.ws-icon-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85em;
}
</style>
