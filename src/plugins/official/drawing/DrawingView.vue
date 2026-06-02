<template>
  <div class="drawing-view">
    <div class="dv-toolbar">
      <input type="color" v-model="strokeColor" class="dv-color" title="笔触颜色" />
      <input type="range" v-model="strokeWidth" min="1" max="20" class="dv-width" title="笔触粗细" />
      <span class="dv-label">{{ strokeWidth }}px</span>
      <button class="dv-btn" @click="undo" :disabled="history.length === 0">撤销</button>
      <button class="dv-btn" @click="redo" :disabled="future.length === 0">重做</button>
      <button class="dv-btn dv-btn-danger" @click="clearCanvas">清空</button>
      <button class="dv-btn dv-btn-primary" @click="saveAsImage">保存图片</button>
      <span class="dv-sep">|</span>
      <button class="dv-btn" @click="zoomIn">+</button>
      <span class="dv-zoom">{{ Math.round(scale * 100) }}%</span>
      <button class="dv-btn" @click="zoomOut">-</button>
      <button class="dv-btn" @click="fitView">适应</button>
    </div>
    <div class="dv-viewport" :style="{ cursor: viewportCursor }"
      @wheel.prevent="onWheel"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @mouseleave="onMouseUp"
      @touchstart.passive="onTouchStart"
      @touchmove.prevent="onTouchMove"
      @touchend="onTouchEnd"
      @contextmenu.prevent>
      <canvas ref="canvasRef" class="dv-canvas"
        :style="{ transform: `translate(${panX}px, ${panY}px) scale(${scale})`, transformOrigin: '0 0' }" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useShortcuts, useCanvas } from '@worldsmith/ui-kit'
import { useSettingsStore } from '../../../stores/settingsStore'

const {
  canvasRef,
  getCtx,
  getDrawPos,
  resizeCanvas,
  fillCanvas,
  saveState: canvasSaveState,
  restoreState,
  panX,
  panY,
  scale,
  isPanning,
  spaceHeld,
  onWheel,
  zoomIn,
  zoomOut,
  fitView,
  setupKeyboard,
  startPan,
  doPan,
  endPan,
  saveAsImage,
} = useCanvas()

const { register, unregister } = useShortcuts()

const strokeColor = ref('#000000')
const strokeWidth = ref(3)
const history: ImageData[] = []
const future: ImageData[] = []
let drawing = false
let panStartX = 0
let panStartY = 0

const viewportCursor = computed(() => {
  if (isPanning.value) return 'grabbing'
  if (spaceHeld.value) return 'grab'
  return 'crosshair'
})

function localSaveState() {
  canvasSaveState(history, future)
}

onMounted(() => {
  resizeCanvas()
  fillCanvas('#ffffff')
  localSaveState()

  const removeKb = setupKeyboard()

  const settingsStore = useSettingsStore()
  register({ id: 'drawing.undo', keys: settingsStore.getShortcut('drawing.undo') || ['ctrl', 'z'], scope: 'view', description: '画板：撤销', handler: () => undo() })
  register({ id: 'drawing.redo', keys: settingsStore.getShortcut('drawing.redo') || ['ctrl', 'shift', 'z'], scope: 'view', description: '画板：重做', handler: () => redo() })
  register({ id: 'drawing.zoomIn', keys: ['ctrl', '='], scope: 'view', description: '画板：放大', handler: () => zoomIn() })
  register({ id: 'drawing.zoomOut', keys: ['ctrl', '-'], scope: 'view', description: '画板：缩小', handler: () => zoomOut() })
  register({ id: 'drawing.fitView', keys: ['ctrl', '0'], scope: 'view', description: '画板：适应视图', handler: () => fitView() })
})

onBeforeUnmount(() => {
  unregister('drawing.undo')
  unregister('drawing.redo')
  unregister('drawing.zoomIn')
  unregister('drawing.zoomOut')
  unregister('drawing.fitView')
})

function undo() {
  if (history.length <= 1) return
  future.push(history.pop()!)
  restoreState(history[history.length - 1])
}

function redo() {
  if (future.length === 0) return
  const data = future.pop()!
  history.push(data)
  restoreState(data)
}

function clearCanvas() {
  fillCanvas('#ffffff')
  localSaveState()
}

function onMouseDown(e: MouseEvent) {
  if (spaceHeld.value || e.button === 1) {
    e.preventDefault()
    const { startX, startY } = startPan(e)
    panStartX = startX
    panStartY = startY
    return
  }
  if (e.button !== 0) return
  drawing = true
  const pos = getDrawPos(e)
  const c = getCtx()
  if (!c) return
  c.beginPath()
  c.moveTo(pos.x, pos.y)
}

function onMouseMove(e: MouseEvent) {
  if (isPanning.value) {
    doPan(e, panStartX, panStartY)
    return
  }
  if (!drawing) return
  const pos = getDrawPos(e)
  const c = getCtx()
  if (!c) return
  c.strokeStyle = strokeColor.value
  c.lineWidth = strokeWidth.value
  c.lineCap = 'round'
  c.lineTo(pos.x, pos.y)
  c.stroke()
}

function onMouseUp() {
  if (drawing) {
    drawing = false
    localSaveState()
  }
  endPan()
}

let touchDrawing = false
function onTouchStart(e: TouchEvent) {
  touchDrawing = true
  const c = getCtx()
  if (!c || !e.touches[0]) return
  const pos = getTouchPos(e)
  c.beginPath()
  c.moveTo(pos.x, pos.y)
}

function getTouchPos(e: TouchEvent) {
  const canvas = canvasRef.value!
  const rect = canvas.getBoundingClientRect()
  return {
    x: (e.touches[0].clientX - rect.left) * (canvas.width / rect.width),
    y: (e.touches[0].clientY - rect.top) * (canvas.height / rect.height),
  }
}

function onTouchMove(e: TouchEvent) {
  if (!touchDrawing) return
  const c = getCtx()
  if (!c || !e.touches[0]) return
  const pos = getTouchPos(e)
  c.strokeStyle = strokeColor.value
  c.lineWidth = strokeWidth.value
  c.lineCap = 'round'
  c.lineTo(pos.x, pos.y)
  c.stroke()
}

function onTouchEnd() {
  if (touchDrawing) {
    touchDrawing = false
    localSaveState()
  }
}
</script>

<style scoped>
.drawing-view { display: flex; flex-direction: column; height: 100%; }
.dv-toolbar { display: flex; align-items: center; gap: 6px; padding: 6px 10px; background: var(--color-bg-surface); border-bottom: 1px solid var(--color-border-strong); flex-shrink: 0; flex-wrap: wrap; }
.dv-color { width: 36px; height: 30px; padding: 0; border: 1px solid var(--color-border-strong); border-radius: 4px; cursor: pointer; background: var(--color-bg-elevated); }
.dv-width { width: 100px; }
.dv-label { font-size: var(--font-size-xs); color: #6a5030; min-width: 24px; }
.dv-btn { padding: 4px 10px; border: 1px solid var(--color-border-strong); border-radius: 4px; background: var(--color-bg-elevated); cursor: pointer; font-size: var(--font-size-sm); color: var(--color-text-primary); }
.dv-btn:hover { background: #e8d8a8; }
.dv-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.dv-btn-danger { background: #e74c3c; color: #fff; border-color: #c0392b; }
.dv-btn-danger:hover { background: color-mix(in srgb, var(--color-danger) 80%, black); }
.dv-btn-primary { background: #4a6cf7; color: #fff; border-color: #3a5ce7; }
.dv-btn-primary:hover { background: #3a5ce7; }
.dv-sep { color: #c4a95a; font-size: var(--font-size-base); margin: 0 2px; }
.dv-zoom { font-size: var(--font-size-xs); color: #6a5030; width: 40px; text-align: center; }
.dv-viewport { flex: 1; overflow: hidden; position: relative; background: var(--color-bg-elevated); }
.dv-canvas { display: block; }
</style>