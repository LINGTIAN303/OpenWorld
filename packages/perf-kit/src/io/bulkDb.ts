import type { Table } from 'dexie'

/**
 * Dexie 批量操作工具，替代逐条 add/update。
 * 收集操作到缓冲区，调用 flush() 时按批次执行 bulkPut。
 */
export function createBulkOp<T, K>(
  table: Table<T, K>,
  options?: { batchSize?: number }
) {
  const batchSize = options?.batchSize ?? 500
  const pendingItems: T[] = []

  /** 添加一条待写入记录 */
  function put(item: T) {
    pendingItems.push(item)
  }

  /** 刷出所有待写入记录 */
  async function flush(): Promise<void> {
    if (pendingItems.length === 0) return
    const items = pendingItems.splice(0)
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize)
      await table.bulkPut(batch)
    }
  }

  /** 待写入数量 */
  function getPending(): number {
    return pendingItems.length
  }

  return { put, flush, getPending }
}

/**
 * 一次性批量导入，替代逐条 add。
 * 直接使用 bulkPut，按 batchSize 分批。
 */
export async function bulkImport<T, K>(
  table: Table<T, K>,
  items: T[],
  options?: { batchSize?: number }
): Promise<void> {
  const batchSize = options?.batchSize ?? 500
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    await table.bulkPut(batch)
  }
}
