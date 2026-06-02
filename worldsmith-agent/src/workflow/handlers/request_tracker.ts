// RequestTracker — 追踪 in-flight 的派发请求（TS 端）
//
// 对应 Rust 端 10 护栏中：
//   * 护栏 E (pending 持久化) — 内存索引；持久化由 Rust 端 workflow_pending_dispatches 表负责
//   * 护栏 I (心跳检查)       — 记录每个 request 最后心跳
//   * 护栏 J (seq 排序)        — 维护 stream chunk 的 seq 状态
//   * 护栏 B (requestId 验证)  — 创建/查找时校验
//
// 不持有 1:1 的 Rust 状态；这是 TS 端独立的运行时状态，用于：
//   * cancel 时反向通知 TS 节点停止
//   * 心跳超时降级
//   * chunk 缺号报警

import type {
  NodeDispatchChunk,
  NodeDispatchRequest,
  NodeProtocol,
} from './protocol'

export interface InflightRecord {
  requestId: string
  runId: string
  nodeId: string
  nodeType: string
  protocol: NodeProtocol
  dispatchedAt: number
  lastHeartbeatAt: number
  /** 协议版本（用 1） */
  v: number
  /** stream 节点：已收 chunks */
  chunks: Map<number, NodeDispatchChunk>
  /** stream 节点：是否收到 done=true 的终止 chunk */
  done: boolean
  /** 取消信号（dispatch_listener 在收到 cancel 时置 true） */
  cancelFlag: { cancelled: boolean }
  /** 等待结果的 Promise resolver */
  resolve?: (result: unknown) => void
  reject?: (err: Error) => void
}

/** 心跳默认 TTL：5 秒。TS 端超过此间隔未发心跳，认为节点已死 */
export const DEFAULT_HEARTBEAT_TTL_MS = 5_000

export class RequestTracker {
  private inflight: Map<string, InflightRecord> = new Map()
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null

  /** 注册一次 in-flight 请求（护栏 B：验证 requestId 非空） */
  register(req: NodeDispatchRequest, now = Date.now()): InflightRecord {
    if (!req.request_id) {
      throw new Error('[RequestTracker] request_id 为空（护栏 B 校验失败）')
    }
    if (req.request_id.length > 256) {
      throw new Error('[RequestTracker] request_id 超过 256 字节（护栏 B 校验失败）')
    }
    const rec: InflightRecord = {
      requestId: req.request_id,
      runId: req.run_id,
      nodeId: req.node_id,
      nodeType: req.node_type,
      protocol: req.protocol,
      dispatchedAt: now,
      lastHeartbeatAt: now,
      v: req.v,
      chunks: new Map(),
      done: false,
      cancelFlag: { cancelled: false },
    }
    this.inflight.set(req.request_id, rec)
    this.ensureHeartbeatLoop()
    return rec
  }

  /** 标记完成（resolve/reject 由调用方处理） */
  finalize(requestId: string): InflightRecord | undefined {
    const rec = this.inflight.get(requestId)
    if (rec) this.inflight.delete(requestId)
    this.maybeStopHeartbeatLoop()
    return rec
  }

  /** 收 chunk（护栏 J：按 seq 累积 + 乱序容忍） */
  pushChunk(chunk: NodeDispatchChunk): InflightRecord | undefined {
    const rec = this.inflight.get(chunk.request_id)
    if (!rec) return undefined
    if (rec.protocol !== 'stream') {
      throw new Error(
        `[RequestTracker] 收到 chunk 但 request ${chunk.request_id} 是 sync 协议（护栏 A 违反）`,
      )
    }
    rec.lastHeartbeatAt = Date.now()
    if (chunk.done) rec.done = true
    rec.chunks.set(chunk.seq, chunk)
    return rec
  }

  /** 心跳 */
  heartbeat(requestId: string, now = Date.now()): InflightRecord | undefined {
    const rec = this.inflight.get(requestId)
    if (rec) rec.lastHeartbeatAt = now
    return rec
  }

  /** 取消请求：把 cancelFlag 置 true，等待 in-flight node handler 主动检查 */
  cancel(requestId: string): boolean {
    const rec = this.inflight.get(requestId)
    if (!rec) return false
    rec.cancelFlag.cancelled = true
    return true
  }

  /** 取所有 in-flight 记录（用于 hydrate / 监控） */
  list(): InflightRecord[] {
    return Array.from(this.inflight.values())
  }

  /** 查单条 */
  get(requestId: string): InflightRecord | undefined {
    return this.inflight.get(requestId)
  }

  /** 缺号 seq 检测（护栏 J） */
  missingSeqs(record: InflightRecord): number[] {
    if (!record.done) return []
    const maxSeq = Math.max(0, ...record.chunks.keys())
    const missing: number[] = []
    for (let i = 0; i <= maxSeq; i++) {
      if (!record.chunks.has(i)) missing.push(i)
    }
    return missing
  }

  /** 心跳超时检测（护栏 I）：返回已超时的 requestId 列表 */
  staleHeartbeats(ttlMs = DEFAULT_HEARTBEAT_TTL_MS, now = Date.now()): string[] {
    const stale: string[] = []
    for (const rec of this.inflight.values()) {
      if (now - rec.lastHeartbeatAt > ttlMs) {
        stale.push(rec.requestId)
      }
    }
    return stale
  }

  /** 重组 stream 节点的 chunk 为有序 delta 数组 */
  drainOrderedDeltas(record: InflightRecord): unknown[] {
    return Array.from(record.chunks.values())
      .sort((a, b) => a.seq - b.seq)
      .map((c) => c.delta)
  }

  private ensureHeartbeatLoop(): void {
    if (this.heartbeatTimer) return
    this.heartbeatTimer = setInterval(() => {
      const stale = this.staleHeartbeats()
      for (const id of stale) {
        const rec = this.inflight.get(id)
        if (rec) {
          // 标记为"心跳超时"——调用方可以拒绝后续 chunk 并 unregister
          rec.reject?.(new Error(`心跳超时: ${id} (${DEFAULT_HEARTBEAT_TTL_MS}ms 无更新)`))
          this.inflight.delete(id)
        }
      }
      this.maybeStopHeartbeatLoop()
    }, DEFAULT_HEARTBEAT_TTL_MS)
  }

  private maybeStopHeartbeatLoop(): void {
    if (this.inflight.size === 0 && this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }
}

export const requestTracker = new RequestTracker()
