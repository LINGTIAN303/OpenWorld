import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { storage } from '../core/StorageBackend'
import { useUndoRedo, isUndoing } from '../composables/useUndoRedo'
import { entitySchemaRegistry } from '../core/EntitySchema'
import { getValidationApi, getEventBus } from '../core/serviceProvider'
import type { Entity } from '../types/entity'

export const useEntityStore = defineStore('entity', () => {
  const entities = ref<Entity[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const { record } = useUndoRedo()

  function clearError() { error.value = null }
  function setError(msg: string) { error.value = msg; console.error('[EntityStore]', msg) }

  const entityMap = computed(() => {
    const map = new Map<string, Entity>()
    for (const e of entities.value) map.set(e.id, e)
    return map
  })

  const typeCounts = computed(() => {
    const map = new Map<string, number>()
    for (const e of entities.value) {
      map.set(e.type, (map.get(e.type) || 0) + 1)
    }
    return map
  })

  const allTypeCounts = ref<Map<string, number>>(new Map())

  async function refreshAllTypeCounts() {
    allTypeCounts.value = await storage.countEntitiesByType()
  }

  const types = computed(() => entitySchemaRegistry.getAll())

  function sanitize(raw: (Entity | undefined)[]): Entity[] {
    return raw.filter((e): e is Entity => e != null && typeof e.id === 'string')
  }

  async function loadAll() {
    clearError()
    loading.value = true
    try {
      entities.value = sanitize(await storage.getAllEntities())
      refreshAllTypeCounts()
    } catch (e: any) {
      setError(e?.message ?? '加载实体失败')
    } finally {
      loading.value = false
    }
  }

  async function loadByType(type: string) {
    clearError()
    loading.value = true
    try {
      entities.value = sanitize(await storage.getEntitiesByType(type))
    } catch (e: any) {
      setError(e?.message ?? '加载实体失败')
    } finally {
      loading.value = false
    }
  }

  async function getById(id: string): Promise<Entity | undefined> {
    return entityMap.value.get(id) ?? storage.getEntity(id)
  }

  async function add(entity: Entity, source: 'user' | 'agent' | 'import' = 'user'): Promise<string> {
    clearError()
    const clean = JSON.parse(JSON.stringify(entity))
    clean.createdAt = new Date().toISOString()
    clean.updatedAt = clean.createdAt

    const schema = entitySchemaRegistry.get(entity.type)
    const validation = getValidationApi()
    const report = validation.validateEntity
      ? await validation.validateEntity(
          JSON.stringify(clean),
          schema ? JSON.stringify(schema) : undefined,
        )
      : null
    if (report && !report.valid) {
      const errors = report.errors.filter((e: any) => e.severity === 'error')
      const warnings = report.errors.filter((e: any) => e.severity !== 'error')
      if (errors.length > 0) {
        const msg = errors.map((e: any) => `${e.path}: ${e.message}`).join('; ')
        setError(msg)
        throw new Error(`实体验证失败: ${msg}`)
      }
      if (warnings.length > 0) {
        const msg = warnings.map((e: any) => `${e.path}: ${e.message}`).join('; ')
        console.warn('[EntityStore] 验证警告:', msg)
      }
    }

    await storage.putEntity(clean)
    entities.value.push(clean)
    if (!isUndoing) record('entity', 'add', clean.id, null, { ...clean }, clean.name)
    getEventBus().emit('entity:create', { entityId: clean.id, entityType: clean.type, properties: clean.properties || {}, source })
    refreshAllTypeCounts()
    return clean.id
  }

  async function update(id: string, changes: Partial<Entity>, source: 'user' | 'agent' | 'import' = 'user') {
    clearError()
    const clean = JSON.parse(JSON.stringify(changes))
    clean.updatedAt = new Date().toISOString()

    const old = entities.value.find(e => e.id === id)
    const oldProps = old?.properties ?? {}

    if (!isUndoing && old) {
      const before: Partial<Entity> = {}
      for (const key of Object.keys(changes)) {
        (before as any)[key] = (old as any)[key]
      }
      record('entity', 'update', id, before, changes, old.name)
    }

    await storage.updateEntity(id, clean)
    const idx = entities.value.findIndex((e) => e.id === id)
    if (idx !== -1) {
      entities.value[idx] = { ...entities.value[idx], ...changes }
    }

    const newProps = entities.value[idx]?.properties ?? {}
    const changedFields = Object.keys(clean).filter(k => k !== 'updatedAt')
    getEventBus().emit('entity:update', {
      entityId: id, entityType: old?.type ?? '',
      oldProperties: oldProps, newProperties: newProps,
      changedFields,
      source,
    })

    if (clean.properties) {
      for (const [key, newVal] of Object.entries(clean.properties as Record<string, unknown>)) {
        const oldVal = oldProps[key]
        if (oldVal !== newVal) {
          getEventBus().emit('field:change', {
            entityId: id, entityType: old?.type ?? '',
            field: key, oldValue: oldVal, newValue: newVal,
          })
        }
      }
    }
  }

  async function remove(id: string, source: 'user' | 'agent' | 'import' = 'user') {
    clearError()
    const old = entities.value.find(e => e.id === id)

    try {
      const result = await storage.deleteEntityAtomic(id)
      if (!result.success) {
        setError(result.error ?? '删除实体失败')
        return
      }
    } catch (e: any) {
      setError(e?.message ?? '删除实体失败')
      return
    }

    if (!isUndoing && old) record('entity', 'delete', id, { ...old }, null)
    entities.value = entities.value.filter((e) => e.id !== id)
    if (old) {
      getEventBus().emit('entity:delete', { entityId: id, entityType: old.type, properties: old.properties || {}, source })
    }
    refreshAllTypeCounts()
  }

  async function search(query: string): Promise<Entity[]> {
    const lower = query.toLowerCase()
    const all = await storage.getAllEntities()
    return all.filter(
      (e) =>
        e.name.toLowerCase().includes(lower) ||
        e.description.toLowerCase().includes(lower) ||
        e.tags.some((t) => t.toLowerCase().includes(lower))
    )
  }

  async function getAllEntities(): Promise<Entity[]> {
    return storage.getAllEntities()
  }

  return {
    entities,
    loading,
    error,
    clearError,
    entityMap,
    typeCounts,
    allTypeCounts,
    refreshAllTypeCounts,
    types,
    loadAll,
    loadByType,
    getById,
    getAllEntities,
    add,
    update,
    remove,
    search,
  }
})
