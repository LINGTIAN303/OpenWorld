// 派发协议类型（TS 端）
//
// 与 Rust 端 `src-tauri/src/workflow/dispatch_protocol.rs` 一一对应。
// 跨语言 schema 变更需同步 bump 两端的 `PROTOCOL_VERSION`。

export const PROTOCOL_VERSION = 1

export type NodeProtocol = 'sync' | 'stream'

export interface NodeDispatchRequest {
  v: number
  type: 'node_dispatch_request'
  request_id: string
  run_id: string
  node_id: string
  node_type: string
  protocol: NodeProtocol
  config: Record<string, unknown>
  inputs: Record<string, unknown>
  timeout_ms?: number
}

export interface NodeDispatchResult {
  v: number
  type: 'node_dispatch_result'
  request_id: string
  run_id: string
  node_id: string
  output: unknown
  error?: string
  progress: number
  elapsed_ms?: number
}

export interface NodeDispatchChunk {
  v: number
  type: 'node_dispatch_chunk'
  request_id: string
  run_id: string
  node_id: string
  seq: number
  delta: unknown
  progress: number
  done: boolean
}

export interface NodeDispatchHeartbeat {
  v: number
  type: 'node_dispatch_heartbeat'
  request_id: string
  run_id: string
  node_id: string
  ts: number
}

export type NodeDispatchMessage =
  | NodeDispatchRequest
  | NodeDispatchResult
  | NodeDispatchChunk
  | NodeDispatchHeartbeat

// ─── builders ───

export function newDispatchRequest(
  requestId: string,
  runId: string,
  nodeId: string,
  nodeType: string,
  protocol: NodeProtocol,
  config: Record<string, unknown>,
  inputs: Record<string, unknown>,
  timeoutMs?: number,
): NodeDispatchRequest {
  return {
    v: PROTOCOL_VERSION,
    type: 'node_dispatch_request',
    request_id: requestId,
    run_id: runId,
    node_id: nodeId,
    node_type: nodeType,
    protocol,
    config,
    inputs,
    timeout_ms: timeoutMs,
  }
}

export function successResult(
  requestId: string,
  runId: string,
  nodeId: string,
  output: unknown,
  elapsedMs?: number,
): NodeDispatchResult {
  return {
    v: PROTOCOL_VERSION,
    type: 'node_dispatch_result',
    request_id: requestId,
    run_id: runId,
    node_id: nodeId,
    output,
    error: undefined,
    progress: 1.0,
    elapsed_ms: elapsedMs,
  }
}

export function failureResult(
  requestId: string,
  runId: string,
  nodeId: string,
  error: string,
  elapsedMs?: number,
): NodeDispatchResult {
  return {
    v: PROTOCOL_VERSION,
    type: 'node_dispatch_result',
    request_id: requestId,
    run_id: runId,
    node_id: nodeId,
    output: null,
    error,
    progress: 0.0,
    elapsed_ms: elapsedMs,
  }
}

export function newChunk(
  requestId: string,
  runId: string,
  nodeId: string,
  seq: number,
  delta: unknown,
  progress: number,
  done: boolean,
): NodeDispatchChunk {
  return {
    v: PROTOCOL_VERSION,
    type: 'node_dispatch_chunk',
    request_id: requestId,
    run_id: runId,
    node_id: nodeId,
    seq,
    delta,
    progress,
    done,
  }
}
