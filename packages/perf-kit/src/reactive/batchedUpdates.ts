import { nextTick } from 'vue'

/**
 * 批量更新合并器：在同一个微任务中收集多次状态修改，
 * 在 nextTick 时一次性执行回调，避免中间态触发多余渲染。
 */
export function createBatchedUpdates(options?: {
  onFlush?: () => void
}): {
  enqueue: (fn: () => void) => void
  flush: () => Promise<void>
  /** 当前待执行队列长度 */
  readonly pending: number
} {
  const queue: (() => void)[] = []
  let scheduled = false

  function enqueue(fn: () => void) {
    queue.push(fn)
    if (!scheduled) {
      scheduled = true
      nextTick(flushSync)
    }
  }

  function flushSync() {
    const items = queue.splice(0)
    for (const fn of items) fn()
    scheduled = false
    options?.onFlush?.()
  }

  async function flush(): Promise<void> {
    if (queue.length > 0) flushSync()
  }

  return {
    enqueue,
    flush,
    get pending() { return queue.length },
  }
}
