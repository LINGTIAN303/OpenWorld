/**
 * CliAgentConnection 的 Web 端实现
 *
 * 桥接 useCliAgent composable（Vue 响应式）和 HybridBackend（纯 TS），
 * 让 HybridBackend 能通过 HTTP 调用 CLI Agent Server 的工具。
 */
import type { CliAgentConnection } from '@agent/hybrid-backend'

export class WebCliAgentConnection implements CliAgentConnection {
  private _connected = false
  private _remoteToolNames = new Set<string>()
  private _baseUrl = 'http://localhost:3100'

  get connected(): boolean {
    return this._connected
  }

  get remoteToolNames(): ReadonlySet<string> {
    return this._remoteToolNames
  }

  /** 连接到 CLI Agent Server */
  async connect(url?: string): Promise<boolean> {
    const target = url || this._baseUrl
    this._baseUrl = target

    try {
      // 1. 健康检查
      const healthResp = await fetch(`${target}/health`, { signal: AbortSignal.timeout(3000) })
      if (!healthResp.ok) {
        this._connected = false
        return false
      }

      // 2. 获取能力列表
      const capsResp = await fetch(`${target}/api/capabilities`, { signal: AbortSignal.timeout(5000) })
      if (!capsResp.ok) {
        this._connected = false
        return false
      }
      const caps = await capsResp.json()

      // 3. 更新状态
      this._remoteToolNames = new Set(caps.tools || [])
      this._connected = true
      return true
    } catch {
      this._connected = false
      return false
    }
  }

  /** 断开连接 */
  disconnect(): void {
    this._connected = false
    this._remoteToolNames = new Set()
  }

  /** 调用远程工具 */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<{ ok: boolean; result?: string; error?: string }> {
    if (!this._connected) {
      return { ok: false, error: 'CLI Agent 未连接' }
    }

    try {
      const resp = await fetch(`${this._baseUrl}/api/tools/${encodeURIComponent(toolName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args }),
      })
      return await resp.json()
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /** 更新基础 URL */
  setBaseUrl(url: string): void {
    this._baseUrl = url
  }
}

/** 全局单例 */
let _instance: WebCliAgentConnection | null = null

export function getWebCliAgentConnection(): WebCliAgentConnection {
  if (!_instance) {
    _instance = new WebCliAgentConnection()
  }
  return _instance
}
