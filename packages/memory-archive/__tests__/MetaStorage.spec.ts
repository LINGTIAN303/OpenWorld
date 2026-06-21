/**
 * MetaStorage 单元测试
 *
 * 验证元数据存储与任务日志基础设施：
 * - meta.json 读写（默认值、正常读取、损坏重建）
 * - rebuildMetaFromHooks（从 hooks 目录重建）
 * - 任务日志追加与加载（按日组织、日期范围过滤）
 * - 清理过期日志（30 天保留策略）
 * - 日期格式化与解析
 *
 * Mock 策略：InMemoryFsOperations（内存 Map 实现）
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { MetaStorage } from '../src/scheduler/MetaStorage'
import type { FsOperations } from '../src/adapters/FsOperations'
import type { Hook, TaskLogEntry } from '../src/types'

// ============================================================================
// Mock: 内存文件系统
// ============================================================================

class InMemoryFsOperations implements FsOperations {
  private files = new Map<string, string>()
  private dirs = new Set<string>()

  async readFile(path: string): Promise<string> {
    if (!this.files.has(path)) {
      throw new Error(`File not found: ${path}`)
    }
    return this.files.get(path)!
  }

  async writeFile(path: string, content: string): Promise<void> {
    const dir = path.substring(0, path.lastIndexOf('/'))
    if (dir) this.dirs.add(dir)
    this.files.set(path, content)
  }

  async mkdir(path: string, _recursive?: boolean): Promise<void> {
    this.dirs.add(path)
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path)
    for (const key of this.files.keys()) {
      if (key.startsWith(path + '/')) {
        this.files.delete(key)
      }
    }
    this.dirs.delete(path)
  }

  async exists(path: string): Promise<boolean> {
    if (this.files.has(path)) return true
    if (this.dirs.has(path)) return true
    for (const key of this.files.keys()) {
      if (key.startsWith(path + '/')) return true
    }
    return false
  }

  async readDir(path: string): Promise<string[]> {
    const entries = new Set<string>()
    for (const key of this.files.keys()) {
      if (key.startsWith(path + '/')) {
        const rest = key.substring(path.length + 1)
        const name = rest.split('/')[0]
        entries.add(name)
      }
    }
    return Array.from(entries)
  }

  clear(): void {
    this.files.clear()
    this.dirs.clear()
  }
}

// ============================================================================
// 测试辅助函数
// ============================================================================

const BASE_PATH = '/test/memory-archive'

/** 创建测试用 Hook */
function createTestHook(overrides: Partial<Hook> = {}): Hook {
  const now = Date.now()
  return {
    id: `h_test_${Math.random().toString(36).slice(2, 8)}`,
    fileId: `f_test_${Math.random().toString(36).slice(2, 8)}`,
    sessionId: 'test-session',
    projectId: 'test-project',
    createdAt: now,
    tokenCount: 1000,
    messageRange: { start: 0, end: 10 },
    chunkTitles: [],
    keywords: ['测试', '角色'],
    tags: [],
    summary: '这是一个测试钩子摘要',
    summaryMethod: 'rule',
    accessCount: 0,
    activeAccessCount: 0,
    lastAccessedAt: 0,
    decayScore: 1.0,
    status: 'active',
    importance: 0.5,
    pinned: false,
    relatedHookIds: [],
    source: 'manual',
    version: '1.0',
    ...overrides,
  }
}

/** 创建测试用 TaskLogEntry */
function createTestLog(
  taskName: 'daily' | 'weekly' | 'monthly',
  startTime: number,
  overrides: Partial<TaskLogEntry> = {}
): TaskLogEntry {
  return {
    taskName,
    startTime,
    endTime: startTime + 1000,
    status: 'success',
    processedCount: 10,
    ...overrides,
  }
}

/** 获取指定天数前的时间戳 */
function daysAgo(days: number): number {
  return Date.now() - days * 24 * 60 * 60 * 1000
}

// ============================================================================
// 测试用例
// ============================================================================

describe('MetaStorage', () => {
  let fs: InMemoryFsOperations
  let storage: MetaStorage

  beforeEach(() => {
    fs = new InMemoryFsOperations()
    storage = new MetaStorage(BASE_PATH, fs)
  })

  // ==========================================================================
  // 1. meta.json 读写
  // ==========================================================================

  describe('meta.json 读写', () => {
    it('meta.json 不存在时返回默认值', async () => {
      const meta = await storage.loadMeta()

      expect(meta.version).toBe('1.0')
      expect(meta.lastDailyRun).toBe(0)
      expect(meta.lastWeeklyRun).toBe(0)
      expect(meta.lastMonthlyRun).toBe(0)
      expect(meta.totalHooks).toBe(0)
      expect(meta.totalFiles).toBe(0)
      expect(meta.totalStorageBytes).toBe(0)
      expect(meta.failedDeletions).toEqual([])
      expect(meta.dailyStats).toEqual({})
    })

    it('应该正确保存和加载 meta.json', async () => {
      const meta = {
        version: '1.0',
        lastDailyRun: 1000,
        lastWeeklyRun: 2000,
        lastMonthlyRun: 3000,
        totalHooks: 42,
        totalFiles: 10,
        totalStorageBytes: 1024000,
        failedDeletions: ['f_failed_1', 'f_failed_2'],
        dailyStats: {
          '2026-06-19': { accessCount: 5, newHooks: 3 },
        },
      }

      await storage.saveMeta(meta)
      const loaded = await storage.loadMeta()

      expect(loaded).toEqual(meta)
    })

    it('meta.json 字段缺失时应该用默认值填充', async () => {
      // 写入一个只有部分字段的 meta.json
      await fs.writeFile(
        `${BASE_PATH}/meta.json`,
        JSON.stringify({ version: '2.0', totalHooks: 5 })
      )

      const loaded = await storage.loadMeta()

      expect(loaded.version).toBe('2.0')
      expect(loaded.totalHooks).toBe(5)
      expect(loaded.lastDailyRun).toBe(0) // 默认值
      expect(loaded.failedDeletions).toEqual([]) // 默认值
      expect(loaded.dailyStats).toEqual({}) // 默认值
    })

    it('meta.json 解析失败时应该从 hooks 重建', async () => {
      // 写入损坏的 meta.json
      await fs.writeFile(`${BASE_PATH}/meta.json`, '{ invalid json }}}')

      // 准备 hooks 目录
      await fs.mkdir(`${BASE_PATH}/hooks`, true)
      const hook1 = createTestHook({ id: 'h_1', fileId: 'f_1' })
      const hook2 = createTestHook({ id: 'h_2', fileId: 'f_2' })
      await fs.writeFile(`${BASE_PATH}/hooks/h_1.json`, JSON.stringify(hook1))
      await fs.writeFile(`${BASE_PATH}/hooks/h_2.json`, JSON.stringify(hook2))

      const meta = await storage.loadMeta()

      // 重建后应该有正确的统计
      expect(meta.totalHooks).toBe(2)
      expect(meta.totalFiles).toBe(2) // 两个不同的 fileId
      expect(meta.lastDailyRun).toBe(0) // 重建时无法恢复
      expect(meta.failedDeletions).toEqual([]) // 重建时清空
    })

    it('保存 meta.json 时应该自动创建目录', async () => {
      // 目录不存在
      expect(await fs.exists(BASE_PATH)).toBe(false)

      await storage.saveMeta({
        version: '1.0',
        lastDailyRun: 0,
        lastWeeklyRun: 0,
        lastMonthlyRun: 0,
        totalHooks: 0,
        totalFiles: 0,
        totalStorageBytes: 0,
        failedDeletions: [],
        dailyStats: {},
      })

      // 目录和文件应该存在
      expect(await fs.exists(BASE_PATH)).toBe(true)
      expect(await fs.exists(`${BASE_PATH}/meta.json`)).toBe(true)
    })
  })

  // ==========================================================================
  // 2. rebuildMetaFromHooks
  // ==========================================================================

  describe('rebuildMetaFromHooks', () => {
    it('hooks 目录不存在时返回空统计', async () => {
      const meta = await storage.rebuildMetaFromHooks()

      expect(meta.totalHooks).toBe(0)
      expect(meta.totalFiles).toBe(0)
      expect(meta.totalStorageBytes).toBe(0)
    })

    it('应该正确统计 hooks 数量和文件数', async () => {
      await fs.mkdir(`${BASE_PATH}/hooks`, true)
      const hook1 = createTestHook({ id: 'h_1', fileId: 'f_1' })
      const hook2 = createTestHook({ id: 'h_2', fileId: 'f_2' })
      const hook3 = createTestHook({ id: 'h_3', fileId: 'f_1' }) // 相同 fileId
      await fs.writeFile(`${BASE_PATH}/hooks/h_1.json`, JSON.stringify(hook1))
      await fs.writeFile(`${BASE_PATH}/hooks/h_2.json`, JSON.stringify(hook2))
      await fs.writeFile(`${BASE_PATH}/hooks/h_3.json`, JSON.stringify(hook3))

      const meta = await storage.rebuildMetaFromHooks()

      expect(meta.totalHooks).toBe(3)
      expect(meta.totalFiles).toBe(2) // f_1 和 f_2
    })

    it('应该计算存储字节数', async () => {
      await fs.mkdir(`${BASE_PATH}/hooks`, true)
      const hook1 = createTestHook({ id: 'h_1', fileId: 'f_1' })
      const content1 = JSON.stringify(hook1)
      await fs.writeFile(`${BASE_PATH}/hooks/h_1.json`, content1)

      const meta = await storage.rebuildMetaFromHooks()

      expect(meta.totalStorageBytes).toBe(content1.length)
    })

    it('应该跳过非 JSON 文件', async () => {
      await fs.mkdir(`${BASE_PATH}/hooks`, true)
      const hook1 = createTestHook({ id: 'h_1', fileId: 'f_1' })
      await fs.writeFile(`${BASE_PATH}/hooks/h_1.json`, JSON.stringify(hook1))
      await fs.writeFile(`${BASE_PATH}/hooks/readme.txt`, 'not a hook')

      const meta = await storage.rebuildMetaFromHooks()

      expect(meta.totalHooks).toBe(1)
    })

    it('重建后应该持久化 meta.json', async () => {
      await fs.mkdir(`${BASE_PATH}/hooks`, true)
      const hook1 = createTestHook({ id: 'h_1', fileId: 'f_1' })
      await fs.writeFile(`${BASE_PATH}/hooks/h_1.json`, JSON.stringify(hook1))

      await storage.rebuildMetaFromHooks()

      // meta.json 应该已写入
      expect(await fs.exists(`${BASE_PATH}/meta.json`)).toBe(true)
      const content = await fs.readFile(`${BASE_PATH}/meta.json`)
      const parsed = JSON.parse(content)
      expect(parsed.totalHooks).toBe(1)
    })
  })

  // ==========================================================================
  // 3. 任务日志
  // ==========================================================================

  describe('任务日志', () => {
    it('appendTaskLog 应该按日组织日志文件', async () => {
      const now = Date.now()
      const log1 = createTestLog('daily', now)
      const log2 = createTestLog('weekly', now)

      await storage.appendTaskLog(log1)
      await storage.appendTaskLog(log2)

      // 应该只有一个日志文件（同一天）
      const files = await fs.readDir(`${BASE_PATH}/logs`)
      expect(files.length).toBe(1)

      // 文件名应该是 YYYY-MM-DD 格式
      const d = new Date(now)
      const expectedName = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`
      expect(files).toContain(expectedName)
    })

    it('appendTaskLog 应该追加到现有日志文件', async () => {
      const now = Date.now()
      const log1 = createTestLog('daily', now, { processedCount: 5 })
      const log2 = createTestLog('weekly', now, { processedCount: 10 })

      await storage.appendTaskLog(log1)
      await storage.appendTaskLog(log2)

      const logs = await storage.loadTaskLogs()
      expect(logs.length).toBe(2)
      expect(logs[0].processedCount).toBe(5)
      expect(logs[1].processedCount).toBe(10)
    })

    it('不同日期的日志应该写入不同文件', async () => {
      const today = Date.now()
      const yesterday = daysAgo(1)

      await storage.appendTaskLog(createTestLog('daily', today))
      await storage.appendTaskLog(createTestLog('weekly', yesterday))

      const files = await fs.readDir(`${BASE_PATH}/logs`)
      expect(files.length).toBe(2)
    })

    it('loadTaskLogs 应该按时间排序', async () => {
      const now = Date.now()
      const log1 = createTestLog('daily', now - 5000)
      const log2 = createTestLog('weekly', now)
      const log3 = createTestLog('monthly', now - 2000)

      await storage.appendTaskLog(log1)
      await storage.appendTaskLog(log2)
      await storage.appendTaskLog(log3)

      const logs = await storage.loadTaskLogs()
      expect(logs.length).toBe(3)
      expect(logs[0].startTime).toBeLessThanOrEqual(logs[1].startTime)
      expect(logs[1].startTime).toBeLessThanOrEqual(logs[2].startTime)
    })

    it('loadTaskLogs 应该支持日期范围过滤', async () => {
      const now = Date.now()
      const old = daysAgo(5)
      const recent = daysAgo(1)

      await storage.appendTaskLog(createTestLog('daily', old))
      await storage.appendTaskLog(createTestLog('weekly', recent))
      await storage.appendTaskLog(createTestLog('monthly', now))

      const filtered = await storage.loadTaskLogs({
        start: daysAgo(2),
        end: now + 1000,
      })

      expect(filtered.length).toBe(2) // recent 和 now
      expect(filtered.every(l => l.startTime >= daysAgo(2))).toBe(true)
    })

    it('loadTaskLogs 日志目录不存在时返回空数组', async () => {
      const logs = await storage.loadTaskLogs()
      expect(logs).toEqual([])
    })

    it('loadTaskLogs 应该跳过解析失败的文件', async () => {
      const now = Date.now()
      await storage.appendTaskLog(createTestLog('daily', now))

      // 写入一个损坏的日志文件
      const d = new Date(now)
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      await fs.writeFile(`${BASE_PATH}/logs/${dateStr}.json`, '{ corrupted')

      const logs = await storage.loadTaskLogs()
      expect(logs).toEqual([]) // 损坏文件被跳过
    })

    it('appendTaskLog 应该自动创建日志目录', async () => {
      expect(await fs.exists(`${BASE_PATH}/logs`)).toBe(false)

      await storage.appendTaskLog(createTestLog('daily', Date.now()))

      expect(await fs.exists(`${BASE_PATH}/logs`)).toBe(true)
    })
  })

  // ==========================================================================
  // 4. 清理过期日志
  // ==========================================================================

  describe('cleanExpiredLogs', () => {
    it('应该删除 30 天前的日志文件', async () => {
      // 写入 35 天前的日志
      const oldDate = daysAgo(35)
      await storage.appendTaskLog(createTestLog('daily', oldDate))

      // 写入 10 天前的日志
      const recentDate = daysAgo(10)
      await storage.appendTaskLog(createTestLog('weekly', recentDate))

      const filesBefore = await fs.readDir(`${BASE_PATH}/logs`)
      expect(filesBefore.length).toBe(2)

      const deletedCount = await storage.cleanExpiredLogs()

      expect(deletedCount).toBe(1)

      const filesAfter = await fs.readDir(`${BASE_PATH}/logs`)
      expect(filesAfter.length).toBe(1)
    })

    it('日志目录不存在时返回 0', async () => {
      const deletedCount = await storage.cleanExpiredLogs()
      expect(deletedCount).toBe(0)
    })

    it('应该跳过非 JSON 文件', async () => {
      await fs.mkdir(`${BASE_PATH}/logs`, true)
      // 写入一个 35 天前的非 JSON 文件
      const oldDate = new Date(daysAgo(35))
      const dateStr = `${oldDate.getFullYear()}-${String(oldDate.getMonth() + 1).padStart(2, '0')}-${String(oldDate.getDate()).padStart(2, '0')}`
      await fs.writeFile(`${BASE_PATH}/logs/${dateStr}.txt`, 'not a log')

      const deletedCount = await storage.cleanExpiredLogs()
      expect(deletedCount).toBe(0)
    })

    it('应该保留刚好 30 天的日志', async () => {
      // 29 天前的日志应该保留
      const date29 = daysAgo(29)
      await storage.appendTaskLog(createTestLog('daily', date29))

      const deletedCount = await storage.cleanExpiredLogs()
      expect(deletedCount).toBe(0)

      const files = await fs.readDir(`${BASE_PATH}/logs`)
      expect(files.length).toBe(1)
    })

    it('文件名格式不正确时应该跳过', async () => {
      await fs.mkdir(`${BASE_PATH}/logs`, true)
      await fs.writeFile(`${BASE_PATH}/logs/invalid-format.json`, '[]')

      const deletedCount = await storage.cleanExpiredLogs()
      expect(deletedCount).toBe(0)
    })
  })

  // ==========================================================================
  // 5. 边界情况
  // ==========================================================================

  describe('边界情况', () => {
    it('空字符串内容的 hook 应该正确处理', async () => {
      await fs.mkdir(`${BASE_PATH}/hooks`, true)
      const hook = createTestHook({
        id: 'h_empty',
        fileId: 'f_empty',
        summary: '',
      })
      await fs.writeFile(`${BASE_PATH}/hooks/h_empty.json`, JSON.stringify(hook))

      const meta = await storage.rebuildMetaFromHooks()

      expect(meta.totalHooks).toBe(1)
      expect(meta.totalStorageBytes).toBeGreaterThan(0)
    })

    it('多次保存 meta.json 应该覆盖旧值', async () => {
      await storage.saveMeta({
        version: '1.0',
        lastDailyRun: 1000,
        lastWeeklyRun: 0,
        lastMonthlyRun: 0,
        totalHooks: 5,
        totalFiles: 0,
        totalStorageBytes: 0,
        failedDeletions: [],
        dailyStats: {},
      })

      await storage.saveMeta({
        version: '1.0',
        lastDailyRun: 2000,
        lastWeeklyRun: 0,
        lastMonthlyRun: 0,
        totalHooks: 10,
        totalFiles: 0,
        totalStorageBytes: 0,
        failedDeletions: [],
        dailyStats: {},
      })

      const loaded = await storage.loadMeta()
      expect(loaded.lastDailyRun).toBe(2000)
      expect(loaded.totalHooks).toBe(10)
    })

    it('calculateStorageBytes 应该计算 hooks 和 files 目录', async () => {
      // 准备 hooks
      await fs.mkdir(`${BASE_PATH}/hooks`, true)
      const hook = createTestHook({ id: 'h_1', fileId: 'f_1' })
      const hookContent = JSON.stringify(hook)
      await fs.writeFile(`${BASE_PATH}/hooks/h_1.json`, hookContent)

      // 准备 files 目录
      await fs.mkdir(`${BASE_PATH}/files/f_1/chunks`, true)
      const chunkContent = '{"chunkId":"c_1","content":"test"}'
      await fs.writeFile(`${BASE_PATH}/files/f_1/chunks/c_1.json`, chunkContent)
      const headerContent = '{"fileId":"f_1"}'
      await fs.writeFile(`${BASE_PATH}/files/f_1/header.json`, headerContent)

      const meta = await storage.rebuildMetaFromHooks()

      // totalStorageBytes 应该包含 hooks + chunks + header
      expect(meta.totalStorageBytes).toBe(hookContent.length + chunkContent.length + headerContent.length)
    })
  })
})
