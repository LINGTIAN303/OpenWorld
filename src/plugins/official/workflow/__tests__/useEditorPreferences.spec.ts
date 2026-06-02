import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick } from 'vue'

const STORAGE_KEY = 'worldsmith:editor:prefs:v1'

describe('useEditorPreferences', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('has sensible defaults when storage is empty', async () => {
    const { useEditorPreferences } = await import('@/plugins/official/workflow/composables/useEditorPreferences')
    const prefs = useEditorPreferences()
    expect(prefs.value.addMethod).toBe('click')
    expect(prefs.value.editMethod).toBe('sidebar')
    expect(prefs.value.fallbackTimeoutSec).toBe(300)
  })

  it('persists to localStorage on update', async () => {
    const { useEditorPreferences } = await import('@/plugins/official/workflow/composables/useEditorPreferences')
    const prefs = useEditorPreferences()
    prefs.value.editMethod = 'inline'
    await nextTick()
    const raw = localStorage.getItem(STORAGE_KEY)
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw!).editMethod).toBe('inline')
  })

  it('loads from localStorage on init', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      addMethod: 'drag',
      editMethod: 'hover',
      fallbackTimeoutSec: 60,
    }))
    const { useEditorPreferences } = await import('@/plugins/official/workflow/composables/useEditorPreferences')
    const prefs = useEditorPreferences()
    expect(prefs.value.addMethod).toBe('drag')
    expect(prefs.value.editMethod).toBe('hover')
    expect(prefs.value.fallbackTimeoutSec).toBe(60)
  })

  it('exposes a reset method that returns to defaults', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ addMethod: 'contextmenu', editMethod: 'hover', fallbackTimeoutSec: 30 }))
    const { useEditorPreferences } = await import('@/plugins/official/workflow/composables/useEditorPreferences')
    const prefs = useEditorPreferences()
    expect(prefs.value.addMethod).toBe('contextmenu')
    prefs.reset()
    await nextTick()
    expect(prefs.value.addMethod).toBe('click')
    expect(prefs.value.editMethod).toBe('sidebar')
  })

  it('reflects updates from another tab via storage event', async () => {
    const { useEditorPreferences } = await import('@/plugins/official/workflow/composables/useEditorPreferences')
    const prefs = useEditorPreferences()
    expect(prefs.value.editMethod).toBe('sidebar')

    const event = new StorageEvent('storage', {
      key: STORAGE_KEY,
      newValue: JSON.stringify({ addMethod: 'click', editMethod: 'inline', fallbackTimeoutSec: 300 }),
    })
    window.dispatchEvent(event)
    await nextTick()
    expect(prefs.value.editMethod).toBe('inline')
  })

  it('shares state across multiple useEditorPreferences() calls in the same module', async () => {
    const { useEditorPreferences } = await import('@/plugins/official/workflow/composables/useEditorPreferences')
    const a = useEditorPreferences()
    const b = useEditorPreferences()
    a.value.addMethod = 'drag'
    await nextTick()
    expect(b.value.addMethod).toBe('drag')
  })
})
