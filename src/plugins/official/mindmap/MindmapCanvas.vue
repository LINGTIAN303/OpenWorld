<template>
  <div class="mm-canvas-wrap" ref="canvasWrapRef">
    <div ref="containerRef" class="mm-cytoscape"></div>
    <canvas ref="overlayCanvasRef" class="mm-overlay-canvas"
      @mousedown="onOverlayMouseDown"
      @mousemove="onOverlayMouseMove"
      @mouseup="onOverlayMouseUp"
    />
    <slot name="vue-overlay"></slot>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'

const canvasWrapRef = ref<HTMLDivElement>()
const containerRef = ref<HTMLDivElement>()
const overlayCanvasRef = ref<HTMLCanvasElement>()

const emit = defineEmits<{
  'canvas-ready': [container: HTMLDivElement]
  'selection-rect': [rect: { x1: number; y1: number; x2: number; y2: number } | null]
}>()

const isSelecting = ref(false)
const selStart = ref({ x: 0, y: 0 })
const selEnd = ref({ x: 0, y: 0 })

function syncCanvasSize() {
  const wrap = canvasWrapRef.value
  const canvas = overlayCanvasRef.value
  if (!wrap || !canvas) return
  canvas.width = wrap.clientWidth
  canvas.height = wrap.clientHeight
  canvas.style.width = wrap.clientWidth + 'px'
  canvas.style.height = wrap.clientHeight + 'px'
}

function drawSelectionRect() {
  const canvas = overlayCanvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (!isSelecting.value) return
  const x = Math.min(selStart.value.x, selEnd.value.x)
  const y = Math.min(selStart.value.y, selEnd.value.y)
  const w = Math.abs(selEnd.value.x - selStart.value.x)
  const h = Math.abs(selEnd.value.y - selStart.value.y)
  ctx.strokeStyle = '#6c5ce7'
  ctx.lineWidth = 2
  ctx.setLineDash([6, 4])
  ctx.strokeRect(x, y, w, h)
  ctx.fillStyle = 'rgba(108, 92, 231, 0.08)'
  ctx.fillRect(x, y, w, h)
}

function onOverlayMouseDown(e: MouseEvent) {
  if (!e.shiftKey) return
  isSelecting.value = true
  const rect = overlayCanvasRef.value!.getBoundingClientRect()
  selStart.value = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  selEnd.value = { ...selStart.value }
}

function onOverlayMouseMove(e: MouseEvent) {
  if (!isSelecting.value) return
  const rect = overlayCanvasRef.value!.getBoundingClientRect()
  selEnd.value = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  drawSelectionRect()
}

function onOverlayMouseUp() {
  if (!isSelecting.value) return
  isSelecting.value = false
  drawSelectionRect()
  const x1 = Math.min(selStart.value.x, selEnd.value.x)
  const y1 = Math.min(selStart.value.y, selEnd.value.y)
  const x2 = Math.max(selStart.value.x, selEnd.value.x)
  const y2 = Math.max(selStart.value.y, selEnd.value.y)
  if (Math.abs(x2 - x1) > 10 && Math.abs(y2 - y1) > 10) {
    emit('selection-rect', { x1, y1, x2, y2 })
  }
}

onMounted(async () => {
  await nextTick()
  syncCanvasSize()
  if (containerRef.value) {
    emit('canvas-ready', containerRef.value)
  }
  window.addEventListener('resize', syncCanvasSize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncCanvasSize)
})

watch(() => canvasWrapRef.value, () => { syncCanvasSize() })

defineExpose({ containerRef, overlayCanvasRef, syncCanvasSize })
</script>

<style scoped>
.mm-canvas-wrap { flex: 1; position: relative; min-height: 0; overflow: hidden; }
.mm-cytoscape { position: absolute; inset: 0; }
.mm-overlay-canvas {
  position: absolute; inset: 0; pointer-events: none; z-index: 10;
}
.mm-overlay-canvas.shift-pressed { pointer-events: auto; cursor: crosshair; }
</style>
