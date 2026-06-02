import Dexie, { type Table } from 'dexie'
import type { Entity } from '../types'
import type { Relation } from '../types'
import type { ProjectFile, ProjectFileContent } from '../types'

export interface ModuleInstance {
  id: string
  active: boolean
  source: 'local' | 'builtin' | 'remote'
}

export class WorldDatabase extends Dexie {
  entities!: Table<Entity, string>
  relations!: Table<Relation, string>
  modules!: Table<ModuleInstance, string>
  files!: Table<ProjectFile, string>
  file_contents!: Table<ProjectFileContent, string>

  constructor() {
    super('WorldSmith')
    this.version(1).stores({
      entities: 'id, type, name, *tags',
      relations: 'id, type, sourceId, targetId, createdAt',
      modules: 'id, active, source',
    })
    this.version(2).stores({
      entities: 'id, type, name, *tags',
      relations: 'id, type, sourceId, targetId, createdAt',
      modules: 'id, active, source',
    })
    this.version(3).stores({
      entities: 'id, type, name, *tags',
      relations: 'id, type, sourceId, targetId, pairId, createdAt',
      modules: 'id, active, source',
      kv_store: 'key',
    })
    this.version(4).stores({
      entities: 'id, type, name, *tags',
      relations: 'id, type, sourceId, targetId, pairId, createdAt',
      modules: 'id, active, source',
      kv_store: 'key',
      files: 'id, path, name, entityId, *tags, createdAt',
      file_contents: 'id',
    })
  }
}

export const db = new WorldDatabase()
