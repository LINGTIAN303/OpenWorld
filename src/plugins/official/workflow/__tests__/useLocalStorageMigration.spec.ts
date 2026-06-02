import { describe, it, expect, beforeEach, afterEach } from 'vitest'

// 测试纯 localStorage 层面的 v0→v1 迁移(不依赖 Tauri)。
// 在 useLocalStorageMigration 模块里,`migrateEditorPrefs_v0_to_v1` 是
// 纯函数,浏览器 dev 模式也会跑(由 useEditorPreferences.ensureInit 触发)。

const LEGACY_KEY = 'worldsmith:editor:prefs'
const V1_KEY = 'worldsmith:editor:prefs:v1'

describe('useLocalStorageMigration — editor prefs v0→v1', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('migrates v0 to v1 (addMethod string → addMethods array, drops fallbackTimeoutSec, caps hoverDelayMs at 500)', async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify({
      addMethod: 'click',
      editMethod: 'sidebar',
      fallbackTimeoutSec: 300,
    }))
    const { migrateEditorPrefs_v0_to_v1 } = await import('@/plugins/official/workflow/composables/useLocalStorageMigration')
    migrateEditorPrefs_v0_to_v1()
    const v1 = localStorage.getItem(V1_KEY)
    expect(v1).toBeTruthy()
    const parsed = JSON.parse(v1!)
    expect(parsed.addMethods).toEqual(['click'])
    expect(parsed.editMethod).toBe('sidebar')
    // fallbackTimeoutSec 300s × 1000 = 300_000ms → 截断到 500ms(plan 文字)
    expect(parsed.hoverDelayMs).toBe(500)
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
  })

  it('converts fallbackTimeoutSec seconds to hoverDelayMs milliseconds (capped at 500)', async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify({
      addMethod: 'drag',
      editMethod: 'hover',
      fallbackTimeoutSec: 60,
    }))
    const { migrateEditorPrefs_v0_to_v1 } = await import('@/plugins/official/workflow/composables/useLocalStorageMigration')
    migrateEditorPrefs_v0_to_v1()
    const parsed = JSON.parse(localStorage.getItem(V1_KEY)!)
    // 60s → 60000ms,但 v1 默认 hoverDelayMs = 300, 计划里 fallbackTimeoutSec*1000 后截断到 500
    // 实际:plan 写的是 Math.min(fallbackTimeoutSec * 1000, 500),所以 60s=60000ms → 截断 500
    expect(parsed.hoverDelayMs).toBe(500)
    expect(parsed.addMethods).toEqual(['drag'])
    expect(parsed.editMethod).toBe('hover')
  })

  it('preserves existing addMethods array if already in array form', async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify({
      addMethods: ['click', 'drag'],
      editMethod: 'sidebar',
    }))
    const { migrateEditorPrefs_v0_to_v1 } = await import('@/plugins/official/workflow/composables/useLocalStorageMigration')
    migrateEditorPrefs_v0_to_v1()
    const parsed = JSON.parse(localStorage.getItem(V1_KEY)!)
    expect(parsed.addMethods).toEqual(['click', 'drag'])
  })

  it('handles missing legacy key (no-op)', async () => {
    const { migrateEditorPrefs_v0_to_v1 } = await import('@/plugins/official/workflow/composables/useLocalStorageMigration')
    migrateEditorPrefs_v0_to_v1()
    expect(localStorage.getItem(V1_KEY)).toBeNull()
  })

  it('handles malformed legacy JSON gracefully', async () => {
    localStorage.setItem(LEGACY_KEY, '{not valid json')
    const { migrateEditorPrefs_v0_to_v1 } = await import('@/plugins/official/workflow/composables/useLocalStorageMigration')
    expect(() => migrateEditorPrefs_v0_to_v1()).not.toThrow()
    expect(localStorage.getItem(V1_KEY)).toBeNull()
  })
})
