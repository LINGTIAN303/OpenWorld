import type { PluginInstance, PluginManifest } from '@worldsmith/entity-core/types'
import { pluginAPI, usePluginStore, entitySchemaRegistry, relationSchemaRegistry } from '@worldsmith/entity-core'
import { PluginSandbox } from './PluginSandbox'

interface PluginRegistration {
  entityTypes: string[]
  relationTypes: string[]
  views: string[]
  hooks: string[]
  nodeTypes: string[]
  workflowTemplates: string[]
}

export class PluginManager {
  private loaded = new Map<string, PluginInstance>()
  private registrations = new Map<string, PluginRegistration>()
  private viewHook?: (viewId: string) => void

  setViewHook(hook: (viewId: string) => void) {
    this.viewHook = hook
  }

  async activate(plugin: PluginInstance): Promise<void> {
    if (this.loaded.has(plugin.manifest.id)) {
      console.warn(`[PluginManager] 插件 "${plugin.manifest.id}" 已激活`)
      return
    }

    pluginAPI.setPluginId(plugin.manifest.id)

    const safeAPI = PluginSandbox.createSafeAPI(
      pluginAPI as unknown as Record<string, unknown>,
      plugin.manifest,
    )

    const beforeEntities = new Set(entitySchemaRegistry.getAll().map(s => s.type))
    const beforeRelations = new Set(relationSchemaRegistry.getAll().map(s => s.type))
    const beforeViews = new Set(pluginAPI.getViews().map(v => v.id))
    const beforeNodeTypes = new Set(pluginAPI.getNodeTypeRegistry().map(n => n.type))
    const beforeTemplates = new Set(pluginAPI.getWorkflowTemplates().map(t => t.id))

    await plugin.activate(safeAPI)

    const afterEntities = entitySchemaRegistry.getAll().map(s => s.type)
    const afterRelations = relationSchemaRegistry.getAll().map(s => s.type)
    const afterViews = pluginAPI.getViews().map(v => v.id)
    const afterNodeTypes = pluginAPI.getNodeTypeRegistry().map(n => n.type)
    const afterTemplates = pluginAPI.getWorkflowTemplates().map(t => t.id)

    const registeredEntityTypes = afterEntities.filter(t => !beforeEntities.has(t))
    const registeredRelationTypes = afterRelations.filter(t => !beforeRelations.has(t))
    const registeredViews = afterViews.filter(v => !beforeViews.has(v))
    const registeredNodeTypes = afterNodeTypes.filter(t => !beforeNodeTypes.has(t))
    const registeredTemplates = afterTemplates.filter(t => !beforeTemplates.has(t))

    this.registrations.set(plugin.manifest.id, {
      entityTypes: registeredEntityTypes,
      relationTypes: registeredRelationTypes,
      views: registeredViews,
      hooks: [],
      nodeTypes: registeredNodeTypes,
      workflowTemplates: registeredTemplates,
    })

    this.loaded.set(plugin.manifest.id, plugin)

    const store = usePluginStore()
    store.registerPlugin(plugin.manifest)

    for (const viewId of registeredViews) {
      this.viewHook?.(viewId)
    }

    console.log(`[PluginManager] 已激活: ${plugin.manifest.name} v${plugin.manifest.version}`)
  }

  async deactivate(pluginId: string): Promise<void> {
    const plugin = this.loaded.get(pluginId)
    if (!plugin) return

    if (plugin.deactivate) {
      await plugin.deactivate()
    }

    const reg = this.registrations.get(pluginId)
    if (reg) {
      for (const type of reg.entityTypes) {
        entitySchemaRegistry.unregister(type)
      }
      for (const type of reg.relationTypes) {
        relationSchemaRegistry.unregister(type)
      }
      for (const viewId of reg.views) {
        pluginAPI.unregisterView(viewId)
      }
      for (const nodeType of reg.nodeTypes) {
        pluginAPI.unregisterNodeType(nodeType)
      }
      for (const templateId of reg.workflowTemplates) {
        pluginAPI.unregisterWorkflowTemplate(templateId)
      }
      this.registrations.delete(pluginId)
    }

    this.loaded.delete(pluginId)
    console.log(`[PluginManager] 已停用: ${plugin.manifest.name}`)
  }

  async deactivateAll(): Promise<void> {
    const ids = Array.from(this.loaded.keys())
    for (const id of ids) {
      await this.deactivate(id)
    }
  }

  async reload(pluginId: string): Promise<void> {
    const plugin = this.loaded.get(pluginId)
    if (!plugin) return
    await this.deactivate(pluginId)
    await this.activate(plugin)
  }

  isLoaded(id: string): boolean {
    return this.loaded.has(id)
  }

  getLoaded(): PluginInstance[] {
    return Array.from(this.loaded.values())
  }

  getRegistration(pluginId: string): PluginRegistration | undefined {
    return this.registrations.get(pluginId)
  }

  getAllRegistrations(): Map<string, PluginRegistration> {
    return new Map(this.registrations)
  }
}

export const pluginManager = new PluginManager()
