import { ref } from 'vue'
import type { MCPConnectionConfig, MCPConnectionState } from '@agent/index'
import { useAgent } from './useAgent'

const STORAGE_KEY = 'agent_mcp_connections'
const connections = ref<MCPConnectionState[]>([])
const loaded = ref(false)

function loadFromStorage(): MCPConnectionConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveToStorage(configs: MCPConnectionConfig[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configs))
  } catch {}
}

export function useMcpConnections() {
  function getAgentMethods() {
    try {
      return useAgent()
    } catch {
      return null
    }
  }

  async function ensureLoaded(): Promise<void> {
    if (loaded.value) return
    const agent = getAgentMethods()
    if (!agent) return
    loaded.value = true
    const configs = loadFromStorage()
    for (const config of configs) {
      if (config.enabled) {
        try { await agent.addMCPConnection(config) } catch {}
      }
    }
    connections.value = agent.getMCPConnections()
  }

  async function addConnection(config: MCPConnectionConfig): Promise<void> {
    const agent = getAgentMethods()
    if (!agent) return
    await agent.addMCPConnection(config)
    const configs = loadFromStorage()
    configs.push(config)
    saveToStorage(configs)
    connections.value = agent.getMCPConnections()
  }

  async function removeConnection(serverId: string): Promise<void> {
    const agent = getAgentMethods()
    if (!agent) return
    await agent.removeMCPConnection(serverId)
    const configs = loadFromStorage().filter(c => c.id !== serverId)
    saveToStorage(configs)
    connections.value = agent.getMCPConnections()
  }

  async function toggleConnection(serverId: string): Promise<void> {
    const agent = getAgentMethods()
    if (!agent) return
    const configs = loadFromStorage()
    const idx = configs.findIndex(c => c.id === serverId)
    if (idx === -1) return
    configs[idx].enabled = !configs[idx].enabled
    saveToStorage(configs)
    if (configs[idx].enabled) {
      try { await agent.addMCPConnection(configs[idx]) } catch {}
    } else {
      await agent.removeMCPConnection(serverId)
    }
    connections.value = agent.getMCPConnections()
  }

  async function refreshConnections(): Promise<void> {
    const agent = getAgentMethods()
    if (!agent) return
    connections.value = agent.getMCPConnections()
  }

  return {
    connections,
    ensureLoaded,
    addConnection,
    removeConnection,
    toggleConnection,
    refreshConnections,
  }
}
