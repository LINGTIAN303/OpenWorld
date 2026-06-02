/**
 * CustomFields — 自定义字段管理
 * 用户可以在已有实体类型上添加/编辑/删除自定义字段
 * 定义存储在 localStorage，启动时合并到 schema 中
 */
import type { FieldSchema } from '@worldsmith/entity-core'

const STORAGE_KEY = 'worldsmith_custom_fields'

interface CustomFieldEntry {
  entityType: string
  fields: FieldSchema[]
}

function loadAll(): Map<string, FieldSchema[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Map()
    const entries: CustomFieldEntry[] = JSON.parse(raw)
    return new Map(entries.map(e => [e.entityType, e.fields]))
  } catch {
    return new Map()
  }
}

function saveAll(map: Map<string, FieldSchema[]>) {
  const entries: CustomFieldEntry[] = Array.from(map.entries()).map(
    ([entityType, fields]) => ({ entityType, fields })
  )
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
}

class CustomFieldsService {
  private store = loadAll()

  /** 获取某实体类型的所有自定义字段 */
  getFields(entityType: string): FieldSchema[] {
    return this.store.get(entityType) || []
  }

  /** 合并内置字段和自定义字段（自定义在前，方便查看） */
  mergeFields(entityType: string, builtinFields: FieldSchema[]): FieldSchema[] {
    const custom = this.getFields(entityType)
    return [...custom, ...builtinFields]
  }

  /** 添加一个自定义字段 */
  addField(entityType: string, field: FieldSchema): void {
    const fields = this.store.get(entityType) || []
    if (fields.some(f => f.key === field.key)) {
      console.warn(`[CustomFields] 字段 "${field.key}" 已存在`)
      return
    }
    fields.push(field)
    this.store.set(entityType, fields)
    saveAll(this.store)
  }

  /** 更新一个自定义字段 */
  updateField(entityType: string, key: string, changes: Partial<FieldSchema>): void {
    const fields = this.store.get(entityType)
    if (!fields) return
    const idx = fields.findIndex(f => f.key === key)
    if (idx === -1) return
    fields[idx] = { ...fields[idx], ...changes }
    this.store.set(entityType, fields)
    saveAll(this.store)
  }

  /** 删除一个自定义字段 */
  removeField(entityType: string, key: string): void {
    const fields = this.store.get(entityType)
    if (!fields) return
    this.store.set(entityType, fields.filter(f => f.key !== key))
    saveAll(this.store)
  }

  /** 获取所有有自定义字段的实体类型名称 */
  getTypesWithCustomFields(): string[] {
    return Array.from(this.store.entries())
      .filter(([, fields]) => fields.length > 0)
      .map(([type]) => type)
  }
}

export const customFieldsService = new CustomFieldsService()
