/**
 * useEventBus — 绑定 EventBus 监听器到 Vue 组件生命周期
 *
 * 自动在 onBeforeUnmount 时取消所有通过此 composable 注册的监听器，
 * 避免内存泄漏。同时支持 effectScope 绑定。
 *
 * @example
 * ```ts
 * const { on } = useEventBus()
 * on('entity:create', (data) => { ... })
 * on('field:change', (data) => { ... })
 * // 组件卸载时自动清理
 * ```
 */

import { onBeforeUnmount, onScopeDispose, getCurrentScope } from 'vue'
import { eventBus, type EventName, type EventHandler, type EventMap, type Unsubscribe } from '../modules/runtime/events'

interface UseEventBusReturn {
  /** 监听事件，组件卸载时自动清理 */
  on: <K extends EventName>(name: K, handler: EventHandler<EventMap[K]>) => Unsubscribe
  /** 一次性监听，组件卸载时自动清理 */
  once: <K extends EventName>(name: K, handler: EventHandler<EventMap[K]>) => Unsubscribe
  /** 手动取消所有通过此 composable 注册的监听器 */
  offAll: () => void
}

export function useEventBus(): UseEventBusReturn {
  const unsubscribers: Unsubscribe[] = []
  let cleanedUp = false

  function cleanup() {
    if (cleanedUp) return
    cleanedUp = true
    for (const unsub of unsubscribers) {
      try { unsub() } catch { /* 忽略已取消的订阅 */ }
    }
    unsubscribers.length = 0
  }

  // 注册自动清理
  // 如果在 setup 上下文中（有当前 scope），使用 onScopeDispose
  // 否则尝试 onBeforeUnmount
  const currentScope = getCurrentScope()
  if (currentScope) {
    onScopeDispose(cleanup)
  }
  // onBeforeUnmount 必须在 setup 中调用，此处安全调用
  try {
    onBeforeUnmount(cleanup)
  } catch {
    // 不在组件 setup 上下文中，依赖 scope dispose
  }

  function on<K extends EventName>(name: K, handler: EventHandler<EventMap[K]>): Unsubscribe {
    const unsub = eventBus.on(name, handler)
    if (!cleanedUp) {
      unsubscribers.push(unsub)
    }
    return unsub
  }

  function once<K extends EventName>(name: K, handler: EventHandler<EventMap[K]>): Unsubscribe {
    const unsub = eventBus.once(name, handler)
    if (!cleanedUp) {
      unsubscribers.push(unsub)
    }
    return unsub
  }

  return { on, once, offAll: cleanup }
}
