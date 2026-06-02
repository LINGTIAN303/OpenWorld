import { ref } from 'vue'
import type { Entity, Relation } from '../types'

type StoreType = 'entity' | 'relation'
type ActionType = 'add' | 'update' | 'delete'

interface UndoEntry {
  type: StoreType
  action: ActionType
  id: string
  before: any | null
  after: any | null
  description?: string
}

interface UndoGroup {
  entries: UndoEntry[]
  description?: string
  timestamp?: number
}

const undoStack = ref<UndoGroup[]>([])
const redoStack = ref<UndoGroup[]>([])

let transactionDepth = 0
let currentEntries: UndoEntry[] = []
let currentDescription: string | undefined

let _getMaxHistory: (() => number) | null = null

export function setUndoHistoryProvider(fn: () => number): void {
  _getMaxHistory = fn
}

function getMaxHistory(): number {
  if (_getMaxHistory) return _getMaxHistory()
  return 20
}

function record(type: StoreType, action: ActionType, id: string, before: any | null, after: any | null, description?: string) {
  const entry: UndoEntry = { type, action, id, before, after, description }

  if (transactionDepth > 0) {
    currentEntries.push(entry)
  } else {
    undoStack.value.push({ entries: [entry], timestamp: Date.now() })
    const maxHistory = getMaxHistory()
    while (undoStack.value.length > maxHistory) undoStack.value.shift()
  }

  redoStack.value = []
}

export let isUndoing = false

function beginTransaction() {
  if (transactionDepth === 0) {
    currentEntries = []
    currentDescription = undefined
  }
  transactionDepth++
}

function commitTransaction(description?: string) {
  transactionDepth--
  if (transactionDepth === 0 && currentEntries.length > 0) {
    undoStack.value.push({ entries: currentEntries, description: description || currentDescription, timestamp: Date.now() })
    const maxHistory = getMaxHistory()
    while (undoStack.value.length > maxHistory) undoStack.value.shift()
    currentEntries = []
    currentDescription = undefined
  }
}

function rollbackTransaction() {
  transactionDepth--
  if (transactionDepth === 0) {
    currentEntries = []
    currentDescription = undefined
  }
}

async function undo(
  entityStore: { add: (e: Entity) => Promise<unknown>; update: (id: string, data: Partial<Entity>) => Promise<unknown>; remove: (id: string) => Promise<unknown> },
  relationStore: { add: (r: Relation) => Promise<unknown>; update: (id: string, data: Partial<Relation>) => Promise<unknown>; remove: (id: string) => Promise<unknown> }
) {
  const group = undoStack.value.pop()
  if (!group) return false

  redoStack.value.push(group)
  isUndoing = true

  for (let i = group.entries.length - 1; i >= 0; i--) {
    const entry = group.entries[i]
    if (entry.action === 'add') {
      await (entry.type === 'entity' ? entityStore.remove(entry.id) : relationStore.remove(entry.id))
    } else if (entry.action === 'delete' && entry.before) {
      const data = entry.before as any
      data.id = entry.id
      await (entry.type === 'entity' ? entityStore.add(data) : relationStore.add(data))
    } else if (entry.action === 'update' && entry.before) {
      await (entry.type === 'entity' ? entityStore.update(entry.id, entry.before) : relationStore.update(entry.id, entry.before))
    }
  }

  isUndoing = false
  return true
}

async function redo(
  entityStore: { add: (e: Entity) => Promise<unknown>; update: (id: string, data: Partial<Entity>) => Promise<unknown>; remove: (id: string) => Promise<unknown> },
  relationStore: { add: (r: Relation) => Promise<unknown>; update: (id: string, data: Partial<Relation>) => Promise<unknown>; remove: (id: string) => Promise<unknown> }
) {
  const group = redoStack.value.pop()
  if (!group) return false

  undoStack.value.push(group)
  isUndoing = true

  for (const entry of group.entries) {
    if (entry.action === 'add' && entry.after) {
      await (entry.type === 'entity' ? entityStore.add(entry.after as Entity) : relationStore.add(entry.after as Relation))
    } else if (entry.action === 'delete') {
      await (entry.type === 'entity' ? entityStore.remove(entry.id) : relationStore.remove(entry.id))
    } else if (entry.action === 'update' && entry.after) {
      await (entry.type === 'entity' ? entityStore.update(entry.id, entry.after) : relationStore.update(entry.id, entry.after))
    }
  }

  isUndoing = false
  return true
}

function getUndoDescription(group: UndoGroup): string {
  if (group.description) return group.description
  const entries = group.entries
  if (entries.length === 1) {
    const e = entries[0]
    const actionText = e.action === 'add' ? '添加' : e.action === 'delete' ? '删除' : '更新'
    const typeText = e.type === 'entity' ? '实体' : '关系'
    return `${actionText}${typeText}${e.description ? '「' + e.description + '」' : ''}`
  }
  return `${entries.length} 个操作`
}

export function useUndoRedo() {
  return {
    undoStack,
    redoStack,
    record,
    undo,
    redo,
    beginTransaction,
    commitTransaction,
    rollbackTransaction,
    getUndoDescription,
  }
}
