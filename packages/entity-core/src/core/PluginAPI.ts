import type { EntityTypeSchema } from '../types'
import type { RelationTypeSchema } from '../types'
import type { PluginView } from '../types'
import { entitySchemaRegistry } from './EntitySchema'
import { relationSchemaRegistry } from './RelationSchema'
import { fieldRegistry } from './FieldRegistry'
import { storage } from './StorageBackend'

export interface NodeTypeDefinition {
  type: string
  category: string
  label: string
  icon: string
  color: string
  pluginId: string
  description: string
  configSchema: Record<string, unknown>
  [key: string]: unknown
}

export interface WorkflowTemplateDefinition {
  id: string
  name: string
  description: string
  category: string
  [key: string]: unknown
}

export interface ExternalNodeRegistry {
  register(handler: NodeTypeDefinition): void
  unregister(type: string): boolean
  getAll(): NodeTypeDefinition[]
}

class PluginAPIImpl {
  private _views: PluginView[] = []
  private hooks = new Map<string, Array<{ pluginId: string; fn: Function }>>()
  private _workflowTemplates: Map<string, WorkflowTemplateDefinition> = new Map()
  private _nodeTypes: Map<string, NodeTypeDefinition> = new Map()
  private _externalNodeRegistry: ExternalNodeRegistry | null = null
  private currentPluginId = ''

  setPluginId(id: string) {
    this.currentPluginId = id
  }

  setExternalNodeRegistry(registry: ExternalNodeRegistry): void {
    this._externalNodeRegistry = registry
    for (const [, nodeType] of this._nodeTypes) {
      registry.register(nodeType)
    }
  }

  registerEntityType(schema: EntityTypeSchema): void {
    entitySchemaRegistry.register({ ...schema, pluginId: this.currentPluginId })
    fieldRegistry.registerBuiltin(schema.type, schema.fields || [])
  }

  registerRelationType(schema: RelationTypeSchema): void {
    relationSchemaRegistry.register({ ...schema, pluginId: this.currentPluginId })
  }

  registerView(view: PluginView): void {
    view.pluginId = this.currentPluginId
    if (!this._views.find((v) => v.id === view.id)) {
      this._views.push(view)
    }
  }

  getViews(): PluginView[] {
    return this._views
  }

  unregisterView(viewId: string): boolean {
    const idx = this._views.findIndex(v => v.id === viewId)
    if (idx !== -1) {
      this._views.splice(idx, 1)
      return true
    }
    return false
  }

  unregisterHooksByPlugin(pluginId: string): number {
    let count = 0
    for (const [name, entries] of this.hooks) {
      const before = entries.length
      const filtered = entries.filter(e => e.pluginId !== pluginId)
      this.hooks.set(name, filtered)
      count += before - filtered.length
    }
    return count
  }

  registerHook(name: string, fn: Function): void {
    if (!this.hooks.has(name)) this.hooks.set(name, [])
    this.hooks.get(name)!.push({ pluginId: this.currentPluginId, fn })
  }

  async runHooks(name: string, ...args: unknown[]): Promise<void> {
    const entries = this.hooks.get(name)
    if (!entries) return
    for (const entry of entries) await entry.fn(...args)
  }

  async getEntities(type?: string) {
    if (type) return storage.getEntitiesByType(type)
    return storage.getAllEntities()
  }

  async getRelations(filter?: {
    type?: string
    sourceId?: string
    targetId?: string
  }) {
    let relations = await storage.getAllRelations()
    if (filter?.type) relations = relations.filter(r => r.type === filter.type)
    if (filter?.sourceId) relations = relations.filter(r => r.sourceId === filter.sourceId)
    if (filter?.targetId) relations = relations.filter(r => r.targetId === filter.targetId)
    return relations
  }

  async getEntity(id: string) {
    return storage.getEntity(id)
  }

  registerNodeType(nodeType: NodeTypeDefinition): void {
    const entry = { ...nodeType, pluginId: this.currentPluginId }
    this._nodeTypes.set(nodeType.type, entry)
    if (this._externalNodeRegistry) {
      this._externalNodeRegistry.register(entry)
    }
  }

  unregisterNodeType(type: string): boolean {
    this._nodeTypes.delete(type)
    if (this._externalNodeRegistry) {
      return this._externalNodeRegistry.unregister(type)
    }
    return true
  }

  getNodeTypeRegistry(): NodeTypeDefinition[] {
    if (this._externalNodeRegistry) {
      return this._externalNodeRegistry.getAll()
    }
    return Array.from(this._nodeTypes.values())
  }

  registerWorkflowTemplate(template: WorkflowTemplateDefinition): void {
    this._workflowTemplates.set(template.id, { ...template })
  }

  unregisterWorkflowTemplate(templateId: string): boolean {
    return this._workflowTemplates.delete(templateId)
  }

  getWorkflowTemplates(): WorkflowTemplateDefinition[] {
    return Array.from(this._workflowTemplates.values())
  }
}

export const pluginAPI = new PluginAPIImpl()
export type PluginAPIType = typeof pluginAPI
