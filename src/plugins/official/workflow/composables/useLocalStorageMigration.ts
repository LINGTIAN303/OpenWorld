// useLocalStorageMigration
//
// 一次性迁移老 localStorage 持久化的工作流到后端 Sqlite 库。
// 仅在 `activate()` 阶段调用一次。
//
// 步骤：
//   1. 读 `worldsmith_workflows` 数组
//   2. 逐条调 `workflow_import`（带 format: 'auto'）
//   3. 全部成功后清空 localStorage 键
//
// 失败：保留 localStorage（让用户重启再试一次），不抛。
//
// 另：`migrateEditorPrefs_v0_to_v1` 是 editor 偏好的 v0→v1 schema 迁移，
// 由 `useEditorPreferences.ensureInit` 在浏览器 dev 模式也调用一次。
// 纯 localStorage 操作，不依赖 Tauri。

import { useWorkflowClient } from './useWorkflowClient'
import { isTauri } from '../types'

const STORAGE_KEY = 'worldsmith_workflows'
const LEGACY_PREFS_KEY = 'worldsmith:editor:prefs'
const V1_PREFS_KEY = 'worldsmith:editor:prefs:v1'

/**
 * 把 P1 时期的 editor 偏好 schema(addMethod 单值 + fallbackTimeoutSec)
 * 迁移到 P3 v1 schema(addMethods 数组 + hoverDelayMs)。
 *
 * 纯函数,可在浏览器 dev 模式调用(不需要 Tauri)。
 * 由 `useEditorPreferences.ensureInit` 在第一次访问时触发。
 */
export function migrateEditorPrefs_v0_to_v1(): void {
  if (typeof localStorage === 'undefined') return
  const raw = localStorage.getItem(LEGACY_PREFS_KEY)
  if (!raw) return
  let old: Record<string, unknown>
  try {
    old = JSON.parse(raw) as Record<string, unknown>
  }
  catch {
    // 损坏 — 不抛,留 LEGACY 给后续手动处理
    return
  }
  try {
    const addMethods = Array.isArray(old.addMethods)
      ? (old.addMethods as string[])
      : (typeof old.addMethod === 'string' ? [old.addMethod] : ['click'])
    const editMethod = typeof old.editMethod === 'string'
      ? old.editMethod
      : 'sidebar'
    const hoverDelayMs = typeof old.hoverDelayMs === 'number'
      ? old.hoverDelayMs
      : (typeof old.fallbackTimeoutSec === 'number'
        ? Math.min(old.fallbackTimeoutSec * 1000, 500)
        : 300)
    localStorage.setItem(V1_PREFS_KEY, JSON.stringify({
      addMethods,
      editMethod,
      hoverDelayMs,
    }))
    localStorage.removeItem(LEGACY_PREFS_KEY)
  }
  catch {
    /* quota or denied — 静默 */
  }
}

interface LegacyPersisted {
  id: string
  name: string
  category: string
  description: string
  definition: unknown
  savedAt: number
}

export function useLocalStorageMigration() {
  return {
    /**
     * 返回迁移条数。0 表示无数据或已完成。失败时回 0 但保留 localStorage。
     */
    async migrate(): Promise<number> {
      if (typeof window === 'undefined') return 0
      if (!isTauri()) return 0 // 浏览器 dev 模式不迁移

      let raw: string | null = null
      try {
        raw = window.localStorage.getItem(STORAGE_KEY)
      } catch {
        return 0
      }
      if (!raw) return 0

      let legacy: LegacyPersisted[] = []
      try {
        legacy = JSON.parse(raw) as LegacyPersisted[]
      } catch {
        // 数据损坏 — 清空免得反复阻塞
        window.localStorage.removeItem(STORAGE_KEY)
        return 0
      }
      if (!Array.isArray(legacy) || legacy.length === 0) {
        window.localStorage.removeItem(STORAGE_KEY)
        return 0
      }

      const client = useWorkflowClient()
      let ok = 0
      for (const item of legacy) {
        try {
          if (item.definition && typeof item.definition === 'object') {
            // 已是 WorkflowDefinition 形态：直接调 import，后端接受对象 JSON
            const source = JSON.stringify(item.definition)
            await client.import(source, 'json')
            ok++
          }
        } catch (e) {
          console.warn(`[migration] 跳过 ${item.id}:`, e)
        }
      }

      if (ok > 0) {
        try {
          window.localStorage.removeItem(STORAGE_KEY)
        } catch {
          /* noop */
        }
        console.info(`[migration] 迁移 ${ok}/${legacy.length} 条 workflow 到 Sqlite`)
      }
      return ok
    },
  }
}
