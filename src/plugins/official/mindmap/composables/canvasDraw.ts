import type { CameraState, CanvasNode, CanvasEdge } from './canvasTypes'

export type FreehandDrawFn = (ctx: CanvasRenderingContext2D, camera: CameraState) => void

const WARM_BG = '#0f1318'
const WARM_GLOW = 'rgba(245,158,11,0.03)'

export function drawGraph(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  camera: CameraState,
  hoveredNodeId: string | null,
  selectedNodeId: string | null,
  freehandDrawFn?: FreehandDrawFn | null,
): void {
  ctx.save()
  ctx.clearRect(0, 0, width, height)

  ctx.fillStyle = WARM_BG
  ctx.fillRect(0, 0, width, height)

  const cx = width / 2
  const cy = height / 2
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * 0.5)
  gradient.addColorStop(0, WARM_GLOW)
  gradient.addColorStop(1, 'transparent')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  ctx.translate(cx, cy)
  ctx.scale(camera.k, camera.k)
  ctx.translate(-camera.x, -camera.y)

  for (const edge of edges) {
    if (edge.hidden) continue
    drawEdge(ctx, edge, nodes, hoveredNodeId, selectedNodeId)
  }

  for (const node of nodes) {
    if (node.hidden) continue
    drawNode(ctx, node, hoveredNodeId === node.id, selectedNodeId === node.id)
  }

  if (freehandDrawFn) {
    freehandDrawFn(ctx, camera)
  }

  ctx.restore()
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  node: CanvasNode,
  isHovered: boolean,
  isSelected: boolean,
): void {
  const { x, y, width: w, height: h } = node
  const color = node.customColor || node.color
  const radius = 6

  ctx.save()

  if (isHovered) {
    ctx.shadowColor = 'rgba(0,0,0,0.3)'
    ctx.shadowBlur = 12
    ctx.shadowOffsetY = 4
  } else if (isSelected) {
    ctx.shadowColor = 'rgba(74,108,247,0.4)'
    ctx.shadowBlur = 16
    ctx.shadowOffsetY = 2
  }

  if (node.type === 'section') {
    drawSectionNode(ctx, node)
    ctx.restore()
    return
  }

  if (node.type === 'group') {
    drawGroupNode(ctx, node)
    ctx.restore()
    return
  }

  drawRoundRect(ctx, x - w / 2, y - h / 2, w, h, radius)
  ctx.fillStyle = darkenColor(color, 0.15)
  ctx.fill()

  ctx.fillStyle = color
  drawRoundRect(ctx, x - w / 2, y - h / 2, 4, h, { tl: radius, bl: radius, tr: 0, br: 0 })
  ctx.fill()

  if (isSelected) {
    ctx.strokeStyle = '#4a6cf7'
    ctx.lineWidth = 2.5
    drawRoundRect(ctx, x - w / 2, y - h / 2, w, h, radius)
    ctx.stroke()
  } else if (isHovered) {
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.lineWidth = 1.5
    drawRoundRect(ctx, x - w / 2, y - h / 2, w, h, radius)
    ctx.stroke()
  }

  if (node.searchHighlight) {
    ctx.strokeStyle = '#ffd700'
    ctx.lineWidth = 2
    drawRoundRect(ctx, x - w / 2 - 2, y - h / 2 - 2, w + 4, h + 4, radius + 2)
    ctx.stroke()
  }

  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0

  const maxTextWidth = w - 16
  ctx.fillStyle = '#e0e0e0'
  ctx.font = `${node.isRoot ? 'bold 14px' : '12px'} Arial`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const text = truncateText(ctx, node.name, maxTextWidth)
  ctx.fillText(text, x, y)

  if (node.isCollapsed && node.childCount > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = '10px Arial'
    ctx.textAlign = 'right'
    ctx.fillText(`+${node.childCount}`, x + w / 2 - 4, y + h / 2 - 8)
  }

  ctx.restore()
}

function drawEdge(
  ctx: CanvasRenderingContext2D,
  edge: CanvasEdge,
  nodes: CanvasNode[],
  _hoveredNodeId: string | null,
  _selectedNodeId: string | null,
): void {
  const src = nodes.find(n => n.id === edge.source)
  const tgt = nodes.find(n => n.id === edge.target)
  if (!src || !tgt) return

  ctx.save()
  ctx.strokeStyle = edge.color || '#5a5a7a'
  ctx.lineWidth = edge.selected ? 3 : 2

  if (edge.dashed) {
    ctx.setLineDash([6, 4])
  }

  ctx.beginPath()
  if (edge.curveStyle === 'bezier') {
    const mx = (src.x + tgt.x) / 2
    const my = (src.y + tgt.y) / 2
    const dx = tgt.x - src.x
    const dy = tgt.y - src.y
    const cx1 = mx - dy * 0.15
    const cy1 = my + dx * 0.15
    ctx.moveTo(src.x, src.y)
    ctx.quadraticCurveTo(cx1, cy1, tgt.x, tgt.y)
  } else if (edge.curveStyle === 'taxi') {
    const midX = (src.x + tgt.x) / 2
    ctx.moveTo(src.x, src.y)
    ctx.lineTo(midX, src.y)
    ctx.lineTo(midX, tgt.y)
    ctx.lineTo(tgt.x, tgt.y)
  } else {
    ctx.moveTo(src.x, src.y)
    ctx.lineTo(tgt.x, tgt.y)
  }
  ctx.stroke()
  ctx.setLineDash([])

  if (!edge.noArrow && !edge.symmetric) {
    drawArrow(ctx, src, tgt, edge.color || '#5a5a7a')
  }

  if (edge.relLabel) {
    const mx = (src.x + tgt.x) / 2
    const my = (src.y + tgt.y) / 2
    ctx.fillStyle = 'rgba(15,19,24,0.8)'
    ctx.font = '9px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const tw = ctx.measureText(edge.relLabel).width + 6
    ctx.fillRect(mx - tw / 2, my - 7, tw, 14)
    ctx.fillStyle = '#888'
    ctx.fillText(edge.relLabel, mx, my)
  }

  ctx.restore()
}

function drawArrow(ctx: CanvasRenderingContext2D, src: CanvasNode, tgt: CanvasNode, color: string): void {
  const angle = Math.atan2(tgt.y - src.y, tgt.x - src.x)
  const arrowLen = 8
  const arrowAngle = Math.PI / 6
  const tipX = tgt.x - Math.cos(angle) * (tgt.width / 2 + 2)
  const tipY = tgt.y - Math.sin(angle) * (tgt.height / 2 + 2)

  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(tipX, tipY)
  ctx.lineTo(tipX - arrowLen * Math.cos(angle - arrowAngle), tipY - arrowLen * Math.sin(angle - arrowAngle))
  ctx.lineTo(tipX - arrowLen * Math.cos(angle + arrowAngle), tipY - arrowLen * Math.sin(angle + arrowAngle))
  ctx.closePath()
  ctx.fill()
}

function drawSectionNode(ctx: CanvasRenderingContext2D, node: CanvasNode): void {
  const { x, y, width: w, height: h } = node
  const color = node.sectionColor || '#6c5ce7'

  ctx.setLineDash([6, 4])
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  drawRoundRect(ctx, x - w / 2, y - h / 2, w, h, 8)
  ctx.stroke()
  ctx.setLineDash([])

  ctx.fillStyle = color + '10'
  drawRoundRect(ctx, x - w / 2, y - h / 2, w, h, 8)
  ctx.fill()

  ctx.fillStyle = color
  ctx.font = 'bold 13px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(node.name, x, y - h / 2 + 8)
}

function drawGroupNode(ctx: CanvasRenderingContext2D, node: CanvasNode): void {
  const { x, y, width: w, height: h } = node

  ctx.setLineDash([6, 4])
  ctx.strokeStyle = '#999'
  ctx.lineWidth = 2
  drawRoundRect(ctx, x - w / 2, y - h / 2, w, h, 8)
  ctx.stroke()
  ctx.setLineDash([])

  ctx.fillStyle = 'rgba(0,0,0,0.03)'
  drawRoundRect(ctx, x - w / 2, y - h / 2, w, h, 8)
  ctx.fill()

  ctx.fillStyle = '#666'
  ctx.font = 'bold 14px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(node.name, x, y - h / 2 + 8)
}

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  r: number | { tl: number; tr: number; bl: number; br: number },
): void {
  const tl = typeof r === 'number' ? r : r.tl
  const tr = typeof r === 'number' ? r : r.tr
  const bl = typeof r === 'number' ? r : r.bl
  const br = typeof r === 'number' ? r : r.br
  ctx.beginPath()
  ctx.moveTo(x + tl, y)
  ctx.lineTo(x + w - tr, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + tr)
  ctx.lineTo(x + w, y + h - br)
  ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h)
  ctx.lineTo(x + bl, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - bl)
  ctx.lineTo(x, y + tl)
  ctx.quadraticCurveTo(x, y, x + tl, y)
  ctx.closePath()
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let truncated = text
  while (truncated.length > 0 && ctx.measureText(truncated + '…').width > maxWidth) {
    truncated = truncated.slice(0, -1)
  }
  return truncated + '…'
}

function darkenColor(hex: string, amount: number): string {
  if (!hex || hex.length < 7) return '#1a1a2e'
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - Math.round(255 * amount))
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - Math.round(255 * amount))
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - Math.round(255 * amount))
  return `rgb(${r},${g},${b})`
}
