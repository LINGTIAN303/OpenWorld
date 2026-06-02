import { ref, shallowRef, type Ref } from 'vue'
import {
  drawBoard,
  computeCellSize,
  getBoardPixelSize,
  hitTestCell,
  type BoardCamera,
  type BoardRenderData,
} from './boardDraw'

export function useBoardRenderer(
  containerRef: Ref<HTMLElement | null>,
  renderData: Ref<BoardRenderData>,
) {
  const canvas = shallowRef<HTMLCanvasElement | null>(null)
  const ctx = shallowRef<CanvasRenderingContext2D | null>(null)
  const camera = ref<BoardCamera>({ x: 0, y: 0, k: 1 })
  const cellSize = ref(40)

  let isRunning = false
  let animFrame = 0
  let _dirty = true
  let _forceRenderCount = 0
  let resizeObs: ResizeObserver | null = null

  function init(): void {
    if (!containerRef.value) return
    const el = document.createElement('canvas')
    el.style.width = '100%'
    el.style.height = '100%'
    el.style.display = 'block'
    el.style.cursor = 'crosshair'
    containerRef.value.appendChild(el)
    canvas.value = el
    const c = el.getContext('2d')
    if (!c) return
    ctx.value = c
    resize()
    fitBoard()
    startRenderLoop()

    resizeObs = new ResizeObserver(() => {
      resize()
      fitBoard()
    })
    resizeObs.observe(containerRef.value)
  }

  function destroy(): void {
    isRunning = false
    if (animFrame) cancelAnimationFrame(animFrame)
    if (resizeObs) resizeObs.disconnect()
    if (canvas.value && canvas.value.parentNode) {
      canvas.value.parentNode.removeChild(canvas.value)
    }
    canvas.value = null
    ctx.value = null
  }

  function resize(): void {
    if (!canvas.value || !containerRef.value) return
    const rect = containerRef.value.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.value.width = rect.width * dpr
    canvas.value.height = rect.height * dpr
    canvas.value.style.width = rect.width + 'px'
    canvas.value.style.height = rect.height + 'px'
    ctx.value?.scale(dpr, dpr)
    markDirty()
  }

  function fitBoard(): void {
    if (!containerRef.value) return
    const rect = containerRef.value.getBoundingClientRect()
    const d = renderData.value
    const cs = computeCellSize(d.gridType, d.width, d.height, rect.width, rect.height)
    cellSize.value = cs
    const { bw, bh } = getBoardPixelSize(d.gridType, d.width, d.height, cs)
    camera.value = {
      x: bw / 2,
      y: bh / 2,
      k: 1,
    }
    markDirty()
  }

  function markDirty(): void {
    _dirty = true
  }

  function startRenderLoop(): void {
    isRunning = true
    _forceRenderCount = 3
    function frame() {
      if (!isRunning) return
      if (_dirty || _forceRenderCount > 0) {
        render()
        _dirty = false
        if (_forceRenderCount > 0) _forceRenderCount--
      }
      animFrame = requestAnimationFrame(frame)
    }
    frame()
  }

  function render(): void {
    if (!ctx.value || !canvas.value || !containerRef.value) return
    const rect = containerRef.value.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const w = rect.width
    const h = rect.height

    ctx.value.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawBoard(ctx.value, w, h, renderData.value, camera.value, cellSize.value)
  }

  function getCanvasElement(): HTMLCanvasElement | null {
    return canvas.value
  }

  function getCamera(): BoardCamera {
    return { ...camera.value }
  }

  function setCamera(c: BoardCamera): void {
    camera.value = c
    markDirty()
  }

  function screenToCell(sx: number, sy: number): { x: number; y: number } | null {
    if (!containerRef.value) return null
    const rect = containerRef.value.getBoundingClientRect()
    const d = renderData.value
    return hitTestCell(
      sx - rect.left,
      sy - rect.top,
      rect.width,
      rect.height,
      camera.value,
      d.gridType,
      d.width,
      d.height,
      cellSize.value,
    )
  }

  function screenToWorld(sx: number, sy: number): { x: number; y: number } {
    if (!containerRef.value) return { x: sx, y: sy }
    const rect = containerRef.value.getBoundingClientRect()
    const cx = rect.width / 2
    const cy = rect.height / 2
    return {
      x: (sx - rect.left - cx) / camera.value.k + camera.value.x,
      y: (sy - rect.top - cy) / camera.value.k + camera.value.y,
    }
  }

  return {
    canvas,
    camera,
    cellSize,
    init,
    destroy,
    resize,
    fitBoard,
    markDirty,
    getCanvasElement,
    getCamera,
    setCamera,
    screenToCell,
    screenToWorld,
  }
}
