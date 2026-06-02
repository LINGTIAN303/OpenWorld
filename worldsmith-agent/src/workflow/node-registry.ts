import type { NodeTypeDefinition, NodeCategory } from './types'

export class NodeRegistry {
  private handlers: Map<string, NodeTypeDefinition> = new Map()

  register(handler: NodeTypeDefinition): void {
    if (this.handlers.has(handler.type)) {
      console.warn(`[NodeRegistry] 节点类型 "${handler.type}" 已注册，将被覆盖`)
    }
    this.handlers.set(handler.type, handler)
  }

  unregister(type: string): boolean {
    return this.handlers.delete(type)
  }

  get(type: string): NodeTypeDefinition | undefined {
    return this.handlers.get(type)
  }

  has(type: string): boolean {
    return this.handlers.has(type)
  }

  getAll(): NodeTypeDefinition[] {
    return Array.from(this.handlers.values())
  }

  getByCategory(category: NodeCategory): NodeTypeDefinition[] {
    return this.getAll().filter(h => h.category === category)
  }

  unregisterByPlugin(pluginId: string): number {
    let count = 0
    for (const [type, handler] of this.handlers) {
      if (handler.pluginId === pluginId) {
        this.handlers.delete(type)
        count++
      }
    }
    return count
  }

  /** Phase 4.6：列出某 plugin 注册的所有节点 type（用于反注册时通知 Rust 端） */
  typesByPlugin(pluginId: string): string[] {
    const out: string[] = []
    for (const [type, handler] of this.handlers) {
      if (handler.pluginId === pluginId) out.push(type)
    }
    return out
  }
}

export const nodeRegistry = new NodeRegistry()
