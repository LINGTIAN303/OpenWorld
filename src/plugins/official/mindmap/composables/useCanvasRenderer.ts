import { ref, watch, onBeforeUnmount, type Ref } from 'vue'
import type { CameraState, CanvasNode, CanvasEdge } from './canvasTypes'
import { drawGraph, type FreehandDrawFn } from './canvasDraw'

export function useCanvasRenderer(
  containerRef: Ref<HTMLElement | null>,
  getNodes: () => CanvasNode[],
  getEdges: () => CanvasEdge[],
) {
  const canvas = ref<HTMLCanvasElement | null>(null)
  const ctx = ref<CanvasRenderingContext2D | null>(null)
  const camera = ref<CameraState>({ x: 0, y: 0, k: 1 })
  const hoveredNodeId = ref<string | null>(null)
  const selectedNodeId = ref<string | null>(null)
  let animFrame = 0
  let isRunning = false
  let _freehandDrawFn: FreehandDrawFn | null = null
  let _dirty = true
  let _forceRenderCount = 0

  function markDirty(): void {
    _dirty = true
  }

  function init(): void {
    if (!containerRef.value) return
    const el = document.createElement('canvas')
    el.style.width = '100%'
    el.style.height = '100%'
    el.style.display = 'block'
    containerRef.value.appendChild(el)
    canvas.value = el
    const c = el.getContext('2d')
    if (!c) return
    ctx.value = c
    resize()
    startRenderLoop()
  }

  function destroy(): void {
    isRunning = false
    if (animFrame) cancelAnimationFrame(animFrame)
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

  function startRenderLoop(): void {
    isRunning = true
    _forceRenderCount = 60
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
    if (!ctx.value || !canvas.value) return
    const rect = containerRef.value?.getBoundingClientRect()
    if (!rect) return
    drawGraph(
      ctx.value,
      rect.width,
      rect.height,
      getNodes(),
      getEdges(),
      camera.value,
      hoveredNodeId.value,
      selectedNodeId.value,
      _freehandDrawFn,
    )
  }

  function setFreehandDrawFn(fn: FreehandDrawFn | null): void {
    _freehandDrawFn = fn
    markDirty()
  }

  function fitView(nodes: CanvasNode[]): void {
    if (nodes.length === 0) return
    let minX = Infinity, maxX = -Infinity
    let minY = Infinity, maxY = -Infinity
    for (const n of nodes) {
      if (n.hidden) continue
      if (n.x - n.width / 2 < minX) minX = n.x - n.width / 2
      if (n.x + n.width / 2 > maxX) maxX = n.x + n.width / 2
      if (n.y - n.height / 2 < minY) minY = n.y - n.height / 2
      if (n.y + n.height / 2 > maxY) maxY = n.y + n.height / 2
    }
    const rect = containerRef.value?.getBoundingClientRect()
    if (!rect) return
    const graphW = maxX - minX || 1
    const graphH = maxY - minY || 1
    const padding = 80
    const k = Math.min(
      (rect.width - padding * 2) / graphW,
      (rect.height - padding * 2) / graphH,
      2,
    )
    camera.value = {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      k: Math.max(0.1, k),
    }
  }

  function screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const rect = containerRef.value?.getBoundingClientRect()
    if (!rect) return { x: sx, y: sy }
    const cx = rect.width / 2
    const cy = rect.height / 2
    return {
      x: (sx - cx) / camera.value.k + camera.value.x,
      y: (sy - cy) / camera.value.k + camera.value.y,
    }
  }

  function hitTestNode(wx: number, wy: number): CanvasNode | null {
    const nodes = getNodes()
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i]
      if (n.hidden) continue
      const hw = n.width / 2
      const hh = n.height / 2
      if (wx >= n.x - hw && wx <= n.x + hw && wy >= n.y - hh && wy <= n.y + hh) {
        return n
      }
    }
    return null
  }

  function hitTestEdge(wx: number, wy: number): CanvasEdge | null {
    const nodes = getNodes()
    const edges = getEdges()
    const threshold = 8
    for (const edge of edges) {
      if (edge.hidden) continue
      const src = nodes.find(n => n.id === edge.source)
      const tgt = nodes.find(n => n.id === edge.target)
      if (!src || !tgt) continue
      const dist = pointToSegmentDist(wx, wy, src.x, src.y, tgt.x, tgt.y)
      if (dist < threshold) return edge
    }
    return null
  }

  function pointToSegmentDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1
    const dy = y2 - y1
    const lenSq = dx * dx + dy * dy
    if (lenSq === 0) return Math.hypot(px - x1, py - y1)
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq
    t = Math.max(0, Math.min(1, t))
    const projX = x1 + t * dx
    const projY = y1 + t * dy
    return Math.hypot(px - projX, py - projY)
  }

  function zoomIn(): void {
    camera.value.k = Math.min(camera.value.k * 1.2, 5)
  }

  function zoomOut(): void {
    camera.value.k = Math.max(camera.value.k / 1.2, 0.1)
  }

  watch(camera, () => markDirty(), { deep: true })
  watch(hoveredNodeId, () => markDirty())
  watch(selectedNodeId, () => markDirty())

  onBeforeUnmount(() => {
    destroy()
  })

  return {
    canvas,
    ctx,
    camera,
    hoveredNodeId,
    selectedNodeId,
    init,
    destroy,
    resize,
    render,
    fitView,
    screenToWorld,
    hitTestNode,
    hitTestEdge,
    zoomIn,
    zoomOut,
    setFreehandDrawFn,
    markDirty,
  }
}
