// NodeHandlerRegistry (TS) — 入口
//
// Phase 2.5：监听 Rust 端派发 + 调度到 14 个 builtin handler + 暴露 plugin 钩子。
//
// 用法（在 worldsmith-agent 启动时）：
//   import { initNodeHandlers } from './workflow/handlers'
//   initNodeHandlers()

export { newChunk, newDispatchRequest, successResult as successResultMessage, failureResult as failureResultMessage, PROTOCOL_VERSION } from './protocol'
export type { NodeDispatchRequest, NodeDispatchResult, NodeDispatchChunk, NodeDispatchMessage, NodeProtocol } from './protocol'
export { RequestTracker, requestTracker, DEFAULT_HEARTBEAT_TTL_MS, type InflightRecord } from './request_tracker'
export { startDispatchListener, dispatchRequest, simulateCancel, DISPATCH_EVENT, CHUNK_EVENT, HEARTBEAT_EVENT, CANCEL_EVENT } from './dispatch_listener'
export { builtinHandlers, registerBuiltinHandlers } from './builtin'
export { registerSkillNode, unregisterSkillNode, unregisterSkillNodesByPlugin } from './plugin_bridge'

import { registerBuiltinHandlers } from './builtin'
import { startDispatchListener } from './dispatch_listener'

/**
 * 一键初始化：注册 14 个 builtin handler + 启动派发监听器。
 * 在 worldsmith-agent bootstrap 时调用一次。
 */
export async function initNodeHandlers(): Promise<() => void> {
  registerBuiltinHandlers()
  const stop = await startDispatchListener()
  return stop
}
