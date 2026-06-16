import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Entity, Relation } from '../types'

export interface TrashItem {
  id: string
  entityType: 'entity' | 'relation'
  data: Entity | Relation
  deletedAt: string
  deletedBy: 'user' | 'agent' | 'import'
  /** 关联关系ID列表（仅实体删除时记录，用于恢复） */
  cascadedRelationIds?: string[]
}

const TRASH_STORAGE_KEY = 'ws_trash'
const MAX_TRASH_ITEMS = 200
const TRASH_EXPIRE_DAYS = 30

export const useTrashStore = defineStore('trash', () => {
  const items = ref<TrashItem[]>([])

  const entityItems = computed(() => items.value.filter(i => i.entityType === 'entity'))
  const relationItems = computed(() => items.value.filter(i => i.entityType === 'relation'))
  const totalCount = computed(() => items.value.length)

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(TRASH_STORAGE_KEY)
      if (raw) items.value = JSON.parse(raw)
    } catch { items.value = [] }
  }

  function saveToStorage() {
    localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify(items.value))
  }

  function add(item: TrashItem) {
    items.value.unshift(item)
    // 超出上限时移除最旧的
    while (items.value.length > MAX_TRASH_ITEMS) items.value.pop()
    // 过期清理
    const expireDate = new Date(Date.now() - TRASH_EXPIRE_DAYS * 24 * 60 * 60 * 1000)
    items.value = items.value.filter(i => new Date(i.deletedAt) > expireDate)
    saveToStorage()
  }

  function restore(id: string): TrashItem | undefined {
    const idx = items.value.findIndex(i => i.id === id)
    if (idx === -1) return undefined
    const item = items.value[idx]
    items.value.splice(idx, 1)
    saveToStorage()
    return item
  }

  function permanentDelete(id: string) {
    items.value = items.value.filter(i => i.id !== id)
    saveToStorage()
  }

  function emptyTrash() {
    items.value = []
    saveToStorage()
  }

  function getItem(id: string): TrashItem | undefined {
    return items.value.find(i => i.id === id)
  }

  loadFromStorage()

  return { items, entityItems, relationItems, totalCount, add, restore, permanentDelete, emptyTrash, getItem }
})
