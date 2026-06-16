/**
 * useFsWatcher — 文件系统变更监听
 *
 * 当项目有关联目录时，启动 Tauri 后端文件监听，
 * 接收 `fs:change` 事件并同步到前端 Store。
 *
 * 模块级单例：所有组件共享同一个监听实例。
 */

import { getFileStorageBackend, isTauri } from '@worldsmith/entity-core/core'
import { useEntityStore, useRelationStore } from '@worldsmith/entity-core/stores'

/** 防抖间隔（ms） */
const DEBOUNCE_MS = 1000

/* ─── 模块级状态 ─── */
let _watchId: string | null = null
let _unlisten: (() => void) | null = null
let _debounceTimer: ReturnType<typeof setTimeout> | null = null
let _pendingChanges = new Set<string>()

export function useFsWatcher() {
  /**
   * 启动项目目录监听
   */
  async function startWatching(): Promise<void> {
    if (!isTauri()) return

    const fsb = getFileStorageBackend()
    if (!fsb?.isReady || !fsb.projectDir) return

    // 先停止之前的监听
    await stopWatching()

    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const { listen } = await import('@tauri-apps/api/event')

      // 启动 Rust 端监听
      const id = `project-${Date.now()}`
      _watchId = await invoke('cmd_fs_watch_start', {
        path: fsb.projectDir,
        watchId: id,
      }) as string

      // 监听前端事件
      _unlisten = await listen<{ watchId: string; kind: string; paths: string[] }>(
        'fs:change',
        (event) => {
          if (event.payload.watchId !== _watchId) return
          for (const path of event.payload.paths) {
            _pendingChanges.add(path)
          }
          // 防抖：合并短时间内的多次变更
          if (_debounceTimer) clearTimeout(_debounceTimer)
          _debounceTimer = setTimeout(() => {
            processChanges()
          }, DEBOUNCE_MS)
        },
      )

      console.log(`[FsWatcher] 开始监听: ${fsb.projectDir} (watchId=${_watchId})`)
    } catch (err) {
      console.warn('[FsWatcher] 启动监听失败:', err)
    }
  }

  /**
   * 停止监听
   */
  async function stopWatching(): Promise<void> {
    if (_debounceTimer) {
      clearTimeout(_debounceTimer)
      _debounceTimer = null
    }
    if (_unlisten) {
      _unlisten()
      _unlisten = null
    }
    if (_watchId) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('cmd_fs_watch_stop', { watchId: _watchId })
      } catch {
        // 忽略
      }
      _watchId = null
    }
    _pendingChanges.clear()
  }

  return {
    startWatching,
    stopWatching,
  }
}

/**
 * 处理变更事件：解析受影响的文件，增量更新 Store
 * 如果处于自身写入静默期，跳过 reload 避免闪烁
 */
function processChanges() {
  const changes = new Set(_pendingChanges)
  _pendingChanges.clear()

  if (changes.size === 0) return

  const fsb = getFileStorageBackend()
  if (!fsb?.isReady || !fsb.projectDir) return

  // 自身写入静默期：跳过 reload，避免自身写入触发 UI 闪烁
  if (fsb.isInSelfWriteWindow) {
    console.log(`[FsWatcher] 自身写入静默期，跳过 reload (paths=${changes.size})`)
    return
  }

  const dir = fsb.projectDir.replace(/\\/g, '/')
  let entitiesChanged = false
  let relationsChanged = false
  const entityPaths: string[] = []

  for (const path of changes) {
    const normalizedPath = path.replace(/\\/g, '/')
    // 忽略 .worldsmith 内部文件（元数据变更不触发 UI 刷新）
    if (normalizedPath.includes('/.worldsmith/')) continue
    if (normalizedPath.startsWith(`${dir}/entities/`)) {
      entitiesChanged = true
      entityPaths.push(path)
    } else if (normalizedPath.startsWith(`${dir}/relations/`)) {
      relationsChanged = true
    }
  }

  console.log(`[FsWatcher] 处理变更: entities=${entitiesChanged}, relations=${relationsChanged}, paths=${changes.size}`)

  // 增量更新受影响的 Store
  if (entitiesChanged) {
    const entityStore = useEntityStore()
    fsb.reloadPaths(entityPaths).then(() => {
      return entityStore.loadAll()
    }).then(() => {
      console.log('[FsWatcher] 实体已同步')
    }).catch(err => {
      console.warn('[FsWatcher] 实体同步失败:', err)
    })
  }

  if (relationsChanged) {
    const relationStore = useRelationStore()
    relationStore.loadAll().then(() => {
      console.log('[FsWatcher] 关系已同步')
    }).catch(err => {
      console.warn('[FsWatcher] 关系同步失败:', err)
    })
  }
}
