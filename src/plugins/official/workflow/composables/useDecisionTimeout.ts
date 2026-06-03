// useDecisionTimeout
//
// P3 决策超时计时器。AgentDecisionCard 用 5min 倒计时,到 0 触发 onTimeout
// handler(默认走 fallback 选项)。
//
// 行为:
//   - start(ms) 开启倒计时
//   - cancel() 停止,不变 remainingMs
//   - onTimeout(fn) 注册一次性 handler(覆盖前一个)
//   - ms=0 表示无超时
//
// 注意:每个 useDecisionTimeout() call 独立 interval,避免跨实例污染。

import { ref, onUnmounted, getCurrentInstance } from 'vue'

export function useDecisionTimeout() {
  const remainingMs = ref(0)
  let handler: (() => void) | null = null
  let intervalId: ReturnType<typeof setInterval> | null = null

  function clear(): void {
    if (intervalId !== null) {
      clearInterval(intervalId)
      intervalId = null
    }
  }

  function onTimeout(fn: () => void): void {
    handler = fn
  }

  function start(timeoutMs: number): void {
    clear()
    if (timeoutMs <= 0) {
      remainingMs.value = 0
      return
    }
    remainingMs.value = timeoutMs
    intervalId = setInterval(() => {
      remainingMs.value -= 1000
      if (remainingMs.value <= 0) {
        remainingMs.value = 0
        clear()
        handler?.()
      }
    }, 1000)
  }

  function cancel(): void {
    clear()
    // 保留当前 remainingMs(plan:停止时 remaining 不变)
  }

  function destroy(): void {
    clear()
    handler = null
  }

  // 仅在组件上下文内自动注册 onUnmounted
  if (getCurrentInstance()) {
    onUnmounted(() => clear())
  }

  return { remainingMs, start, cancel, onTimeout, destroy }
}
