import { describe, it, expect, vi } from 'vitest'
import { useNodeDragDrop } from '@/plugins/official/workflow/composables/useNodeDragDrop'

function makeDropEvent(opts: {
  type?: string
  clientX?: number
  clientY?: number
  rect?: { left: number; top: number }
} = {}): DragEvent {
  return {
    preventDefault: vi.fn(),
    dataTransfer: {
      getData: (k: string) =>
        k === 'application/workflow-node-type' ? (opts.type ?? '') : '',
    },
    clientX: opts.clientX ?? 0,
    clientY: opts.clientY ?? 0,
    currentTarget: {
      getBoundingClientRect: () => opts.rect ?? { left: 0, top: 0 },
    },
  } as unknown as DragEvent
}

describe('useNodeDragDrop', () => {
  it('handleDrop records node type and position relative to currentTarget', () => {
    const { handleDrop, lastDrop } = useNodeDragDrop()
    const ev = makeDropEvent({ type: 'skill', clientX: 100, clientY: 200, rect: { left: 10, top: 20 } })
    handleDrop(ev)
    expect(ev.preventDefault).toHaveBeenCalled()
    // 100-10=90, 200-20=180
    expect(lastDrop.value).toEqual({ type: 'skill', x: 90, y: 180 })
  })

  it('handleDrop ignores drop with no node type data', () => {
    const { handleDrop, lastDrop } = useNodeDragDrop()
    const ev = makeDropEvent({ clientX: 50, clientY: 60 })
    handleDrop(ev)
    expect(lastDrop.value).toBeNull()
  })

  it('handleDrop clears isDragOver after successful drop', () => {
    const { handleDrop, handleDragOver, lastDrop, isDragOver } = useNodeDragDrop()
    handleDragOver(makeDropEvent({ type: 'skill' }))
    expect(isDragOver.value).toBe(true)
    const ev = makeDropEvent({ type: 'skill', clientX: 10, clientY: 20 })
    handleDrop(ev)
    expect(isDragOver.value).toBe(false)
    expect(lastDrop.value).not.toBeNull()
  })

  it('handleDragOver sets isDragOver and preventDefault', () => {
    const { handleDragOver, isDragOver } = useNodeDragDrop()
    const ev = makeDropEvent()
    handleDragOver(ev)
    expect(isDragOver.value).toBe(true)
    expect(ev.preventDefault).toHaveBeenCalled()
  })

  it('handleDragLeave clears isDragOver', () => {
    const { handleDragOver, handleDragLeave, isDragOver } = useNodeDragDrop()
    handleDragOver(makeDropEvent())
    expect(isDragOver.value).toBe(true)
    handleDragLeave()
    expect(isDragOver.value).toBe(false)
  })
})
