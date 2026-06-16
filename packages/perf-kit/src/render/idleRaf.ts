/**
 * 空闲 RAF 管理器。有交互时运行动画循环，空闲后自动暂停。
 * 适用于 Canvas 渲染、粒子系统等需要持续动画但可暂停的场景。
 */
export function createIdleRaf(options?: {
  idleTimeout?: number
}): {
  start: (tick: (dt: number) => void) => void
  stop: () => void
  notifyActive: () => void
  readonly running: boolean
} {
  const idleTimeout = options?.idleTimeout ?? 3000
  let rafId: number | null = null
  let lastTime = 0
  let lastActiveTime = 0
  let tickFn: ((dt: number) => void) | null = null
  let running = false

  function loop(now: number) {
    if (!running) return
    const dt = lastTime ? (now - lastTime) / 1000 : 0
    lastTime = now

    if (dt > 0 && tickFn) tickFn(dt)

    // 检查是否空闲超时
    if (now - lastActiveTime > idleTimeout) {
      running = false
      rafId = null
      return
    }

    rafId = requestAnimationFrame(loop)
  }

  function start(tick: (dt: number) => void) {
    tickFn = tick
    running = true
    lastActiveTime = performance.now()
    lastTime = 0
    if (rafId === null) {
      rafId = requestAnimationFrame(loop)
    }
  }

  function stop() {
    running = false
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  function notifyActive() {
    lastActiveTime = performance.now()
    if (!running && tickFn) {
      running = true
      lastTime = 0
      rafId = requestAnimationFrame(loop)
    }
  }

  return {
    start,
    stop,
    notifyActive,
    get running() { return running },
  }
}
