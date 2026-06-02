import { FONT_FAMILY_VALUES, type FontCategoryToken, type FontSizeToken, FONT_SIZE_VALUES, type FontWeightToken, FONT_WEIGHT_VALUES, type LineHeightToken, LINE_HEIGHT_VALUES, type LetterSpacingToken, LETTER_SPACING_VALUES } from './tokens'

export type ImageFormat = 'png' | 'jpeg' | 'webp'

export interface TextRenderOptions {
  text: string
  fontFamily?: string
  fontCategory?: FontCategoryToken
  fontSize?: FontSizeToken | number
  fontWeight?: FontWeightToken | number
  lineHeight?: LineHeightToken | number
  letterSpacing?: LetterSpacingToken | string
  color?: string
  backgroundColor?: string
  padding?: number | { top?: number; right?: number; bottom?: number; left?: number }
  maxWidth?: number
  textAlign?: CanvasTextAlign
  baseline?: CanvasTextBaseline
  devicePixelRatio?: number
}

export interface RenderResult {
  canvas: HTMLCanvasElement
  width: number
  height: number
}

function resolveFontFamily(opts: TextRenderOptions): string {
  if (opts.fontFamily) return opts.fontFamily
  const cat = opts.fontCategory ?? 'base'
  return FONT_FAMILY_VALUES[cat]
}

function resolveFontSize(v: FontSizeToken | number | undefined): number {
  if (v === undefined) return FONT_SIZE_VALUES.base
  if (typeof v === 'number') return v
  return FONT_SIZE_VALUES[v]
}

function resolveFontWeight(v: FontWeightToken | number | undefined): number {
  if (v === undefined) return FONT_WEIGHT_VALUES.normal
  if (typeof v === 'number') return v
  return FONT_WEIGHT_VALUES[v]
}

function resolveLineHeight(v: LineHeightToken | number | undefined): number {
  if (v === undefined) return LINE_HEIGHT_VALUES.normal
  if (typeof v === 'number') return v
  return LINE_HEIGHT_VALUES[v]
}

function resolveLetterSpacing(v: LetterSpacingToken | string | undefined): string {
  if (v === undefined) return LETTER_SPACING_VALUES.normal
  if (typeof v === 'string' && v in LETTER_SPACING_VALUES) return LETTER_SPACING_VALUES[v as LetterSpacingToken]
  return v as string
}

function resolvePadding(p: TextRenderOptions['padding']): { top: number; right: number; bottom: number; left: number } {
  if (p === undefined) return { top: 16, right: 16, bottom: 16, left: 16 }
  if (typeof p === 'number') return { top: p, right: p, bottom: p, left: p }
  return { top: p.top ?? 0, right: p.right ?? 0, bottom: p.bottom ?? 0, left: p.left ?? 0 }
}

function buildFontString(family: string, size: number, weight: number): string {
  return `${weight} ${size}px ${family}`
}

export function measureText(
  ctx: CanvasRenderingContext2D,
  text: string,
  opts: TextRenderOptions,
): { width: number; height: number; lines: string[] } {
  const fontSize = resolveFontSize(opts.fontSize)
  const fontWeight = resolveFontWeight(opts.fontWeight)
  const lineHeight = resolveLineHeight(opts.lineHeight)
  const letterSpacing = resolveLetterSpacing(opts.letterSpacing)
  const family = resolveFontFamily(opts)

  ctx.font = buildFontString(family, fontSize, fontWeight)

  const lineH = fontSize * lineHeight
  const maxWidth = opts.maxWidth ?? Infinity
  const lines: string[] = []

  if (maxWidth === Infinity) {
    lines.push(...text.split('\n'))
  } else {
    const paragraphs = text.split('\n')
    for (const para of paragraphs) {
      if (para === '') { lines.push(''); continue }
      let remaining = para
      while (remaining.length > 0) {
        let breakIdx = remaining.length
        while (breakIdx > 0) {
          const testLine = remaining.slice(0, breakIdx)
          const metrics = ctx.measureText(testLine)
          const lsPx = parseFloat(letterSpacing) * testLine.length || 0
          if (metrics.width + lsPx <= maxWidth) break
          breakIdx--
        }
        if (breakIdx === 0) breakIdx = 1
        lines.push(remaining.slice(0, breakIdx))
        remaining = remaining.slice(breakIdx)
      }
    }
  }

  const lsPx = parseFloat(letterSpacing)
  const lsIsEm = letterSpacing.includes('em')
  const lsPxPerChar = lsIsEm ? lsPx * fontSize : lsPx

  let maxLineWidth = 0
  for (const line of lines) {
    const metrics = ctx.measureText(line)
    const lsTotal = isFinite(lsPxPerChar) ? lsPxPerChar * Math.max(0, line.length - 1) : 0
    maxLineWidth = Math.max(maxLineWidth, metrics.width + lsTotal)
  }

  return {
    width: maxLineWidth,
    height: lines.length * lineH,
    lines,
  }
}

export function renderText(opts: TextRenderOptions): RenderResult {
  if (typeof document === 'undefined') {
    throw new Error('FontRenderer requires a browser environment')
  }

  const dpr = opts.devicePixelRatio ?? (typeof window !== 'undefined' ? window.devicePixelRatio : 1)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!

  const padding = resolvePadding(opts.padding)
  const measurement = measureText(ctx, opts.text, opts)

  const contentWidth = Math.ceil(measurement.width)
  const contentHeight = Math.ceil(measurement.height)

  const cssWidth = contentWidth + padding.left + padding.right
  const cssHeight = contentHeight + padding.top + padding.bottom

  canvas.width = Math.ceil(cssWidth * dpr)
  canvas.height = Math.ceil(cssHeight * dpr)
  canvas.style.width = `${cssWidth}px`
  canvas.style.height = `${cssHeight}px`

  ctx.scale(dpr, dpr)

  if (opts.backgroundColor) {
    ctx.fillStyle = opts.backgroundColor
    ctx.fillRect(0, 0, cssWidth, cssHeight)
  }

  const fontSize = resolveFontSize(opts.fontSize)
  const fontWeight = resolveFontWeight(opts.fontWeight)
  const lineHeight = resolveLineHeight(opts.lineHeight)
  const letterSpacing = resolveLetterSpacing(opts.letterSpacing)
  const family = resolveFontFamily(opts)

  ctx.font = buildFontString(family, fontSize, fontWeight)
  ctx.fillStyle = opts.color ?? '#000000'
  ctx.textAlign = opts.textAlign ?? 'left'
  ctx.textBaseline = opts.baseline ?? 'top'

  const lineH = fontSize * lineHeight
  const lsPx = parseFloat(letterSpacing)
  const lsIsEm = letterSpacing.includes('em')
  const lsPxPerChar = lsIsEm ? lsPx * fontSize : lsPx

  for (let i = 0; i < measurement.lines.length; i++) {
    const line = measurement.lines[i]
    const y = padding.top + i * lineH

    if (lsPxPerChar !== 0 && isFinite(lsPxPerChar)) {
      let x = padding.left
      for (const ch of line) {
        ctx.fillText(ch, x, y)
        x += ctx.measureText(ch).width + lsPxPerChar
      }
    } else {
      ctx.fillText(line, padding.left, y)
    }
  }

  return { canvas, width: cssWidth, height: cssHeight }
}

export function toBlob(canvas: HTMLCanvasElement, format: ImageFormat = 'png', quality?: number): Promise<Blob> {
  const mimeType = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png'
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed')),
      mimeType,
      quality,
    )
  })
}

export function toDataURL(canvas: HTMLCanvasElement, format: ImageFormat = 'png', quality?: number): string {
  const mimeType = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png'
  return canvas.toDataURL(mimeType, quality)
}
