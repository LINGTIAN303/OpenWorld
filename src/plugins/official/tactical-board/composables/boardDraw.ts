export interface BoardCamera {
  x: number
  y: number
  k: number
}

export interface UnitRenderData {
  id: string
  name: string
  team: string
  hp: number
  max_hp: number
  acted: boolean
  x: number
  y: number
}

export interface HighlightCell {
  x: number
  y: number
  type: 'move' | 'attack' | 'skill'
}

export interface AwarenessCell {
  x: number
  y: number
  controlling_team: string | null
  threat_level: number
  is_supply_line: boolean
  is_isolated: boolean
}

export interface BoardRenderData {
  gridType: 'square' | 'hex'
  width: number
  height: number
  terrain: string[][]
  units: UnitRenderData[]
  highlights: HighlightCell[]
  selectedCell: { x: number; y: number } | null
  hoveredCell: { x: number; y: number } | null
  awarenessCells: AwarenessCell[]
  awarenessMode: 'none' | 'influence' | 'threat' | 'supply'
}

const TERRAIN_COLORS: Record<string, { fill: string; dark: string; accent: string }> = {
  plain:    { fill: '#4a6741', dark: '#3a5731', accent: '#5a7751' },
  forest:   { fill: '#2d5a27', dark: '#1d4a17', accent: '#3d6a37' },
  mountain: { fill: '#6b5b4a', dark: '#5b4b3a', accent: '#7b6b5a' },
  water:    { fill: '#2a5a8a', dark: '#1a4a7a', accent: '#3a6a9a' },
  desert:   { fill: '#8a7a3a', dark: '#7a6a2a', accent: '#9a8a4a' },
  wall:     { fill: '#4a4a4a', dark: '#3a3a3a', accent: '#5a5a5a' },
}

const TEAM_COLORS: Record<string, { main: string; light: string; dark: string }> = {
  ally:    { main: '#4a9eff', light: '#7ab8ff', dark: '#2a7edf' },
  enemy:   { main: '#ff4a4a', light: '#ff7a7a', dark: '#df2a2a' },
  neutral: { main: '#9a9a9a', light: '#bababa', dark: '#7a7a7a' },
}

const HIGHLIGHT_COLORS: Record<string, string> = {
  move:   'rgba(74, 158, 255, 0.30)',
  attack: 'rgba(255, 74, 74, 0.30)',
  skill:  'rgba(255, 200, 50, 0.30)',
}

const HIGHLIGHT_BORDERS: Record<string, string> = {
  move:   'rgba(74, 158, 255, 0.60)',
  attack: 'rgba(255, 74, 74, 0.60)',
  skill:  'rgba(255, 200, 50, 0.60)',
}

export function getBoardPixelSize(
  gridType: 'square' | 'hex',
  width: number,
  height: number,
  cellSize: number,
): { bw: number; bh: number } {
  if (gridType === 'hex') {
    const hexW = Math.sqrt(3) * cellSize
    const bw = width * hexW + hexW / 2
    const bh = (height - 1) * 1.5 * cellSize + 2 * cellSize
    return { bw, bh }
  }
  return { bw: width * cellSize, bh: height * cellSize }
}

export function computeCellSize(
  gridType: 'square' | 'hex',
  width: number,
  height: number,
  canvasW: number,
  canvasH: number,
): number {
  const pad = 0.85
  if (gridType === 'hex') {
    const hexW = Math.sqrt(3)
    const sizeByW = (canvasW * pad) / (width * hexW + hexW / 2)
    const sizeByH = (canvasH * pad) / ((height - 1) * 1.5 + 2)
    return Math.min(sizeByW, sizeByH)
  }
  const sizeByW = (canvasW * pad) / width
  const sizeByH = (canvasH * pad) / height
  return Math.min(sizeByW, sizeByH)
}

export function squareCellCenter(col: number, row: number, cellSize: number): [number, number] {
  return [col * cellSize + cellSize / 2, row * cellSize + cellSize / 2]
}

export function hexCellCenter(col: number, row: number, hexSize: number): [number, number] {
  const w = Math.sqrt(3) * hexSize
  const x = col * w + (row % 2 === 1 ? w / 2 : 0) + w / 2
  const y = row * 1.5 * hexSize + hexSize
  return [x, y]
}

export function cellCenter(
  col: number,
  row: number,
  gridType: 'square' | 'hex',
  cellSize: number,
): [number, number] {
  if (gridType === 'hex') return hexCellCenter(col, row, cellSize)
  return squareCellCenter(col, row, cellSize)
}

function drawHexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30)
    const px = cx + size * Math.cos(angle)
    const py = cy + size * Math.sin(angle)
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
}

function drawSquareCellPath(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  cellSize: number,
): void {
  const x = col * cellSize
  const y = row * cellSize
  ctx.beginPath()
  ctx.rect(x, y, cellSize, cellSize)
}

function drawTerrainSquare(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  terrainType: string,
  cellSize: number,
): void {
  const tc = TERRAIN_COLORS[terrainType] || TERRAIN_COLORS.plain
  const x = col * cellSize
  const y = row * cellSize

  ctx.fillStyle = tc.fill
  ctx.fillRect(x, y, cellSize, cellSize)

  if (cellSize > 18) {
    const grad = ctx.createLinearGradient(x, y, x, y + cellSize)
    grad.addColorStop(0, 'rgba(255,255,255,0.06)')
    grad.addColorStop(1, 'rgba(0,0,0,0.10)')
    ctx.fillStyle = grad
    ctx.fillRect(x, y, cellSize, cellSize)
  }

  if (cellSize > 30 && terrainType !== 'plain') {
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.font = `${Math.max(10, cellSize * 0.3)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const symbols: Record<string, string> = {
      forest: '\u25B2', mountain: '\u25B3', water: '\u2248',
      desert: '\u2022', wall: '\u2588',
    }
    ctx.fillText(symbols[terrainType] || '', x + cellSize / 2, y + cellSize / 2)
  }
}

function drawTerrainHex(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  terrainType: string,
  hexSize: number,
): void {
  const tc = TERRAIN_COLORS[terrainType] || TERRAIN_COLORS.plain
  const [cx, cy] = hexCellCenter(col, row, hexSize)

  drawHexPath(ctx, cx, cy, hexSize)
  ctx.fillStyle = tc.fill
  ctx.fill()

  if (hexSize > 14) {
    drawHexPath(ctx, cx, cy, hexSize)
    const grad = ctx.createLinearGradient(cx, cy - hexSize, cx, cy + hexSize)
    grad.addColorStop(0, 'rgba(255,255,255,0.06)')
    grad.addColorStop(1, 'rgba(0,0,0,0.10)')
    ctx.fillStyle = grad
    ctx.fill()
  }

  if (hexSize > 22 && terrainType !== 'plain') {
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.font = `${Math.max(9, hexSize * 0.35)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const symbols: Record<string, string> = {
      forest: '\u25B2', mountain: '\u25B3', water: '\u2248',
      desert: '\u2022', wall: '\u2588',
    }
    ctx.fillText(symbols[terrainType] || '', cx, cy)
  }
}

function drawSquareGrid(
  ctx: CanvasRenderingContext2D,
  data: BoardRenderData,
  cellSize: number,
): void {
  for (let r = 0; r < data.height; r++) {
    for (let c = 0; c < data.width; c++) {
      const t = data.terrain[r]?.[c] || 'plain'
      drawTerrainSquare(ctx, c, r, t, cellSize)
    }
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 1
  for (let r = 0; r <= data.height; r++) {
    ctx.beginPath()
    ctx.moveTo(0, r * cellSize)
    ctx.lineTo(data.width * cellSize, r * cellSize)
    ctx.stroke()
  }
  for (let c = 0; c <= data.width; c++) {
    ctx.beginPath()
    ctx.moveTo(c * cellSize, 0)
    ctx.lineTo(c * cellSize, data.height * cellSize)
    ctx.stroke()
  }
}

function drawHexGrid(
  ctx: CanvasRenderingContext2D,
  data: BoardRenderData,
  hexSize: number,
): void {
  for (let r = 0; r < data.height; r++) {
    for (let c = 0; c < data.width; c++) {
      const t = data.terrain[r]?.[c] || 'plain'
      drawTerrainHex(ctx, c, r, t, hexSize)
    }
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.10)'
  ctx.lineWidth = 1
  for (let r = 0; r < data.height; r++) {
    for (let c = 0; c < data.width; c++) {
      const [cx, cy] = hexCellCenter(c, r, hexSize)
      drawHexPath(ctx, cx, cy, hexSize)
      ctx.stroke()
    }
  }
}

function drawHighlights(
  ctx: CanvasRenderingContext2D,
  data: BoardRenderData,
  cellSize: number,
): void {
  const byCell = new Map<string, HighlightCell['type']>()
  for (const h of data.highlights) {
    const key = `${h.x},${h.y}`
    if (!byCell.has(key)) byCell.set(key, h.type)
  }

  for (const [key, hType] of byCell) {
    const [cx, cy] = key.split(',').map(Number)
    const [px, py] = cellCenter(cx, cy, data.gridType, cellSize)

    if (data.gridType === 'hex') {
      drawHexPath(ctx, px, py, cellSize)
    } else {
      drawSquareCellPath(ctx, cx, cy, cellSize)
    }
    ctx.fillStyle = HIGHLIGHT_COLORS[hType]
    ctx.fill()
    ctx.strokeStyle = HIGHLIGHT_BORDERS[hType]
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
}

function drawUnitToken(
  ctx: CanvasRenderingContext2D,
  unit: UnitRenderData,
  gridType: 'square' | 'hex',
  cellSize: number,
): void {
  const [px, py] = cellCenter(unit.x, unit.y, gridType, cellSize)
  const tc = TEAM_COLORS[unit.team] || TEAM_COLORS.neutral
  const radius = cellSize * 0.35
  const alpha = unit.acted ? 0.5 : 1.0

  ctx.save()
  ctx.globalAlpha = alpha

  ctx.beginPath()
  ctx.arc(px, py, radius, 0, Math.PI * 2)
  const grad = ctx.createRadialGradient(px - radius * 0.3, py - radius * 0.3, 0, px, py, radius)
  grad.addColorStop(0, tc.light)
  grad.addColorStop(1, tc.dark)
  ctx.fillStyle = grad
  ctx.fill()
  ctx.strokeStyle = tc.main
  ctx.lineWidth = 2
  ctx.stroke()

  if (cellSize > 20) {
    ctx.fillStyle = '#fff'
    ctx.font = `bold ${Math.max(8, cellSize * 0.18)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const maxChars = Math.max(1, Math.floor(radius * 1.6 / (cellSize * 0.14)))
    const name = unit.name.length > maxChars ? unit.name.slice(0, maxChars - 1) + '\u2026' : unit.name
    ctx.fillText(name, px, py - (cellSize > 35 ? radius * 0.2 : 0))
  }

  if (cellSize > 28) {
    const barW = radius * 1.6
    const barH = Math.max(2, cellSize * 0.06)
    const barX = px - barW / 2
    const barY = py + radius * 0.55
    const hpRatio = Math.max(0, unit.hp / unit.max_hp)

    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(barX, barY, barW, barH)

    const hpColor = hpRatio > 0.6 ? '#4ade80' : hpRatio > 0.3 ? '#fbbf24' : '#ef4444'
    ctx.fillStyle = hpColor
    ctx.fillRect(barX, barY, barW * hpRatio, barH)

    ctx.strokeStyle = 'rgba(255,255,255,0.2)'
    ctx.lineWidth = 0.5
    ctx.strokeRect(barX, barY, barW, barH)
  }

  ctx.restore()
}

function drawUnits(
  ctx: CanvasRenderingContext2D,
  data: BoardRenderData,
  cellSize: number,
): void {
  for (const unit of data.units) {
    drawUnitToken(ctx, unit, data.gridType, cellSize)
  }
}

function drawSelection(
  ctx: CanvasRenderingContext2D,
  cell: { x: number; y: number },
  gridType: 'square' | 'hex',
  cellSize: number,
): void {
  const [px, py] = cellCenter(cell.x, cell.y, gridType, cellSize)

  if (gridType === 'hex') {
    drawHexPath(ctx, px, py, cellSize)
  } else {
    drawSquareCellPath(ctx, cell.x, cell.y, cellSize)
  }
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2.5
  ctx.stroke()

  if (gridType === 'hex') {
    drawHexPath(ctx, px, py, cellSize - 2)
  } else {
    const x = cell.x * cellSize + 2
    const y = cell.y * cellSize + 2
    ctx.beginPath()
    ctx.rect(x, y, cellSize - 4, cellSize - 4)
  }
  ctx.strokeStyle = 'rgba(74, 158, 255, 0.80)'
  ctx.lineWidth = 1.5
  ctx.stroke()
}

function drawHover(
  ctx: CanvasRenderingContext2D,
  cell: { x: number; y: number },
  gridType: 'square' | 'hex',
  cellSize: number,
): void {
  const [px, py] = cellCenter(cell.x, cell.y, gridType, cellSize)

  if (gridType === 'hex') {
    drawHexPath(ctx, px, py, cellSize)
  } else {
    drawSquareCellPath(ctx, cell.x, cell.y, cellSize)
  }
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'
  ctx.lineWidth = 1
  ctx.stroke()
}

const INFLUENCE_COLORS: Record<string, string> = {
  ally:    'rgba(74, 158, 255, 0.18)',
  enemy:   'rgba(255, 74, 74, 0.18)',
  neutral: 'rgba(154, 154, 154, 0.18)',
}

const INFLUENCE_BORDERS: Record<string, string> = {
  ally:    'rgba(74, 158, 255, 0.35)',
  enemy:   'rgba(255, 74, 74, 0.35)',
  neutral: 'rgba(154, 154, 154, 0.35)',
}

function drawAwareness(
  ctx: CanvasRenderingContext2D,
  data: BoardRenderData,
  cellSize: number,
): void {
  for (const cell of data.awarenessCells) {
    if (cell.x < 0 || cell.y < 0 || cell.x >= data.width || cell.y >= data.height) continue

    const [px, py] = cellCenter(cell.x, cell.y, data.gridType, cellSize)

    if (data.awarenessMode === 'influence') {
      if (!cell.controlling_team) continue
      const color = INFLUENCE_COLORS[cell.controlling_team] || INFLUENCE_COLORS.neutral
      const border = INFLUENCE_BORDERS[cell.controlling_team] || INFLUENCE_BORDERS.neutral

      if (data.gridType === 'hex') {
        drawHexPath(ctx, px, py, cellSize)
      } else {
        drawSquareCellPath(ctx, cell.x, cell.y, cellSize)
      }
      ctx.fillStyle = color
      ctx.fill()
      ctx.strokeStyle = border
      ctx.lineWidth = 1
      ctx.stroke()
    }

    if (data.awarenessMode === 'threat') {
      if (cell.threat_level <= 0) continue
      const alpha = Math.min(0.5, cell.threat_level)
      const fillColor = `rgba(255, 74, 74, ${alpha * 0.4})`
      const borderColor = `rgba(255, 74, 74, ${alpha * 0.7})`

      if (data.gridType === 'hex') {
        drawHexPath(ctx, px, py, cellSize)
      } else {
        drawSquareCellPath(ctx, cell.x, cell.y, cellSize)
      }
      ctx.fillStyle = fillColor
      ctx.fill()
      ctx.strokeStyle = borderColor
      ctx.lineWidth = 1
      ctx.stroke()

      if (cellSize > 24) {
        ctx.fillStyle = `rgba(255, 200, 200, ${Math.min(0.8, alpha + 0.2)})`
        ctx.font = `${Math.max(8, cellSize * 0.2)}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(cell.threat_level.toFixed(1), px, py)
      }
    }

    if (data.awarenessMode === 'supply') {
      if (!cell.is_supply_line && !cell.is_isolated) continue

      if (data.gridType === 'hex') {
        drawHexPath(ctx, px, py, cellSize)
      } else {
        drawSquareCellPath(ctx, cell.x, cell.y, cellSize)
      }

      if (cell.is_supply_line) {
        ctx.fillStyle = 'rgba(63, 185, 80, 0.15)'
        ctx.fill()
        ctx.strokeStyle = 'rgba(63, 185, 80, 0.40)'
        ctx.lineWidth = 1.5
        ctx.stroke()

        if (cellSize > 22) {
          ctx.fillStyle = 'rgba(63, 185, 80, 0.6)'
          ctx.font = `${Math.max(8, cellSize * 0.22)}px sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('\u2194', px, py)
        }
      }

      if (cell.is_isolated) {
        ctx.fillStyle = 'rgba(210, 153, 34, 0.15)'
        ctx.fill()
        ctx.strokeStyle = 'rgba(210, 153, 34, 0.40)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([3, 3])
        ctx.stroke()
        ctx.setLineDash([])

        if (cellSize > 22) {
          ctx.fillStyle = 'rgba(210, 153, 34, 0.6)'
          ctx.font = `${Math.max(8, cellSize * 0.22)}px sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('\u26a0', px, py)
        }
      }
    }
  }
}

export function drawBoard(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  data: BoardRenderData,
  camera: BoardCamera,
  cellSize: number,
): void {
  ctx.clearRect(0, 0, canvasW, canvasH)

  ctx.fillStyle = '#0d1117'
  ctx.fillRect(0, 0, canvasW, canvasH)

  const { bw, bh } = getBoardPixelSize(data.gridType, data.width, data.height, cellSize)

  ctx.save()

  const cx = canvasW / 2
  const cy = canvasH / 2
  ctx.translate(cx, cy)
  ctx.scale(camera.k, camera.k)
  ctx.translate(-camera.x, -camera.y)

  ctx.shadowColor = 'rgba(0,0,0,0.3)'
  ctx.shadowBlur = 20
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 4
  ctx.fillStyle = '#1a1f2e'
  ctx.fillRect(-4, -4, bw + 8, bh + 8)
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0

  if (data.gridType === 'hex') {
    drawHexGrid(ctx, data, cellSize)
  } else {
    drawSquareGrid(ctx, data, cellSize)
  }

  drawHighlights(ctx, data, cellSize)

  if (data.awarenessMode !== 'none' && data.awarenessCells.length > 0) {
    drawAwareness(ctx, data, cellSize)
  }

  drawUnits(ctx, data, cellSize)

  if (data.selectedCell) {
    drawSelection(ctx, data.selectedCell, data.gridType, cellSize)
  }

  if (data.hoveredCell) {
    drawHover(ctx, data.hoveredCell, data.gridType, cellSize)
  }

  ctx.restore()
}

export function hitTestCell(
  screenX: number,
  screenY: number,
  canvasW: number,
  canvasH: number,
  camera: BoardCamera,
  gridType: 'square' | 'hex',
  gridWidth: number,
  gridHeight: number,
  cellSize: number,
): { x: number; y: number } | null {
  const cx = canvasW / 2
  const cy = canvasH / 2
  const worldX = (screenX - cx) / camera.k + camera.x
  const worldY = (screenY - cy) / camera.k + camera.y

  if (gridType === 'hex') {
    return hitTestHex(worldX, worldY, gridWidth, gridHeight, cellSize)
  }
  return hitTestSquare(worldX, worldY, gridWidth, gridHeight, cellSize)
}

function hitTestSquare(
  wx: number,
  wy: number,
  gw: number,
  gh: number,
  cellSize: number,
): { x: number; y: number } | null {
  const col = Math.floor(wx / cellSize)
  const row = Math.floor(wy / cellSize)
  if (col < 0 || col >= gw || row < 0 || row >= gh) return null
  return { x: col, y: row }
}

function hitTestHex(
  wx: number,
  wy: number,
  gw: number,
  gh: number,
  hexSize: number,
): { x: number; y: number } | null {
  let best: { x: number; y: number; dist: number } | null = null
  for (let r = 0; r < gh; r++) {
    for (let c = 0; c < gw; c++) {
      const [cx, cy] = hexCellCenter(c, r, hexSize)
      const dx = wx - cx
      const dy = wy - cy
      const dist = dx * dx + dy * dy
      if (dist < hexSize * hexSize) {
        if (!best || dist < best.dist) {
          best = { x: c, y: r, dist }
        }
      }
    }
  }
  return best ? { x: best.x, y: best.y } : null
}
