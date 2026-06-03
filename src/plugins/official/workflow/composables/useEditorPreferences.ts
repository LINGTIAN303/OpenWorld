// useEditorPreferences
//
// P3 v1 schema:
//   - addMethods: AddMethod[]      多选(click / drag / contextmenu)
//   - editMethod: EditMethod        三选一(sidebar / inline / hover)
//   - hoverDelayMs: number          仅 editMethod=hover 有效
//
// P1 时期 schema(addMethod 单值 + fallbackTimeoutSec)通过
// `migrateEditorPrefs_v0_to_v1` 一次性迁移到 v1。
// 迁移在 `ensureInit` 第一次访问时触发。

import { reactive, watch } from 'vue'
import { migrateEditorPrefs_v0_to_v1 } from './useLocalStorageMigration'

const STORAGE_KEY = 'worldsmith:editor:prefs:v1'

export type AddMethod = 'click' | 'drag' | 'contextmenu'
export type EditMethod = 'sidebar' | 'inline' | 'hover'

export interface EditorPreferences {
  addMethods: AddMethod[]   // 多选
  editMethod: EditMethod    // 三选一
  hoverDelayMs: number      // 仅 editMethod=hover 有效
}

export const DEFAULT_EDITOR_PREFERENCES: EditorPreferences = {
  addMethods: ['click', 'drag'],
  editMethod: 'sidebar',
  hoverDelayMs: 300,
}

function loadFromStorage(): EditorPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_EDITOR_PREFERENCES, addMethods: [...DEFAULT_EDITOR_PREFERENCES.addMethods] }
    const parsed = JSON.parse(raw) as Partial<EditorPreferences>
    return {
      ...DEFAULT_EDITOR_PREFERENCES,
      ...parsed,
      addMethods: Array.isArray(parsed.addMethods) && parsed.addMethods.length > 0
        ? (parsed.addMethods as AddMethod[])
        : [...DEFAULT_EDITOR_PREFERENCES.addMethods],
    }
  }
  catch {
    return { ...DEFAULT_EDITOR_PREFERENCES, addMethods: [...DEFAULT_EDITOR_PREFERENCES.addMethods] }
  }
}

const state = reactive<EditorPreferences>(loadFromStorage())

let initialized = false
let storageListener: ((e: StorageEvent) => void) | null = null

function ensureInitialized() {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  // 迁移老 P1 schema(纯 localStorage,不依赖 Tauri)
  migrateEditorPrefs_v0_to_v1()
  // 迁移后从 storage 重新读(可能 v0→v1 写了新 key)
  Object.assign(state, loadFromStorage())
  watch(state, (val) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(val)) }
    catch { /* quota or denied */ }
  }, { deep: true })
  storageListener = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return
    try {
      const parsed = JSON.parse(e.newValue) as Partial<EditorPreferences>
      Object.assign(state, DEFAULT_EDITOR_PREFERENCES, parsed, {
        addMethods: Array.isArray(parsed.addMethods) && parsed.addMethods.length > 0
          ? (parsed.addMethods as AddMethod[])
          : [...DEFAULT_EDITOR_PREFERENCES.addMethods],
      })
    }
    catch { /* ignore malformed payload */ }
  }
  window.addEventListener('storage', storageListener)
}

/** 清理 storage listener(测试 / SSR 场景用) */
export function destroyEditorPreferences(): void {
  if (storageListener) {
    window.removeEventListener('storage', storageListener)
    storageListener = null
  }
  initialized = false
}

export function useEditorPreferences() {
  ensureInitialized()
  return {
    value: state,
    reset() {
      Object.assign(state, DEFAULT_EDITOR_PREFERENCES, {
        addMethods: [...DEFAULT_EDITOR_PREFERENCES.addMethods],
      })
    },
    isAddMethodEnabled(method: AddMethod): boolean {
      return state.addMethods.includes(method)
    },
    setEditMethod(method: EditMethod) {
      state.editMethod = method
    },
    toggleAddMethod(method: AddMethod) {
      const i = state.addMethods.indexOf(method)
      if (i >= 0) state.addMethods.splice(i, 1)
      else state.addMethods.push(method)
    },
  }
}
