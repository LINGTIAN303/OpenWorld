import type { Ref } from 'vue'
import type { BoardCamera } from './boardDraw'

export interface BoardInteractionCallbacks {
  onCellClick: (x: number, y: number, event: MouseEvent) => void
  onCellRightClick: (x: number, y: number, event: MouseEvent) => void
  onCellHover: (x: number, y: number | null) => void
  onZoom: (k: number) => void
  onPan: (camera: BoardCamera) => void
}

export function useBoardInteraction(
  canvasRef: Ref<HTMLCanvasElement | null>,
  screenToCell: (sx: number, sy: number) => { x: number; y: number } | null,
  getCamera: () => BoardCamera,
  setCamera: (c: BoardCamera) => void,
  markDirty: () => void,
) {
  let isPanning = false
  let panStartX = 0
  let panStartY = 0
  let panStartCamX = 0
  let panStartCamY = 0
  let hasMoved = false

  let callbacks: BoardInteractionCallbacks = {
    onCellClick: () => {},
    onCellRightClick: () => {},
    onCellHover: () => {},
    onZoom: () => {},
    onPan: () => {},
  }

  function setCallbacks(cb: BoardInteractionCallbacks): void {
    callbacks = cb
  }

  function onMouseDown(e: MouseEvent): void {
    if (!canvasRef.value) return
    if (e.button === 0) {
      isPanning = true
      panStartX = e.clientX
      panStartY = e.clientY
      const cam = getCamera()
      panStartCamX = cam.x
      panStartCamY = cam.y
      hasMoved = false
    }
  }

  function onMouseMove(e: MouseEvent): void {
    if (!canvasRef.value) return

    if (isPanning) {
      const dx = e.clientX - panStartX
      const dy = e.clientY - panStartY
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        hasMoved = true
      }
      const cam = getCamera()
      setCamera({
        ...cam,
        x: panStartCamX - dx / cam.k,
        y: panStartCamY - dy / cam.k,
      })
      callbacks.onPan(getCamera())
      return
    }

    const cell = screenToCell(e.clientX, e.clientY)
    callbacks.onCellHover(cell ? cell.x : -1, cell ? cell.y : -1)
  }

  function onMouseUp(e: MouseEvent): void {
    if (!canvasRef.value) return

    if (isPanning && !hasMoved && e.button === 0) {
      const cell = screenToCell(e.clientX, e.clientY)
      if (cell) {
        callbacks.onCellClick(cell.x, cell.y, e)
      }
    }

    isPanning = false
    hasMoved = false
  }

  function onContextMenu(e: MouseEvent): void {
    e.preventDefault()
    const cell = screenToCell(e.clientX, e.clientY)
    if (cell) {
      callbacks.onCellRightClick(cell.x, cell.y, e)
    }
  }

  function onWheel(e: WheelEvent): void {
    e.preventDefault()
    const cam = getCamera()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newK = Math.max(0.2, Math.min(5, cam.k * delta))
    setCamera({ ...cam, k: newK })
    callbacks.onZoom(newK)
  }

  function bindEvents(): void {
    if (!canvasRef.value) return
    const el = canvasRef.value
    el.addEventListener('mousedown', onMouseDown as any)
    el.addEventListener('mousemove', onMouseMove as any)
    el.addEventListener('mouseup', onMouseUp as any)
    el.addEventListener('wheel', onWheel as any, { passive: false })
    el.addEventListener('contextmenu', onContextMenu as any)
  }

  function unbindEvents(): void {
    if (!canvasRef.value) return
    const el = canvasRef.value
    el.removeEventListener('mousedown', onMouseDown as any)
    el.removeEventListener('mousemove', onMouseMove as any)
    el.removeEventListener('mouseup', onMouseUp as any)
    el.removeEventListener('wheel', onWheel as any)
    el.removeEventListener('contextmenu', onContextMenu as any)
  }

  return {
    setCallbacks,
    bindEvents,
    unbindEvents,
  }
}
