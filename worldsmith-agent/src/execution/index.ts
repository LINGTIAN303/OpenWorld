import type { ExecutionAdapter } from './adapter'
import { TauriExecutionAdapter } from './tauri-adapter'
import { WebSocketExecutionAdapter } from './ws-adapter'

export function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__
}

export function getWsUrl(): string {
  try {
    return localStorage.getItem('ws_server_url') || 'ws://localhost:3100'
  } catch {
    return 'ws://localhost:3100'
  }
}

let adapterInstance: ExecutionAdapter | null = null

export function createExecutionAdapter(): ExecutionAdapter {
  if (adapterInstance) return adapterInstance

  if (isTauri()) {
    adapterInstance = new TauriExecutionAdapter()
  } else {
    adapterInstance = new WebSocketExecutionAdapter({
      url: getWsUrl(),
      reconnect: true,
      maxRetries: 5,
    })
  }

  return adapterInstance
}

export function resetExecutionAdapter(): void {
  if (adapterInstance && 'disconnect' in adapterInstance) {
    (adapterInstance as any).disconnect()
  }
  adapterInstance = null
}
