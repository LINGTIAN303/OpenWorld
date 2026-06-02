import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useDecisionTimeout } from '@/plugins/official/workflow/composables/useDecisionTimeout'

describe('useDecisionTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts countdown at timeoutMs', () => {
    const { remainingMs, start } = useDecisionTimeout()
    start(5000)
    expect(remainingMs.value).toBe(5000)
  })

  it('counts down every second', () => {
    const { remainingMs, start } = useDecisionTimeout()
    start(3000)
    vi.advanceTimersByTime(1000)
    expect(remainingMs.value).toBe(2000)
    vi.advanceTimersByTime(1000)
    expect(remainingMs.value).toBe(1000)
  })

  it('emits timeout when reaching 0', () => {
    const { start, onTimeout } = useDecisionTimeout()
    const handler = vi.fn()
    onTimeout(handler)
    start(1000)
    vi.advanceTimersByTime(1000)
    expect(handler).toHaveBeenCalled()
  })

  it('stops counting when cancel called', () => {
    const { start, cancel, remainingMs } = useDecisionTimeout()
    start(2000)
    vi.advanceTimersByTime(1000)
    expect(remainingMs.value).toBe(1000)
    cancel()
    vi.advanceTimersByTime(5000)
    // 停止时 remaining 不再变
    expect(remainingMs.value).toBe(1000)
  })

  it('timeoutMs=0 means never timeout', () => {
    const { start, onTimeout, remainingMs } = useDecisionTimeout()
    const handler = vi.fn()
    onTimeout(handler)
    start(0)
    vi.advanceTimersByTime(60_000)
    expect(handler).not.toHaveBeenCalled()
    expect(remainingMs.value).toBe(0)
  })

  it('cancel does not call onTimeout', () => {
    const { start, cancel, onTimeout } = useDecisionTimeout()
    const handler = vi.fn()
    onTimeout(handler)
    start(2000)
    cancel()
    vi.advanceTimersByTime(5000)
    expect(handler).not.toHaveBeenCalled()
  })
})
