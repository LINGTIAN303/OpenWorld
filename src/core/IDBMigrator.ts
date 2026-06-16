import { db as legacyDb } from '@worldsmith/entity-core/core'
import { storage, isTauri } from '@worldsmith/entity-core/core'

export interface MigrationReport {
  entitiesMigrated: number
  relationsMigrated: number
  skipped: boolean
  reason?: string
}

export async function migrateIndexedDBToSQLite(): Promise<MigrationReport> {
  if (!isTauri()) {
    return {
      entitiesMigrated: 0,
      relationsMigrated: 0,
      skipped: true,
      reason: '非 Tauri 环境，无需迁移',
    }
  }

  const alreadyMigrated = localStorage.getItem('worldsmith_idb_migrated')
  if (alreadyMigrated === 'true') {
    return {
      entitiesMigrated: 0,
      relationsMigrated: 0,
      skipped: true,
      reason: '已迁移过，跳过',
    }
  }

  try {
    const entities = await legacyDb.entities.toArray()
    const relations = await legacyDb.relations.toArray()

    if (entities.length === 0 && relations.length === 0) {
      localStorage.setItem('worldsmith_idb_migrated', 'true')
      return {
        entitiesMigrated: 0,
        relationsMigrated: 0,
        skipped: true,
        reason: 'IndexedDB 无数据，跳过',
      }
    }

    const entityCount = await storage.importEntities(entities)
    const relationCount = await storage.importRelations(relations)

    await legacyDb.entities.clear()
    await legacyDb.relations.clear()

    localStorage.setItem('worldsmith_idb_migrated', 'true')

    return {
      entitiesMigrated: entityCount,
      relationsMigrated: relationCount,
      skipped: false,
    }
  } catch (e) {
    console.error('[IDB Migration] 迁移失败:', e)
    return {
      entitiesMigrated: 0,
      relationsMigrated: 0,
      skipped: true,
      reason: `迁移失败: ${(e as Error).message}`,
    }
  }
}
