import type { Entity } from '../types'
import type { Relation } from '../types'
import type { ProjectFile, ProjectFileContent } from '../types'
import { db } from './database'

export interface StorageBackend {
  getAllEntities(): Promise<Entity[]>
  getEntity(id: string): Promise<Entity | undefined>
  getEntitiesByType(type: string): Promise<Entity[]>
  putEntity(entity: Entity): Promise<void>
  updateEntity(id: string, changes: Partial<Entity>): Promise<void>
  deleteEntity(id: string): Promise<void>
  deleteEntityAtomic(id: string): Promise<{ success: boolean; error?: string }>
  countEntitiesByType(): Promise<Map<string, number>>
  clearEntities(): Promise<void>
  importEntities(entities: Entity[]): Promise<number>

  getAllRelations(): Promise<Relation[]>
  getRelationsByEntity(entityId: string): Promise<Relation[]>
  putRelation(relation: Relation): Promise<void>
  updateRelation(id: string, changes: Partial<Relation>): Promise<void>
  deleteRelation(id: string): Promise<void>
  deleteRelationsByEntity(entityId: string): Promise<number>
  clearRelations(): Promise<void>
  importRelations(relations: Relation[]): Promise<number>

  kvGet(key: string): Promise<string | null>
  kvSet(key: string, value: string): Promise<void>
  kvDelete(key: string): Promise<void>
  kvGetAll(): Promise<[string, string][]>

  getAllFiles(): Promise<ProjectFile[]>
  getFile(id: string): Promise<ProjectFile | undefined>
  getFileByPath(path: string): Promise<ProjectFile | undefined>
  getFilesByEntity(entityId: string): Promise<ProjectFile[]>
  putFile(file: ProjectFile, content: ProjectFileContent): Promise<void>
  updateFile(id: string, changes: Partial<ProjectFile>): Promise<void>
  deleteFile(id: string): Promise<void>
  getFileContent(id: string): Promise<ProjectFileContent | undefined>
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__
}

class TauriStorageBackend implements StorageBackend {
  private async invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke<T>(cmd, args)
  }

  async getAllEntities(): Promise<Entity[]> {
    return this.invoke<Entity[]>('cmd_get_all_entities')
  }

  async getEntity(id: string): Promise<Entity | undefined> {
    return this.invoke<Entity | undefined>('cmd_get_entity', { id })
  }

  async getEntitiesByType(type: string): Promise<Entity[]> {
    return this.invoke<Entity[]>('cmd_get_entities_by_type', { entityType: type })
  }

  async putEntity(entity: Entity): Promise<void> {
    await this.invoke('cmd_put_entity', { entityJson: JSON.stringify(entity) })
  }

  async updateEntity(id: string, changes: Partial<Entity>): Promise<void> {
    await this.invoke('cmd_update_entity', { id, changesJson: JSON.stringify(changes) })
  }

  async deleteEntity(id: string): Promise<void> {
    await this.invoke('cmd_delete_entity', { id })
  }

  async deleteEntityAtomic(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const relations = await this.getRelationsByEntity(id)
      if (relations.length > 0) {
        await this.invoke('cmd_delete_relations_by_entity', { entityId: id })
      }
      await this.invoke('cmd_delete_entity', { id })
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e?.message ?? String(e) }
    }
  }

  async countEntitiesByType(): Promise<Map<string, number>> {
    const pairs = await this.invoke<[string, number][]>('cmd_count_entities_by_type')
    return new Map(pairs)
  }

  async clearEntities(): Promise<void> {
    await this.invoke('cmd_clear_entities')
  }

  async importEntities(entities: Entity[]): Promise<number> {
    return this.invoke<number>('cmd_import_entities', { entitiesJson: JSON.stringify(entities) })
  }

  async getAllRelations(): Promise<Relation[]> {
    return this.invoke<Relation[]>('cmd_get_all_relations')
  }

  async getRelationsByEntity(entityId: string): Promise<Relation[]> {
    return this.invoke<Relation[]>('cmd_get_relations_by_entity', { entityId })
  }

  async putRelation(relation: Relation): Promise<void> {
    await this.invoke('cmd_put_relation', { relationJson: JSON.stringify(relation) })
  }

  async updateRelation(id: string, changes: Partial<Relation>): Promise<void> {
    await this.invoke('cmd_update_relation', { id, changesJson: JSON.stringify(changes) })
  }

  async deleteRelation(id: string): Promise<void> {
    await this.invoke('cmd_delete_relation', { id })
  }

  async deleteRelationsByEntity(entityId: string): Promise<number> {
    return this.invoke<number>('cmd_delete_relations_by_entity', { entityId })
  }

  async clearRelations(): Promise<void> {
    await this.invoke('cmd_clear_relations')
  }

  async importRelations(relations: Relation[]): Promise<number> {
    return this.invoke<number>('cmd_import_relations', { relationsJson: JSON.stringify(relations) })
  }

  async kvGet(key: string): Promise<string | null> {
    return this.invoke<string | null>('cmd_kv_get', { key })
  }

  async kvSet(key: string, value: string): Promise<void> {
    await this.invoke('cmd_kv_set', { key, value })
  }

  async kvDelete(key: string): Promise<void> {
    await this.invoke('cmd_kv_delete', { key })
  }

  async kvGetAll(): Promise<[string, string][]> {
    return this.invoke<[string, string][]>('cmd_kv_get_all')
  }

  async getAllFiles(): Promise<ProjectFile[]> {
    return this.invoke<ProjectFile[]>('cmd_get_all_files')
  }

  async getFile(id: string): Promise<ProjectFile | undefined> {
    return this.invoke<ProjectFile | undefined>('cmd_get_file', { id })
  }

  async getFileByPath(path: string): Promise<ProjectFile | undefined> {
    return this.invoke<ProjectFile | undefined>('cmd_get_file_by_path', { path })
  }

  async getFilesByEntity(entityId: string): Promise<ProjectFile[]> {
    return this.invoke<ProjectFile[]>('cmd_get_files_by_entity', { entityId })
  }

  async putFile(file: ProjectFile, content: ProjectFileContent): Promise<void> {
    await this.invoke('cmd_put_file', { fileJson: JSON.stringify(file), contentJson: JSON.stringify(content) })
  }

  async updateFile(id: string, changes: Partial<ProjectFile>): Promise<void> {
    await this.invoke('cmd_update_file', { id, changesJson: JSON.stringify(changes) })
  }

  async deleteFile(id: string): Promise<void> {
    await this.invoke('cmd_delete_file', { id })
  }

  async getFileContent(id: string): Promise<ProjectFileContent | undefined> {
    return this.invoke<ProjectFileContent | undefined>('cmd_get_file_content', { id })
  }
}

class WebStorageBackend implements StorageBackend {
  async getAllEntities(): Promise<Entity[]> {
    return db.entities.toArray()
  }

  async getEntity(id: string): Promise<Entity | undefined> {
    return db.entities.get(id)
  }

  async getEntitiesByType(type: string): Promise<Entity[]> {
    return db.entities.where('type').equals(type).toArray()
  }

  async putEntity(entity: Entity): Promise<void> {
    await db.entities.put(entity)
  }

  async updateEntity(id: string, changes: Partial<Entity>): Promise<void> {
    await db.entities.update(id, changes)
  }

  async deleteEntity(id: string): Promise<void> {
    await db.entities.delete(id)
  }

  async deleteEntityAtomic(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      await db.transaction('rw', db.entities, db.relations, async () => {
        await db.relations.where('sourceId').equals(id).delete()
        await db.relations.where('targetId').equals(id).delete()
        await db.entities.delete(id)
      })
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e?.message ?? String(e) }
    }
  }

  async countEntitiesByType(): Promise<Map<string, number>> {
    const all = await db.entities.toArray()
    const map = new Map<string, number>()
    for (const e of all) {
      map.set(e.type, (map.get(e.type) || 0) + 1)
    }
    return map
  }

  async clearEntities(): Promise<void> {
    await db.entities.clear()
  }

  async importEntities(entities: Entity[]): Promise<number> {
    await db.entities.bulkPut(entities)
    return entities.length
  }

  async getAllRelations(): Promise<Relation[]> {
    return db.relations.toArray()
  }

  async getRelationsByEntity(entityId: string): Promise<Relation[]> {
    const [sources, targets] = await Promise.all([
      db.relations.where('sourceId').equals(entityId).toArray(),
      db.relations.where('targetId').equals(entityId).toArray(),
    ])
    return [...sources, ...targets]
  }

  async putRelation(relation: Relation): Promise<void> {
    await db.relations.put(relation)
  }

  async updateRelation(id: string, changes: Partial<Relation>): Promise<void> {
    await db.relations.update(id, changes)
  }

  async deleteRelation(id: string): Promise<void> {
    await db.relations.delete(id)
  }

  async deleteRelationsByEntity(entityId: string): Promise<number> {
    const sourceDeleted = await db.relations.where('sourceId').equals(entityId).delete()
    const targetDeleted = await db.relations.where('targetId').equals(entityId).delete()
    return sourceDeleted + targetDeleted
  }

  async clearRelations(): Promise<void> {
    await db.relations.clear()
  }

  async importRelations(relations: Relation[]): Promise<number> {
    await db.relations.bulkPut(relations)
    return relations.length
  }

  async kvGet(key: string): Promise<string | null> {
    const val = await db.table('kv_store').get(key)
    return val ? (val as any).value ?? null : null
  }

  async kvSet(key: string, value: string): Promise<void> {
    await db.table('kv_store').put({ key, value })
  }

  async kvDelete(key: string): Promise<void> {
    await db.table('kv_store').delete(key)
  }

  async kvGetAll(): Promise<[string, string][]> {
    const all = await db.table('kv_store').toArray()
    return all.map((r: any) => [r.key as string, r.value as string])
  }

  async getAllFiles(): Promise<ProjectFile[]> {
    return db.files.toArray()
  }

  async getFile(id: string): Promise<ProjectFile | undefined> {
    return db.files.get(id)
  }

  async getFileByPath(path: string): Promise<ProjectFile | undefined> {
    return db.files.where('path').equals(path).first()
  }

  async getFilesByEntity(entityId: string): Promise<ProjectFile[]> {
    return db.files.where('entityId').equals(entityId).toArray()
  }

  async putFile(file: ProjectFile, content: ProjectFileContent): Promise<void> {
    await db.files.put(file)
    await db.file_contents.put(content)
  }

  async updateFile(id: string, changes: Partial<ProjectFile>): Promise<void> {
    await db.files.update(id, changes)
  }

  async deleteFile(id: string): Promise<void> {
    await db.files.delete(id)
    await db.file_contents.delete(id)
  }

  async getFileContent(id: string): Promise<ProjectFileContent | undefined> {
    return db.file_contents.get(id)
  }
}

let _backend: StorageBackend | null = null

export function getStorageBackend(): StorageBackend {
  if (_backend) return _backend
  _backend = isTauri() ? new TauriStorageBackend() : new WebStorageBackend()
  return _backend
}

export const storage = getStorageBackend()
