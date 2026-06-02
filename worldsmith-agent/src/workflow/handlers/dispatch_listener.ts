// dispatch_listener — 监听 `workflow:dispatch` event，调度到 NodeTypeDefinition
//
// Phase 2.5 设计：
//   1. 监听 Rust 端通过 Tauri Event 发来的 `workflow:dispatch`
//   2. 解析 NodeDispatchRequest
//   3. 从 nodeRegistry 查对应 NodeTypeDefinition
//   4. 构造 WorkflowContext，await execute
//   5. 通过 invoke('workflow_node_result') 回调 Rust 端
//   6. stream 节点中途用 invoke('workflow_node_progress') 推 chunk
//   7. 定期发 invoke('workflow_node_heartbeat')
//   8. 收到 invoke('workflow_node_cancel') 后 cancel flag 置 true，节点主动检查
//
// 当前实现：sync 协议走通；stream 协议走通（chunk 累加 → done=true 触发 result 回调）。
// 心跳用 setInterval 模拟；真实生产可让 node 自行调 api.heartbeat()。

import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

import { nodeRegistry } from '../node-registry'
import type {
  NodeExecutionAPI,
  NodeOutput,
  WorkflowContext,
} from '../types'
import {
  failureResult,
  newChunk,
  successResult,
  type NodeDispatchRequest,
  type NodeDispatchResult,
} from './protocol'
import { requestTracker } from './request_tracker'

const DISPATCH_EVENT = 'workflow:dispatch'
const CHUNK_EVENT = 'workflow:node:chunk'
const HEARTBEAT_EVENT = 'workflow:node:heartbeat'
const CANCEL_EVENT = 'workflow:node:cancel'

let unlisten: UnlistenFn | null = null

/**
 * 启动派发监听器。
 * 返回反注册函数。
 */
export async function startDispatchListener(): Promise<() => void> {
  if (unlisten) return () => unlisten?.()
  unlisten = await listen<NodeDispatchRequest>(DISPATCH_EVENT, (e) => {
    void handleDispatch(e.payload)
  })
  return () => {
    unlisten?.()
    unlisten = null
  }
}

/**
 * 主动派发一个请求（用于测试 / 手动触发）。
 */
export async function dispatchRequest(req: NodeDispatchRequest): Promise<void> {
  await handleDispatch(req)
}

async function handleDispatch(req: NodeDispatchRequest): Promise<void> {
  // 护栏 B：requestId 验证
  if (!req.request_id) {
    console.error('[dispatch_listener] 收到空 request_id')
    return
  }

  // 注册 in-flight（RequestTracker 内部也校验）
  const record = requestTracker.register(req)

  // 构造 WorkflowContext
  const ctx = buildContext(req)

  // 构造 NodeExecutionAPI（heartbeat / chunk / cancel 注入到 api 上）
  const api = buildApi(record)

  // 查 handler
  const def = nodeRegistry.get(req.node_type)
  if (!def) {
    await sendResult(failureResult(
      req.request_id, req.run_id, req.node_id,
      `节点类型 "${req.node_type}" 未注册`, 0,
    ))
    requestTracker.finalize(req.request_id)
    return
  }

  // 启动心跳循环
  const heartbeatTimer = setInterval(() => {
    invoke(HEARTBEAT_EVENT, {
      payload: {
        request_id: req.request_id,
        run_id: req.run_id,
        node_id: req.node_id,
        ts: Date.now(),
      },
    }).catch(() => { /* 后端未连时吞掉 */ })
  }, 2_000)

  const startMs = Date.now()
  try {
    if (req.protocol === 'sync') {
      const output = await def.execute(req.config, ctx, api)
      await sendResult(toResult(req, output, Date.now() - startMs))
    } else {
      // stream：让 handler 通过 api.emitChunk 推；await onDone
      const finalOutput = await runStream(def, req, ctx, api)
      await sendResult(successResult(
        req.request_id, req.run_id, req.node_id,
        finalOutput, Date.now() - startMs,
      ))
    }
  } catch (err) {
    await sendResult(failureResult(
      req.request_id, req.run_id, req.node_id,
      err instanceof Error ? err.message : String(err),
      Date.now() - startMs,
    ))
  } finally {
    clearInterval(heartbeatTimer)
    requestTracker.finalize(req.request_id)
  }
}

function runStream(
  def: import('../types').NodeTypeDefinition,
  req: NodeDispatchRequest,
  ctx: WorkflowContext,
  api: NodeExecutionAPI,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const final = (output: unknown) => {
      // 发 done=true 的 chunk 让 RequestTracker 知道收尾
      invoke(CHUNK_EVENT, {
        payload: newChunk(req.request_id, req.run_id, req.node_id, Number.MAX_SAFE_INTEGER, output, 1.0, true),
      }).catch(() => { /* 吞掉 */ })
      resolve(output)
    }
    // 给 handler 用：替换 ctx 上的 metadata 让 stream 节点知道这是 stream
    const streamApi: NodeExecutionAPI = {
      ...api,
      emitEvent: (event) => {
        // 中途事件 → 视为 chunk（progress 由 handler 决定）
        invoke(CHUNK_EVENT, {
          payload: newChunk(
            req.request_id, req.run_id, req.node_id,
            requestTracker.get(req.request_id)?.chunks.size ?? 0,
            event, 0.5, false,
          ),
        }).catch(() => { /* 吞掉 */ })
      },
    }
    def.execute(req.config, ctx, streamApi)
      .then((out) => final(out.data))
      .catch((err) => reject(err instanceof Error ? err : new Error(String(err))))
  })
}

function toResult(
  req: NodeDispatchRequest,
  output: NodeOutput,
  elapsedMs: number,
): NodeDispatchResult {
  if (output.status === 'success') {
    return successResult(req.request_id, req.run_id, req.node_id, output.data, elapsedMs)
  }
  return failureResult(req.request_id, req.run_id, req.node_id,
    output.error ?? 'unknown error', elapsedMs)
}

async function sendResult(result: NodeDispatchResult): Promise<void> {
  try {
    await invoke('workflow_node_result', { payload: result })
  } catch (e) {
    console.error('[dispatch_listener] 回调 workflow_node_result 失败:', e)
  }
}

function buildContext(req: NodeDispatchRequest): WorkflowContext {
  return {
    params: {},
    nodes: {},
    variables: {},
    loop_results: [],
    iterate_results: [],
    metadata: {
      workflowId: '',
      runId: req.run_id,
      startedAt: Date.now(),
      currentNodeId: req.node_id,
    },
  }
}

function buildApi(_record: import('./request_tracker').InflightRecord): NodeExecutionAPI {
  return {
    callTool: async (_name: string, _args: Record<string, unknown>) => {
      throw new Error('callTool 在 Tauri Event 模式下未实现（Phase 2.6）')
    },
    resolveVars: (template: string) => template,
    dispatchSubAgent: async () => {
      throw new Error('dispatchSubAgent 在 Tauri Event 模式下未实现（Phase 2.6）')
    },
    emitEvent: () => { /* 默认 no-op；stream 节点用 streamApi.override */ },
  }
}

// ─── 调试用：手动 cancel 注入（Rust 端 cancel event 暂未实现） ───
export function simulateCancel(requestId: string): boolean {
  return requestTracker.cancel(requestId)
}

export { CANCEL_EVENT, CHUNK_EVENT, DISPATCH_EVENT, HEARTBEAT_EVENT }
