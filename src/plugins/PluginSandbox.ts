import type { PluginPermission, PluginManifest } from '@worldsmith/entity-core/types'
import { KNOWN_PERMISSIONS } from '@worldsmith/entity-core/types'

type PermissionName = string

const PERMISSION_API_MAP: Record<PermissionName, string[]> = {
  'storage:read': ['getEntities', 'getRelations', 'getEntity', 'getViews', 'kvGet', 'kvGetAll'],
  'storage:write': ['putEntity', 'updateEntity', 'deleteEntity', 'putRelation', 'updateRelation', 'deleteRelation', 'kvSet'],
  'entities:read': ['getEntities', 'getEntity'],
  'entities:write': ['putEntity', 'updateEntity', 'deleteEntity', 'importEntities'],
  'relations:read': ['getRelations'],
  'relations:write': ['putRelation', 'updateRelation', 'deleteRelation', 'importRelations'],
  'schema:register': ['registerEntityType', 'registerRelationType'],
  'hooks:register': ['registerHook', 'runHooks'],
  'views:register': ['registerView'],
  'network:fetch': [],
  'clipboard:access': [],
  'notifications:send': [],
}

const DEFAULT_OFFICIAL_PERMISSIONS: PermissionName[] = [
  'storage:read',
  'entities:read',
  'relations:read',
  'schema:register',
  'hooks:register',
  'views:register',
]

const OFFICIAL_PLUGIN_IDS: Set<string> = new Set([
  'official.characters',
  'official.regions',
  'official.timeline',
  'official.organizations',
  'official.concepts',
  'official.items',
  'official.apparel',
  'official.mindmap',
  'official.custom',
  'official.module-builder',
  'official.graph',
  'official.buildings',
  'official.species',
  'official.magic',
  'official.outline',
  'official.languages',
  'official.culture',
  'official.conflict',
  'official.inspiration',
  'official.plants',
  'official.combat_stats',
  'official.weapons',
  'official.manuscript',
  'official.drawing',
  'official.tactical-board',
  'official.notebook',
  'official.workflow',
])

export class PluginSandbox {
  private allowedMethods: Set<string>
  private pluginId: string
  private permissions: Set<PermissionName>

  constructor(pluginId: string, permissions: PermissionName[]) {
    this.pluginId = pluginId
    this.permissions = new Set(permissions)
    this.allowedMethods = new Set()

    for (const perm of permissions) {
      const methods = PERMISSION_API_MAP[perm]
      if (methods) {
        for (const m of methods) {
          this.allowedMethods.add(m)
        }
      }
    }
  }

  static createSafeAPI(
    api: Record<string, unknown>,
    manifest: PluginManifest,
  ): Record<string, unknown> {
    const isOfficial = OFFICIAL_PLUGIN_IDS.has(manifest.id)
    const permissions = isOfficial
      ? DEFAULT_OFFICIAL_PERMISSIONS
      : (manifest.permissions?.map(p => p.name) ?? [])

    const sandbox = new PluginSandbox(manifest.id, permissions)

    return new Proxy(api, {
      get(target, prop: string) {
        if (!sandbox.allowedMethods.has(prop)) {
          console.warn(
            `[Sandbox] 插件 "${manifest.id}" 尝试访问未授权 API: "${prop}"` +
            ` (需要声明对应 permission)`,
          )
          return () => {
            throw new Error(
              `[Sandbox] 权限不足: 插件 "${manifest.id}" 未声明访问 "${prop}" 的权限`,
            )
          }
        }

        const value = target[prop]
        if (typeof value === 'function') {
          return sandbox.wrapFunction(prop, value.bind(target))
        }
        return value
      },
      set() {
        console.warn(`[Sandbox] 插件 "${manifest.id}" 尝试修改 API 对象，已拦截`)
        return false
      },
    })
  }

  private wrapFunction(methodName: string, fn: Function): Function {
    const self = this
    return function (this: unknown, ...args: unknown[]) {
      if (!self.allowedMethods.has(methodName)) {
        throw new Error(
          `[Sandbox] 权限不足: 插件 "${self.pluginId}" 未声明访问 "${methodName}" 的权限`,
        )
      }
      try {
        return fn.apply(this, args)
      } catch (e) {
        console.error(`[Sandbox] 插件 "${self.pluginId}" 调用 ${methodName} 出错:`, e)
        throw e
      }
    }
  }

  hasPermission(name: PermissionName): boolean {
    return this.permissions.has(name)
  }

  getPermissions(): PermissionName[] {
    return Array.from(this.permissions)
  }
}

export function validatePluginPermissions(
  permissions: PluginPermission[],
): { unknown: string[]; valid: string[] } {
  const known = new Set(KNOWN_PERMISSIONS)
  const unknown: string[] = []
  const valid: string[] = []
  for (const p of permissions) {
    if (known.has(p.name as any)) {
      valid.push(p.name)
    } else {
      unknown.push(p.name)
    }
  }
  return { unknown, valid }
}
