import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick } from 'vue'

const STORAGE_KEY = 'worldsmith:editor:prefs:v1'

describe('useEditorPreferences — P3 v1 schema', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('has sensible v1 defaults when storage is empty', async () => {
    const { useEditorPreferences } = await import('@/plugins/official/workflow/composables/useEditorPreferences')
    const prefs = useEditorPreferences()
    expect(prefs.value.addMethods).toEqual(['click', 'drag'])
    expect(prefs.value.editMethod).toBe('sidebar')
    expect(prefs.value.hoverDelayMs).toBe(300)
  })

  it('persists addMethods / editMethod / hoverDelayMs to localStorage on update', async () => {
    const { useEditorPreferences } = await import('@/plugins/official/workflow/composables/useEditorPreferences')
    const prefs = useEditorPreferences()
    prefs.value.editMethod = 'inline'
    prefs.value.hoverDelayMs = 500
    await nextTick()
    const raw = localStorage.getItem(STORAGE_KEY)
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!)
    expect(parsed.editMethod).toBe('inline')
    expect(parsed.hoverDelayMs).toBe(500)
    expect(parsed.addMethods).toEqual(['click', 'drag'])
  })

  it('loads v1 from localStorage on init', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      addMethods: ['click', 'contextmenu'],
      editMethod: 'hover',
      hoverDelayMs: 400,
    }))
    const { useEditorPreferences } = await import('@/plugins/official/workflow/composables/useEditorPreferences')
    const prefs = useEditorPreferences()
    expect(prefs.value.addMethods).toEqual(['click', 'contextmenu'])
    expect(prefs.value.editMethod).toBe('hover')
    expect(prefs.value.hoverDelayMs).toBe(400)
  })

  it('migrates v0 to v1 on first init when legacy key present', async () => {
    localStorage.setItem('worldsmith:editor:prefs', JSON.stringify({
      addMethod: 'click',
      editMethod: 'sidebar',
      fallbackTimeoutSec: 300,
    }))
    const { useEditorPreferences } = await import('@/plugins/official/workflow/composables/useEditorPreferences')
    const prefs = useEditorPreferences()
    expect(prefs.value.addMethods).toEqual(['click'])
    expect(prefs.value.editMethod).toBe('sidebar')
    // 300s × 1000 → 截断 500
    expect(prefs.value.hoverDelayMs).toBe(500)
    expect(localStorage.getItem('worldsmith:editor:prefs')).toBeNull()
  })

  it('exposes a reset method that returns to defaults', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      addMethods: ['contextmenu'],
      editMethod: 'hover',
      hoverDelayMs: 100,
    }))
    const { useEditorPreferences } = await import('@/plugins/official/workflow/composables/useEditorPreferences')
    const prefs = useEditorPreferences()
    expect(prefs.value.addMethods).toEqual(['contextmenu'])
    prefs.reset()
    await nextTick()
    expect(prefs.value.addMethods).toEqual(['click', 'drag'])
    expect(prefs.value.editMethod).toBe('sidebar')
    expect(prefs.value.hoverDelayMs).toBe(300)
  })

  it('reflects updates from another tab via storage event', async () => {
    const { useEditorPreferences } = await import('@/plugins/official/workflow/composables/useEditorPreferences')
    const prefs = useEditorPreferences()
    expect(prefs.value.editMethod).toBe('sidebar')

    const event = new StorageEvent('storage', {
      key: STORAGE_KEY,
      newValue: JSON.stringify({
        addMethods: ['click'],
        editMethod: 'inline',
        hoverDelayMs: 300,
      }),
    })
    window.dispatchEvent(event)
    await nextTick()
    expect(prefs.value.editMethod).toBe('inline')
    expect(prefs.value.addMethods).toEqual(['click'])
  })

  it('shares state across multiple useEditorPreferences() calls in the same module', async () => {
    const { useEditorPreferences } = await import('@/plugins/official/workflow/composables/useEditorPreferences')
    const a = useEditorPreferences()
    const b = useEditorPreferences()
    a.value.addMethods = ['contextmenu']
    await nextTick()
    expect(b.value.addMethods).toEqual(['contextmenu'])
  })
})

describe('useEditorPreferences — API methods', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('isAddMethodEnabled returns true for methods in the array', async () => {
    const { useEditorPreferences } = await import('@/plugins/official/workflow/composables/useEditorPreferences')
    const prefs = useEditorPreferences()
    expect(prefs.isAddMethodEnabled('click')).toBe(true)
    expect(prefs.isAddMethodEnabled('drag')).toBe(true)
    expect(prefs.isAddMethodEnabled('contextmenu')).toBe(false)
  })

  it('toggleAddMethod adds and removes methods', async () => {
    const { useEditorPreferences } = await import('@/plugins/official/workflow/composables/useEditorPreferences')
    const prefs = useEditorPreferences()
    prefs.toggleAddMethod('contextmenu')
    expect(prefs.value.addMethods).toEqual(['click', 'drag', 'contextmenu'])
    prefs.toggleAddMethod('drag')
    expect(prefs.value.addMethods).toEqual(['click', 'contextmenu'])
  })

  it('setEditMethod updates the edit method', async () => {
    const { useEditorPreferences } = await import('@/plugins/official/workflow/composables/useEditorPreferences')
    const prefs = useEditorPreferences()
    prefs.setEditMethod('hover')
    expect(prefs.value.editMethod).toBe('hover')
    prefs.setEditMethod('inline')
    expect(prefs.value.editMethod).toBe('inline')
  })
})
