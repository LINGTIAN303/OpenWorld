import type { A2UIMessage } from '../bridge-types'
import type { EntityLike, RelationLike, FileLike, FileContentLike } from '../tools/types'
import type { ProviderConfig } from '../providers/config'

export interface IEntityStore {
  entities: EntityLike[] | { value: EntityLike[] }
  add(entity: EntityLike, source?: string): Promise<string>
  update(id: string, changes: Partial<EntityLike>, source?: string): Promise<void>
  remove(id: string, source?: string): Promise<void>
  getById(id: string): Promise<EntityLike | undefined>
  getAllEntities(): Promise<EntityLike[]>
  loadByType(type: string): Promise<void>
  typeCounts: Map<string, number> | { value: Map<string, number> }
}

export interface IRelationStore {
  relations: RelationLike[] | { value: RelationLike[] }
  add(relation: RelationLike, source?: string): Promise<string>
  update(id: string, changes: Partial<RelationLike>): Promise<void>
  remove(id: string, source?: string): Promise<void>
  getAllRelations(): Promise<RelationLike[]>
  loadByEntity(entityId: string): Promise<void>
}

export interface IFileStore {
  files: FileLike[] | { value: FileLike[] }
  add(name: string, path: string, mimeType: string, size: number, content: string, entityId?: string, tags?: string[]): Promise<string>
  getById(id: string): Promise<FileLike | undefined>
  getByPath(path: string): Promise<FileLike | undefined>
  getByEntity(entityId: string): Promise<FileLike[]>
  getContent(id: string): Promise<FileContentLike | undefined>
  update(id: string, changes: Partial<FileLike>): Promise<void>
  remove(id: string): Promise<void>
  associateEntity(fileId: string, entityId: string): Promise<void>
  disassociateEntity(fileId: string): Promise<void>
  getAllFiles(): Promise<FileLike[]>
}

export interface ISettingsStore {
  getProviderConfig(): ProviderConfig
  getSearchConfig?: () => { engine?: string; apiKey?: string }
}

export interface IUIStore {
  confirm(title: string, message: string): Promise<boolean>
}

export interface IToolStores {
  entity: IEntityStore
  relation: IRelationStore
  file: IFileStore
  settings: ISettingsStore
  ui: IUIStore
}

export interface IToolContext {
  stores: IToolStores
  projectInfo: {
    name: string
    entityTypes: string[]
    relationTypes: string[]
  }
  emitA2UI?: (surfaceId: string, message: A2UIMessage) => void
  platform?: import('./capability-types').Platform
  appendBlock?: (block: import('../bridge-types').MessageBlock) => void
}
