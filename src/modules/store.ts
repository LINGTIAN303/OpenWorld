
import { db } from '@worldsmith/entity-core/core'
import type { ModuleInstance } from './types'

const mstore = db.modules as any

async function getAll(): Promise<ModuleInstance[]> {
  return mstore.toArray()
}

async function get(id: string): Promise<ModuleInstance | undefined> {
  return mstore.get(id)
}

async function getActive(): Promise<ModuleInstance[]> {
  return mstore.where('active').equals(1).toArray()
}

async function install(instance: ModuleInstance): Promise<void> {
  await mstore.put(instance)
}

async function uninstall(id: string): Promise<void> {
  await mstore.delete(id)
}

async function setActive(id: string, active: boolean): Promise<void> {
  await mstore.update(id, { active })
}

async function exists(id: string): Promise<boolean> {
  const m = await mstore.get(id)
  return m !== undefined
}

async function clear(): Promise<void> {
  await mstore.clear()
}

async function migrateFromLocalStorage() {
  try {
    const raw = localStorage.getItem('worldsmith_custom_modules')
    if (!raw) return { migrated: 0 }
    const oldModules = JSON.parse(raw)
    if (!Array.isArray(oldModules)) return { migrated: 0 }

    let count = 0
    for (const mod of oldModules) {
      const id = 'custom.' + mod.id
      if (!(await exists(id))) {
        await install({
          id: id,
          manifest: {
            id: id,
            name: mod.name || 'Unnamed',
            version: '1.0.0',
            icon: mod.icon || '🧩',
            description: mod.description || '',
            dependencies: [],
            entityTypes: (mod.entityTypes || []).map((et: any) => ({
              ...et,
              name: 'custom.' + mod.id + '.' + et.name,
            })),
            relationTypes: (mod.relationTypes || []).map((rt: any) => ({
              ...rt,
              name: 'custom.' + mod.id + '.' + rt.name,
              sourceTypes: (rt.sourceTypes || []).map((t: string) => 'custom.' + mod.id + '.' + t),
              targetTypes: (rt.targetTypes || []).map((t: string) => 'custom.' + mod.id + '.' + t),
            })),
            views: (mod.views || []).map((v: any) => ({
              ...v,
              id: 'custom.' + mod.id + '.' + v.id,
            })),
            createdAt: mod.createdAt || new Date().toISOString(),
            updatedAt: mod.updatedAt || new Date().toISOString(),
          },
          installedAt: new Date().toISOString(),
          source: 'local',
          active: true,
        })
        count++
      }
    }
    return { migrated: count }
  } catch (e) {
    return { migrated: 0, error: String(e) }
  }
}

export const moduleStore = { getAll, get, getActive, install, uninstall, setActive, exists, clear, migrateFromLocalStorage }
