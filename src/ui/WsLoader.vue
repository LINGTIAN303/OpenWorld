<template>
  <span
    :class="rootClasses"
    :style="rootStyle"
    :role="accessible ? 'status' : undefined"
    :aria-label="accessible ? label : undefined"
  >
    <!-- 1. 旋转圆环 -->
    <template v-if="type === 'spin-ring'">
      <span class="ws-loader__ring"></span>
    </template>

    <!-- 2. 脉冲圆点 -->
    <template v-else-if="type === 'pulse-dots'">
      <span class="ws-loader__dot" style="animation-delay: 0s"></span>
      <span class="ws-loader__dot" style="animation-delay: 0.16s"></span>
      <span class="ws-loader__dot" style="animation-delay: 0.32s"></span>
    </template>

    <!-- 3. 弹跳柱条 -->
    <template v-else-if="type === 'bounce-bars'">
      <span class="ws-loader__bar" style="animation-delay: 0s"></span>
      <span class="ws-loader__bar" style="animation-delay: 0.1s"></span>
      <span class="ws-loader__bar" style="animation-delay: 0.2s"></span>
      <span class="ws-loader__bar" style="animation-delay: 0.3s"></span>
      <span class="ws-loader__bar" style="animation-delay: 0.4s"></span>
    </template>

    <!-- 4. 波纹圆圈 -->
    <template v-else-if="type === 'ripple'">
      <span class="ws-loader__ripple-ring" style="animation-delay: 0s"></span>
      <span class="ws-loader__ripple-ring" style="animation-delay: 0.5s"></span>
      <span class="ws-loader__ripple-ring" style="animation-delay: 1s"></span>
    </template>

    <!-- 5. 渐变旋转器 -->
    <template v-else-if="type === 'conic-spin'">
      <span class="ws-loader__conic"></span>
    </template>

    <!-- 6. 打字指示器 -->
    <template v-else-if="type === 'typing'">
      <span class="ws-loader__typing-dot" style="animation-delay: 0s"></span>
      <span class="ws-loader__typing-dot" style="animation-delay: 0.14s"></span>
      <span class="ws-loader__typing-dot" style="animation-delay: 0.28s"></span>
    </template>

    <!-- 7. 骨架屏微光 -->
    <template v-else-if="type === 'shimmer'">
      <span class="ws-loader__shimmer-body"></span>
      <span class="ws-loader__shimmer-sweep"></span>
    </template>

    <!-- 8. DNA 双螺旋 -->
    <template v-else-if="type === 'dna'">
      <span class="ws-loader__dna-strand">
        <span class="ws-loader__dna-dot" style="animation-delay: 0s"></span>
        <span class="ws-loader__dna-dot" style="animation-delay: 0.12s"></span>
        <span class="ws-loader__dna-dot" style="animation-delay: 0.24s"></span>
        <span class="ws-loader__dna-dot" style="animation-delay: 0.36s"></span>
        <span class="ws-loader__dna-dot" style="animation-delay: 0.48s"></span>
        <span class="ws-loader__dna-dot" style="animation-delay: 0.6s"></span>
      </span>
    </template>

    <!-- Screen reader text -->
    <span v-if="accessible" class="ws-loader__sr">{{ label }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { injectKeyframe, type KeyframeName } from '@worldsmith/motion-kit'

export type WsLoaderType =
  | 'spin-ring'
  | 'pulse-dots'
  | 'bounce-bars'
  | 'ripple'
  | 'conic-spin'
  | 'typing'
  | 'shimmer'
  | 'dna'

const props = withDefaults(defineProps<{
  type?: WsLoaderType
  size?: 'sm' | 'md' | 'lg'
  color?: string
  label?: string
  accessible?: boolean
}>(), {
  type: 'spin-ring',
  size: 'md',
  color: '',
  label: '加载中',
  accessible: true,
})

// Keyframe mapping — inject only the keyframes this loader needs
const KEYFRAME_MAP: Record<WsLoaderType, KeyframeName[]> = {
  'spin-ring': ['ws-loader-spin-ring'],
  'pulse-dots': ['ws-loader-pulse-dot'],
  'bounce-bars': ['ws-loader-bounce-bar'],
  'ripple': ['ws-loader-ripple-ring'],
  'conic-spin': ['ws-loader-conic-spin'],
  'typing': ['ws-loader-typing-dot'],
  'shimmer': ['ws-loader-shimmer'],
  'dna': ['ws-loader-dna-rotate'],
}

onMounted(() => {
  const names = KEYFRAME_MAP[props.type]
  if (names) names.forEach(n => injectKeyframe(n))
})

const rootClasses = computed(() => [
  'ws-loader',
  `ws-loader--${props.type}`,
  `ws-loader--${props.size}`,
])

const rootStyle = computed(() => {
  const s: Record<string, string> = {}
  if (props.color) s['--ws-loader-color'] = props.color
  return s
})
</script>

<style scoped>
/* ─── Base ─── */
.ws-loader {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  --ws-loader-color: var(--color-primary, #7c5cfc);
  --ws-loader-size: var(--icon-size-md, 20px);
  --ws-loader-track: var(--color-border, rgba(124, 92, 252, 0.2));
}

.ws-loader--sm { --ws-loader-size: var(--icon-size-sm, 16px); }
.ws-loader--lg { --ws-loader-size: var(--icon-size-lg, 24px); }

.ws-loader__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

/* ─── 1. 旋转圆环 (spin-ring) ─── */
.ws-loader--spin-ring {
  width: var(--ws-loader-size);
  height: var(--ws-loader-size);
}

.ws-loader__ring {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 2.5px solid var(--ws-loader-track);
  border-top-color: var(--ws-loader-color);
  animation: ws-loader-spin-ring 0.8s linear infinite;
}

.ws-loader--sm .ws-loader__ring { border-width: 2px; }
.ws-loader--lg .ws-loader__ring { border-width: 3px; }

/* ─── 2. 脉冲圆点 (pulse-dots) ─── */
.ws-loader--pulse-dots {
  gap: calc(var(--ws-loader-size) * 0.35);
}

.ws-loader__dot {
  display: block;
  width: calc(var(--ws-loader-size) * 0.35);
  height: calc(var(--ws-loader-size) * 0.35);
  border-radius: 50%;
  background: var(--ws-loader-color);
  animation: ws-loader-pulse-dot 1.2s ease-in-out infinite;
}

/* ─── 3. 弹跳柱条 (bounce-bars) ─── */
.ws-loader--bounce-bars {
  gap: 3px;
  height: var(--ws-loader-size);
}

.ws-loader__bar {
  display: block;
  width: calc(var(--ws-loader-size) * 0.18);
  height: 100%;
  border-radius: 2px;
  background: var(--ws-loader-color);
  transform-origin: center;
  animation: ws-loader-bounce-bar 1.2s ease-in-out infinite;
}

/* ─── 4. 波纹圆圈 (ripple) ─── */
.ws-loader--ripple {
  width: var(--ws-loader-size);
  height: var(--ws-loader-size);
}

.ws-loader__ripple-ring {
  position: absolute;
  inset: 0;
  border: 2px solid var(--ws-loader-color);
  border-radius: 50%;
  animation: ws-loader-ripple-ring 1.5s ease-out infinite;
}

/* ─── 5. 渐变旋转器 (conic-spin) ─── */
.ws-loader--conic-spin {
  width: var(--ws-loader-size);
  height: var(--ws-loader-size);
}

.ws-loader__conic {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: conic-gradient(
    from 0deg,
    transparent 0%,
    var(--ws-loader-color) 100%
  );
  animation: ws-loader-conic-spin 1s linear infinite;
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2.5px));
  mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2.5px));
}

.ws-loader--sm .ws-loader__conic {
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 1.5px));
  mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 1.5px));
}

/* ─── 6. 打字指示器 (typing) ─── */
.ws-loader--typing {
  gap: calc(var(--ws-loader-size) * 0.22);
  padding: calc(var(--ws-loader-size) * 0.25) calc(var(--ws-loader-size) * 0.35);
  background: var(--color-bg-elevated, rgba(0, 0, 0, 0.06));
  border-radius: calc(var(--ws-loader-size) * 0.5);
}

.ws-loader__typing-dot {
  display: block;
  width: calc(var(--ws-loader-size) * 0.25);
  height: calc(var(--ws-loader-size) * 0.25);
  border-radius: 50%;
  background: var(--ws-loader-color);
  animation: ws-loader-typing-dot 1.4s ease-in-out infinite;
}

/* ─── 7. 骨架屏微光 (shimmer) ─── */
.ws-loader--shimmer {
  width: calc(var(--ws-loader-size) * 6);
  height: calc(var(--ws-loader-size) * 0.8);
  border-radius: var(--radius-md, 6px);
  overflow: hidden;
  background: var(--color-bg-elevated, rgba(0, 0, 0, 0.06));
}

.ws-loader__shimmer-body {
  position: absolute;
  inset: 0;
  background: var(--color-bg-elevated, rgba(0, 0, 0, 0.06));
}

.ws-loader__shimmer-sweep {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.15) 40%,
    rgba(255, 255, 255, 0.3) 50%,
    rgba(255, 255, 255, 0.15) 60%,
    transparent 100%
  );
  animation: ws-loader-shimmer 1.8s ease-in-out infinite;
}

/* ─── 8. DNA 双螺旋 (dna) ─── */
.ws-loader--dna {
  width: var(--ws-loader-size);
  height: calc(var(--ws-loader-size) * 2);
  perspective: calc(var(--ws-loader-size) * 4);
}

.ws-loader__dna-strand {
  display: flex;
  flex-direction: column;
  gap: calc(var(--ws-loader-size) * 0.15);
  width: 100%;
  height: 100%;
  animation: ws-loader-dna-rotate 2s linear infinite;
  transform-style: preserve-3d;
}

.ws-loader__dna-dot {
  display: block;
  width: calc(var(--ws-loader-size) * 0.28);
  height: calc(var(--ws-loader-size) * 0.28);
  border-radius: 50%;
  background: var(--ws-loader-color);
  align-self: center;
  animation: ws-loader-dna-rotate 2s linear infinite;
}

/* ─── Reduced Motion ─── */
@media (prefers-reduced-motion: reduce) {
  .ws-loader__ring,
  .ws-loader__dot,
  .ws-loader__bar,
  .ws-loader__ripple-ring,
  .ws-loader__conic,
  .ws-loader__typing-dot,
  .ws-loader__shimmer-sweep,
  .ws-loader__dna-strand,
  .ws-loader__dna-dot {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }

  /* For shimmer, show static highlight instead of sweep */
  .ws-loader__shimmer-sweep {
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.12) 50%,
      transparent 100%
    );
  }
}
</style>
