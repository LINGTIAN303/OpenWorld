import type { ToolDefinition } from '../bridge-types'
import type { Platform } from './capability-types'
import { InternalChainRegistry } from './internal-registry'
import { findSkillById, resolveToolNames } from '../skills/registry'
import { resolvePluginToolNames } from '../skills/plugin-bridge'
import { SKILL_META_TOOLS } from '../agent'

export interface ToolBus {
  register(tool: ToolDefinition): void
  unregister(name: string): void
  registerInternal(registry: InternalChainRegistry): void
  registerMcpTools(serverId: string, tools: ToolDefinition[]): void
  unregisterMcpServer(serverId: string): void
  resolve(skillIds: string[], platform?: Platform): ToolDefinition[]
  getAll(): ToolDefinition[]
  getByName(name: string): ToolDefinition | undefined
  getInternalRegistry(): InternalChainRegistry | null
}

export class DefaultToolBus implements ToolBus {
  private internal = new Map<string, ToolDefinition>()
  private internalRegistry: InternalChainRegistry | null = null
  private mcp = new Map<string, Map<string, ToolDefinition>>()

  register(tool: ToolDefinition): void {
    this.internal.set(tool.name, tool)
  }

  unregister(name: string): void {
    this.internal.delete(name)
  }

  registerInternal(registry: InternalChainRegistry): void {
    this.internalRegistry = registry
  }

  registerMcpTools(serverId: string, tools: ToolDefinition[]): void {
    const serverTools = new Map<string, ToolDefinition>()
    for (const t of tools) {
      serverTools.set(t.name, t)
    }
    this.mcp.set(serverId, serverTools)
  }

  unregisterMcpServer(serverId: string): void {
    this.mcp.delete(serverId)
  }

  resolve(skillIds: string[], platform?: Platform): ToolDefinition[] {
    const p = platform || 'web'

    if (this.internalRegistry) {
      return this.resolveWithRegistry(skillIds, p)
    }

    return this.resolveLegacy(skillIds)
  }

  private resolveWithRegistry(skillIds: string[], platform: Platform): ToolDefinition[] {
    const legacyNames = this.resolveLegacyNames(skillIds)
    const registryTools = this.resolveFromRegistry(skillIds, platform)
    const tools: ToolDefinition[] = []
    const seen = new Set<string>()

    for (const name of legacyNames) {
      const t = this.internal.get(name)
      if (t && !seen.has(name)) {
        tools.push(t)
        seen.add(name)
      }
    }

    for (const t of registryTools) {
      if (!seen.has(t.name)) {
        tools.push(t)
        seen.add(t.name)
      }
    }

    for (const t of SKILL_META_TOOLS) {
      if (!seen.has(t.name)) {
        tools.push(t)
        seen.add(t.name)
      }
    }

    for (const serverTools of this.mcp.values()) {
      for (const t of serverTools.values()) {
        if (!seen.has(t.name)) {
          tools.push(t)
          seen.add(t.name)
        }
      }
    }

    return tools
  }

  private resolveFromRegistry(skillIds: string[], platform: Platform): ToolDefinition[] {
    if (!this.internalRegistry) return []
    const capabilityIds = new Set<string>()
    for (const id of skillIds) {
      const skill = findSkillById(id)
      if (skill?.capabilities) {
        for (const capId of skill.capabilities.internal) capabilityIds.add(capId)
        for (const capId of skill.capabilities.cli) capabilityIds.add(capId)
        for (const capId of skill.capabilities.mcp) capabilityIds.add(capId)
      }
    }
    if (capabilityIds.size === 0) return []
    return this.internalRegistry.resolve([...capabilityIds], platform)
  }

  private resolveLegacyNames(skillIds: string[]): string[] {
    const internalNames = resolveToolNames(skillIds)
    const pluginNames = resolvePluginToolNames(skillIds)
    return [...new Set([...internalNames, ...pluginNames])]
  }

  private resolveLegacy(skillIds: string[]): ToolDefinition[] {
    const internalNames = resolveToolNames(skillIds)
    const pluginNames = resolvePluginToolNames(skillIds)
    const allNames = new Set([...internalNames, ...pluginNames])
    const tools: ToolDefinition[] = []
    const seen = new Set<string>()

    for (const name of allNames) {
      const t = this.internal.get(name)
      if (t && !seen.has(name)) {
        tools.push(t)
        seen.add(name)
      }
    }

    for (const t of SKILL_META_TOOLS) {
      if (!seen.has(t.name)) {
        tools.push(t)
        seen.add(t.name)
      }
    }

    for (const serverTools of this.mcp.values()) {
      for (const t of serverTools.values()) {
        if (!seen.has(t.name)) {
          tools.push(t)
          seen.add(t.name)
        }
      }
    }

    return tools
  }

  getAll(): ToolDefinition[] {
    const tools: ToolDefinition[] = []
    const seen = new Set<string>()
    for (const t of this.internal.values()) {
      if (!seen.has(t.name)) { tools.push(t); seen.add(t.name) }
    }
    for (const serverTools of this.mcp.values()) {
      for (const t of serverTools.values()) {
        if (!seen.has(t.name)) { tools.push(t); seen.add(t.name) }
      }
    }
    return tools
  }

  getByName(name: string): ToolDefinition | undefined {
    const internal = this.internal.get(name)
    if (internal) return internal
    for (const serverTools of this.mcp.values()) {
      const found = serverTools.get(name)
      if (found) return found
    }
    return undefined
  }

  getInternalRegistry(): InternalChainRegistry | null {
    return this.internalRegistry
  }
}
