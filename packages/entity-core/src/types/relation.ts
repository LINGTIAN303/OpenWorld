import type { FieldSchema } from './entity'

/** 关系类型的注册表项 */
export interface RelationTypeSchema {
  type: string
  label: string
  sourceTypes: string[]
  targetTypes: string[]
  directed: boolean
  inverseType?: string
  autoCreateInverse?: boolean
  properties?: FieldSchema[]
  pluginId?: string
}

/** 关系实例（两个实体之间的有向边） */
export interface Relation {
  id: string
  type: string
  sourceId: string
  targetId: string
  label?: string
  properties: Record<string, unknown>
  pairId?: string
  createdAt: string
  updatedAt: string
}
