<template>
  <div :class="['ws-skeleton', `ws-skeleton--${variant}`, 'ws-skeleton-animated']" :style="customStyle" aria-hidden="true">
    <div v-if="variant === 'text'" class="ws-skeleton__line" :style="{ width }"></div>
    <div v-else-if="variant === 'circle'" class="ws-skeleton__circle" :style="{ width, height: width }"></div>
    <div v-else-if="variant === 'rect'" class="ws-skeleton__rect" :style="{ width, height }"></div>
    <slot v-else />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  variant?: 'text' | 'circle' | 'rect'
  width?: string
  height?: string
  loading?: boolean
}>(), {
  variant: 'text',
  width: '100%',
  height: '16px',
  loading: true,
})

const customStyle = computed(() => ({
  '--skel-w': props.width,
  '--skel-h': props.height,
}))
</script>

<style scoped>
.ws-skeleton { }

.ws-skeleton__line,
.ws-skeleton__circle,
.ws-skeleton__rect {
  background: var(--skeleton-bg);
  border-radius: var(--skeleton-radius);
}

.ws-skeleton__line { width: var(--skel-w); height: 14px; border-radius: var(--radius-sm); }
.ws-skeleton__circle { width: var(--skel-w); height: var(--skel-w); border-radius: var(--radius-full); }
.ws-skeleton__rect { width: var(--skel-w); height: var(--skel-h); }
</style>
