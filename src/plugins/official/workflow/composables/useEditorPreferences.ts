import { reactive, watch } from 'vue'

const STORAGE_KEY = 'worldsmith:editor:prefs:v1'

export type AddMethod = 'click' | 'drag' | 'contextmenu' | 'multi'
export type EditMethod = 'sidebar' | 'inline' | 'hover'

export interface EditorPreferences {
  addMethod: AddMethod
  editMethod: EditMethod
  fallbackTimeoutSec: number
}

const DEFAULTS: EditorPreferences = {
  addMethod: 'click',
  editMethod: 'sidebar',
  fallbackTimeoutSec: 300,
}

function loadFromStorage(): EditorPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<EditorPreferences>
    return { ...DEFAULTS, ...parsed }
  }
  catch {
    return { ...DEFAULTS }
  }
}

function saveToStorage(value: EditorPreferences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  }
  catch {
    /* quota or denied */
  }
}

const state = reactive<EditorPreferences>(loadFromStorage())

let initialized = false
function ensureInitialized() {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  watch(state, (val) => saveToStorage(val), { deep: true })
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return
    try {
      const parsed = JSON.parse(e.newValue) as Partial<EditorPreferences>
      Object.assign(state, DEFAULTS, parsed)
    }
    catch {
      /* ignore malformed payload */
    }
  })
}

export function useEditorPreferences() {
  ensureInitialized()
  return {
    value: state,
    reset() {
      Object.assign(state, DEFAULTS)
    },
  }
}
