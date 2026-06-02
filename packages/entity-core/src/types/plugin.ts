import type { Component } from 'vue'

export interface PluginPermission {
  name: string
  description?: string
}

export interface PluginCapabilityDeclaration {
  action: string
  description: string
  params?: string[]
}

export interface PluginDependency {
  pluginId: string
  minVersion?: string
}

export interface PluginManifest {
  id: string
  name: string
  version: string
  description: string
  author?: string
  permissions?: PluginPermission[]
  dependencies?: PluginDependency[]
  entityTypes?: string[]
  relationTypes?: string[]
  views?: string[]
  agentSkills?: string[]
  agentCapabilities?: PluginCapabilityDeclaration[]
}

export interface PluginView {
  id: string
  label: string
  icon: string
  component: Component
  pluginId?: string
  _moduleId?: string
  _viewConfig?: import('./module').ModuleViewConfig
}

export interface PluginInstance {
  manifest: PluginManifest
  activate(api: Record<string, unknown>): void | Promise<void>
  deactivate?(): void | Promise<void>
}

export const KNOWN_PERMISSIONS = [
  'storage:read',
  'storage:write',
  'entities:read',
  'entities:write',
  'relations:read',
  'relations:write',
  'schema:register',
  'hooks:register',
  'views:register',
  'network:fetch',
  'clipboard:access',
  'notifications:send',
] as const

export type PluginPermissionName = typeof KNOWN_PERMISSIONS[number]
