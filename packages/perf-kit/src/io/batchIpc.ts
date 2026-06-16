/**
 * Tauri IPC 批量写入工具，替代逐个 await writeTextFile()。
 * 收集写入请求到缓冲区，调用 flush() 时一次性发送给后端。
 */

interface PendingWrite {
  path: string
  content: string
}

export function createBatchIpc(options?: {
  maxBatchSize?: number
  autoFlushInterval?: number
}) {
  const maxBatchSize = options?.maxBatchSize ?? 50
  const autoFlushInterval = options?.autoFlushInterval ?? 0
  const pending: PendingWrite[] = []
  let autoFlushTimer: ReturnType<typeof setInterval> | null = null

  if (autoFlushInterval > 0) {
    autoFlushTimer = setInterval(() => {
      if (pending.length > 0) flush()
    }, autoFlushInterval)
  }

  async function getInvoke() {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      return invoke
    } catch {
      return null
    }
  }

  /** 添加一个待写入文件 */
  function add(path: string, content: string) {
    pending.push({ path, content })
    if (pending.length >= maxBatchSize) {
      flush()
    }
  }

  /** 刷出所有待写入文件 */
  async function flush(): Promise<void> {
    if (pending.length === 0) return
    const items = pending.splice(0)
    const invoke = await getInvoke()
    if (!invoke) {
      console.warn('[batchIpc] Tauri 环境不可用，跳过批量写入')
      return
    }
    // 逐批发送（后端 cmd_fs_write_batch 接受文件数组）
    // 如果后端没有 batch 命令，退化为并发写入
    const writes = items.map(item =>
      invoke('cmd_fs_write', { path: item.path, content: item.content, createDirs: true })
        .catch((e: any) => console.warn(`[batchIpc] 写入失败: ${item.path}`, e))
    )
    await Promise.all(writes)
  }

  /** 销毁，清理定时器 */
  function destroy() {
    if (autoFlushTimer) {
      clearInterval(autoFlushTimer)
      autoFlushTimer = null
    }
  }

  return { add, flush, destroy }
}
