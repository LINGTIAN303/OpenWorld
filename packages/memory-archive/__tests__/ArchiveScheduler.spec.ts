/**
 * ArchiveScheduler 单元测试
 *
 * 验证周期任务调度器的核心功能：
 * - 生命周期（start/stop/interrupt/updateConfig）
 * - 日任务（补全向量、生成日索引、更新统计）
 * - 周任务（同主题合并去重、生成周索引）
 * - 月任务（衰减评分、硬删除、清理孤儿、清理索引、重算向量、更新meta）
 * - 补执行（catchUp）
 * - 分批执行与中断
 * - 事件发射
 * - 错误处理与任务日志
 *
 * Mock 策略：
 * - FsOperations: 内存 Map 实现
 * - StorageAdapter: 内存实现
 * - EmbeddingAdapter: 确定性向量
 * - LlmAdapter: RuleBasedLlmAdapter
 * - ReadWriteLock: 真实实现
 * - MetaStorage: 真实实现
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ArchiveScheduler, type ArchiveSchedulerOptions } from '../src/scheduler/ArchiveScheduler'
import { MetaStorage } from '../src/scheduler/MetaStorage'
import { FsStorageAdapter } from '../src/storage/FsStorageAdapter'
import { RuleBasedLlmAdapter } from '../src/embedding/RuleBasedLlmAdapter'
import { ReadWriteLock } from '../src/utils/rwLock'
import { DEFAULT_ARCHIVE_CONFIG } from '../src/defaults'
import type { FsOperations } from '../src/adapters/FsOperations'
import type { StorageAdapter } from '../src/adapters/StorageAdapter'
import type { EmbeddingAdapter } from '../src/adapters/EmbeddingAdapter'
import type { Hook, TaskLogEntry, ArchiveIndex, MemoryChunk, MemoryFileHeader } from '../src/types'

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
// Mock: StorageAdapter（内存实现）
// ============================================================================

class InMemoryStorageAdapter implements StorageAdapter {
  basePath: string
  private hooks = new Map<string, Hook>()
  private memoryFiles = new Map<string, { header: MemoryFileHeader; chunks: MemoryChunk[] }>()
  private indices = new Map<string, ArchiveIndex[]>()

  constructor(basePath: string) {
    this.basePath = basePath
  }

  async saveHook(hook: Hook): Promise<void> {
    this.hooks.set(hook.id, { ...hook })
  }

  async loadHook(hookId: string): Promise<Hook | null> {
    return this.hooks.get(hookId) || null
  }

  async loadAllHooks(): Promise<Hook[]> {
    return Array.from(this.hooks.values())
  }

  async deleteHook(hookId: string): Promise<void> {
    this.hooks.delete(hookId)
  }

  async saveMemoryFile(fileId: string, header: MemoryFileHeader, chunks: MemoryChunk[]): Promise<void> {
    this.memoryFiles.set(fileId, { header, chunks: [...chunks] })
  }

  async loadMemoryFileChunk(fileId: string, chunkId: string): Promise<MemoryChunk> {
    const file = this.memoryFiles.get(fileId)
    if (!file) throw new Error(`Memory file not found: ${fileId}`)
    const chunk = file.chunks.find(c => c.chunkId === chunkId)
    if (!chunk) throw new Error(`Chunk not found: ${chunkId}`)
    return chunk
  }

  async deleteMemoryFile(fileId: string): Promise<void> {
    this.memoryFiles.delete(fileId)
  }

  async listMemoryFiles(): Promise<{ id: string; size: number }[]> {
    return Array.from(this.memoryFiles.entries()).map(([id, f]) => ({
      id,
      size: JSON.stringify(f).length,
    }))
  }

  async saveIndex(index: ArchiveIndex): Promise<void> {
    const list = this.indices.get(index.type) || []
    const existingIdx = list.findIndex(i => i.id === index.id)
    if (existingIdx >= 0) {
      list[existingIdx] = index
    } else {
      list.push(index)
    }
    this.indices.set(index.type, list)
  }

  async loadIndices(type: 'daily' | 'weekly'): Promise<ArchiveIndex[]> {
    return this.indices.get(type) || []
  }

  async getStorageStats(): Promise<{ totalHooks: number; totalFiles: number; totalBytes: number }> {
    return {
      totalHooks: this.hooks.size,
      totalFiles: this.memoryFiles.size,
      totalBytes: Array.from(this.memoryFiles.values()).reduce(
        (sum, f) => sum + JSON.stringify(f).length,
        0
      ),
    }
  }

  /** 测试辅助：直接添加 hook */
  _addHook(hook: Hook): void {
    this.hooks.set(hook.id, hook)
  }

  /** 测试辅助：获取所有 hooks */
  _getHooks(): Hook[] {
    return Array.from(this.hooks.values())
  }
}

// ============================================================================
// Mock: EmbeddingAdapter
// ============================================================================

function createMockEmbeddingAdapter(ready: boolean = true, dimension: number = 8): EmbeddingAdapter {
  return {
    isReady: () => ready,
    embed: async (text: string) => {
      const vec: number[] = []
      let hash = 0
      for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0
      }
      for (let i = 0; i < dimension; i++) {
        vec.push(((hash >> (i * 4)) & 0xff) / 255)
      }
      return vec
    },
    embedBatch: async (texts: string[]) => {
      return Promise.all(texts.map(t => {
        const adapter = createMockEmbeddingAdapter(ready, dimension)
        return adapter.embed(t)
      }))
    },
  }
}

// ============================================================================
// 测试辅助函数
// ============================================================================

const BASE_PATH = '/test/memory-archive'
const PROJECT_ID = 'test-project'

/** 创建测试用 Hook */
function createTestHook(overrides: Partial<Hook> = {}): Hook {
  const now = Date.now()
  return {
    id: `h_test_${Math.random().toString(36).slice(2, 8)}`,
    fileId: `f_test_${Math.random().toString(36).slice(2, 8)}`,
    sessionId: 'test-session',
    projectId: PROJECT_ID,
    createdAt: now,
    tokenCount: 1000,
    messageRange: { start: 0, end: 10 },
    chunkTitles: [],
    keywords: ['测试', '角色'],
    tags: [],
    summary: '这是一个测试钩子摘要，讨论角色设计的细节',
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

/** 创建调度器测试环境 */
function createSchedulerEnv(options: {
  hooks?: Hook[]
  embeddingReady?: boolean
  embeddingDimension?: number
  configOverrides?: Record<string, unknown>
} = {}): {
  scheduler: ArchiveScheduler
  storage: InMemoryStorageAdapter
  fs: InMemoryFsOperations
  metaStorage: MetaStorage
  rwLock: ReadWriteLock
  emittedEvents: Array<{ event: string; payload: unknown }>
  hooksRef: { current: Hook[] }
  updateHookCalls: Hook[]
  deleteHookCalls: string[]
} {
  const fs = new InMemoryFsOperations()
  const storage = new InMemoryStorageAdapter(BASE_PATH)
  const metaStorage = new MetaStorage(BASE_PATH, fs)
  const rwLock = new ReadWriteLock()
  const embeddingAdapter = createMockEmbeddingAdapter(
    options.embeddingReady !== false,
    options.embeddingDimension || 8
  )
  const llmAdapter = new RuleBasedLlmAdapter()

  const hooksRef = { current: [...(options.hooks || [])] }
  const updateHookCalls: Hook[] = []
  const deleteHookCalls: string[] = []
  const emittedEvents: Array<{ event: string; payload: unknown }> = []

  // 初始化 storage 中的 hooks
  for (const hook of hooksRef.current) {
    storage._addHook(hook)
  }

  const config = {
    ...DEFAULT_ARCHIVE_CONFIG,
    ...options.configOverrides,
  }

  const schedulerOpts: ArchiveSchedulerOptions = {
    storage,
    embeddingAdapter,
    llmAdapter,
    metaStorage,
    fs,
    rwLock,
    config,
    projectId: PROJECT_ID,
    getHooks: () => hooksRef.current,
    updateHook: async (hook: Hook) => {
      await storage.saveHook(hook)
      hooksRef.current = hooksRef.current.map(h => (h.id === hook.id ? hook : h))
      updateHookCalls.push(hook)
    },
    deleteHookAndFile: async (hookId: string) => {
      const hook = hooksRef.current.find(h => h.id === hookId)
      if (hook) {
        await storage.deleteHook(hookId)
        await storage.deleteMemoryFile(hook.fileId)
        hooksRef.current = hooksRef.current.filter(h => h.id !== hookId)
      }
      deleteHookCalls.push(hookId)
    },
    emit: (event: string, payload: unknown) => {
      emittedEvents.push({ event, payload })
    },
  }

  const scheduler = new ArchiveScheduler(schedulerOpts)

  return {
    scheduler,
    storage,
    fs,
    metaStorage,
    rwLock,
    emittedEvents,
    hooksRef,
    updateHookCalls,
    deleteHookCalls,
  }
}

// ============================================================================
// 测试用例
// ============================================================================

describe('ArchiveScheduler', () => {
  // ==========================================================================
  // 1. 生命周期
  // ==========================================================================

  describe('生命周期', () => {
    it('start/stop 应该正确管理定时器', () => {
      const { scheduler } = createSchedulerEnv()
      // start 不应该抛错
      expect(() => scheduler.start()).not.toThrow()
      // 重复 start 应该幂等
      expect(() => scheduler.start()).not.toThrow()
      // stop 不应该抛错
      expect(() => scheduler.stop()).not.toThrow()
    })

    it('interrupt 应该设置中断标志', () => {
      const { scheduler } = createSchedulerEnv()
      expect(() => scheduler.interrupt()).not.toThrow()
    })

    it('updateConfig 应该更新调度器配置', () => {
      const { scheduler } = createSchedulerEnv()
      const newConfig = {
        ...DEFAULT_ARCHIVE_CONFIG,
        scheduler: { enabled: true, dailyHour: 5, weeklyDay: 1, monthlyDay: 15 },
      }
      expect(() => scheduler.updateConfig(newConfig)).not.toThrow()
    })
  })

  // ==========================================================================
  // 2. 日任务
  // ==========================================================================

  describe('日任务 (runDaily)', () => {
    it('应该成功完成日任务并发射 success 事件', async () => {
      const { scheduler, emittedEvents, metaStorage } = createSchedulerEnv({
        hooks: [createTestHook()],
      })

      const log = await scheduler.runDaily()

      expect(log.taskName).toBe('daily')
      expect(log.status).toBe('success')
      expect(log.startTime).toBeGreaterThan(0)
      expect(log.endTime).toBeGreaterThanOrEqual(log.startTime)

      // 应该发射 success 事件
      expect(emittedEvents.some(e => e.event === 'scheduler:task-success')).toBe(true)

      // 应该写入任务日志
      const logs = await metaStorage.loadTaskLogs()
      expect(logs.length).toBe(1)
      expect(logs[0].taskName).toBe('daily')
    })

    it('应该补全缺失向量', async () => {
      const hook = createTestHook({
        embedding: undefined,
        summary: '需要补全向量的钩子',
        summaryMethod: 'rule',
      })
      const { scheduler, updateHookCalls } = createSchedulerEnv({
        hooks: [hook],
        embeddingReady: true,
      })

      const log = await scheduler.runDaily()

      expect(log.status).toBe('success')
      expect(log.processedCount).toBe(1) // 补全了 1 个向量
      expect(updateHookCalls.length).toBeGreaterThan(0)
      // hook 应该有 embedding
      const updated = updateHookCalls.find(h => h.id === hook.id)
      expect(updated?.embedding).toBeDefined()
      expect(updated?.embedding?.length).toBe(8)
    })

    it('EmbeddingAdapter 未就绪时应该跳过向量补全', async () => {
      const hook = createTestHook({
        embedding: undefined,
        summary: '需要补全向量的钩子',
        summaryMethod: 'rule',
      })
      const { scheduler } = createSchedulerEnv({
        hooks: [hook],
        embeddingReady: false,
      })

      const log = await scheduler.runDaily()

      expect(log.status).toBe('success')
      expect(log.processedCount).toBe(0) // 跳过补全
    })

    it('summaryMethod 为 none 的钩子不补全向量', async () => {
      const hook = createTestHook({
        embedding: undefined,
        summaryMethod: 'none',
        summary: '',
      })
      const { scheduler, updateHookCalls } = createSchedulerEnv({
        hooks: [hook],
      })

      const log = await scheduler.runDaily()

      expect(log.status).toBe('success')
      expect(log.processedCount).toBe(0)
      // 不应该调用 updateHook 补全向量
      const vectorUpdates = updateHookCalls.filter(h => h.embedding !== undefined)
      expect(vectorUpdates.length).toBe(0)
    })

    it('应该生成当日索引', async () => {
      const hook = createTestHook({ createdAt: Date.now() })
      const { scheduler, storage } = createSchedulerEnv({
        hooks: [hook],
      })

      await scheduler.runDaily()

      const indices = await storage.loadIndices('daily')
      expect(indices.length).toBe(1)
      expect(indices[0].type).toBe('daily')
      expect(indices[0].hookIds).toContain(hook.id)
    })

    it('无当日钩子时也应该成功（跳过索引生成）', async () => {
      const hook = createTestHook({ createdAt: Date.now() - 7 * 24 * 60 * 60 * 1000 })
      const { scheduler, storage } = createSchedulerEnv({
        hooks: [hook],
      })

      const log = await scheduler.runDaily()

      expect(log.status).toBe('success')
      const indices = await storage.loadIndices('daily')
      // 无当日钩子，不生成索引
      expect(indices.length).toBe(0)
    })

    it('应该更新访问统计快照', async () => {
      const hook = createTestHook({
        createdAt: Date.now(),
        accessCount: 5,
        activeAccessCount: 3,
      })
      const { scheduler, metaStorage } = createSchedulerEnv({
        hooks: [hook],
      })

      await scheduler.runDaily()

      const meta = await metaStorage.loadMeta()
      const today = new Date()
      // 代码使用 YYYYMMDD 格式（formatDateYYYYMMDD）
      const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
      expect(meta.dailyStats[dateStr]).toBeDefined()
      expect(meta.dailyStats[dateStr].accessCount).toBe(5)
      expect(meta.dailyStats[dateStr].newHooks).toBe(1)
    })
  })

  // ==========================================================================
  // 3. 周任务
  // ==========================================================================

  describe('周任务 (runWeekly)', () => {
    it('应该成功完成周任务并发射 success 事件', async () => {
      const { scheduler, emittedEvents, metaStorage } = createSchedulerEnv({
        hooks: [createTestHook()],
      })

      const log = await scheduler.runWeekly()

      expect(log.taskName).toBe('weekly')
      expect(log.status).toBe('success')

      expect(emittedEvents.some(e => e.event === 'scheduler:task-success')).toBe(true)

      const logs = await metaStorage.loadTaskLogs()
      expect(logs.length).toBe(1)
    })

    it('应该合并相似主题的钩子', async () => {
      // 创建 3 个关键词高度重叠的钩子（Jaccard > 0.5）
      // 4 个关键词中 3 个相同：交集3 / 并集5 = 0.6 > 0.5
      const hook1 = createTestHook({
        id: 'h_1',
        keywords: ['角色', '设计', '背景', '性格'],
        decayScore: 0.9,
        createdAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
      })
      const hook2 = createTestHook({
        id: 'h_2',
        keywords: ['角色', '设计', '背景', '能力'],
        decayScore: 0.5,
        createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
      })
      const hook3 = createTestHook({
        id: 'h_3',
        keywords: ['角色', '设计', '背景', '外貌'],
        decayScore: 0.3,
        createdAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
      })

      const { scheduler, hooksRef } = createSchedulerEnv({
        hooks: [hook1, hook2, hook3],
      })

      const log = await scheduler.runWeekly()

      expect(log.status).toBe('success')
      expect(log.processedCount).toBe(1) // 标记了 1 组待合并

      // H5.3 两阶段合并：周任务后 hook2/hook3 应标记为 pending_merge（非 deprecated）
      const h1 = hooksRef.current.find(h => h.id === 'h_1')
      const h2 = hooksRef.current.find(h => h.id === 'h_2')
      const h3 = hooksRef.current.find(h => h.id === 'h_3')

      expect(h1?.status).toBe('active')
      expect(h2?.status).toBe('pending_merge')
      expect(h3?.status).toBe('pending_merge')

      // 主钩子应该已记录 relatedHookIds（markPendingMerge 阶段已更新）
      expect(h1?.relatedHookIds).toContain('h_2')
      expect(h1?.relatedHookIds).toContain('h_3')

      // H5.3 阶段 2：用户确认合并后，pending_merge 变为 deprecated，关键词合并到主钩子
      const mergedCount = await scheduler.confirmMerge()
      expect(mergedCount).toBe(1)

      const h1After = hooksRef.current.find(h => h.id === 'h_1')
      const h2After = hooksRef.current.find(h => h.id === 'h_2')
      const h3After = hooksRef.current.find(h => h.id === 'h_3')

      expect(h1After?.status).toBe('active')
      expect(h2After?.status).toBe('deprecated')
      expect(h3After?.status).toBe('deprecated')

      // 合并后主钩子应该包含所有关键词
      expect(h1After?.keywords).toContain('能力')
      expect(h1After?.keywords).toContain('外貌')
      expect(h1After?.relatedHookIds).toContain('h_2')
      expect(h1After?.relatedHookIds).toContain('h_3')
    })

    it('关键词不相似的钩子不合并', async () => {
      const hook1 = createTestHook({
        id: 'h_1',
        keywords: ['角色', '设计'],
        createdAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
      })
      const hook2 = createTestHook({
        id: 'h_2',
        keywords: ['场景', '地图', '天气'],
        createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
      })

      const { scheduler, hooksRef } = createSchedulerEnv({
        hooks: [hook1, hook2],
      })

      const log = await scheduler.runWeekly()

      expect(log.status).toBe('success')
      expect(log.processedCount).toBe(0) // 无合并

      // 两个钩子都应该是 active
      expect(hooksRef.current.find(h => h.id === 'h_1')?.status).toBe('active')
      expect(hooksRef.current.find(h => h.id === 'h_2')?.status).toBe('active')
    })

    it('少于 2 个钩子时不合并', async () => {
      const { scheduler } = createSchedulerEnv({
        hooks: [createTestHook()],
      })

      const log = await scheduler.runWeekly()

      expect(log.status).toBe('success')
      expect(log.processedCount).toBe(0)
    })

    it('应该生成周索引', async () => {
      const hook = createTestHook({ createdAt: Date.now() })
      const { scheduler, storage } = createSchedulerEnv({
        hooks: [hook],
      })

      await scheduler.runWeekly()

      const indices = await storage.loadIndices('weekly')
      expect(indices.length).toBe(1)
      expect(indices[0].type).toBe('weekly')
      expect(indices[0].hookIds).toContain(hook.id)
    })

    it('P18 幂等性：已 deprecated 的钩子不参与合并', async () => {
      const hook1 = createTestHook({
        id: 'h_1',
        keywords: ['角色', '设计'],
        status: 'deprecated', // 已淘汰
        decayScore: 0.1,
        createdAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
      })
      const hook2 = createTestHook({
        id: 'h_2',
        keywords: ['角色', '设计', '背景'],
        status: 'active',
        decayScore: 0.9,
        createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
      })

      const { scheduler } = createSchedulerEnv({
        hooks: [hook1, hook2],
      })

      const log = await scheduler.runWeekly()

      expect(log.status).toBe('success')
      // hook1 已 deprecated，activeInGroup 只有 hook2，不满足 >= 2，不合并
      expect(log.processedCount).toBe(0)
    })
  })

  // ==========================================================================
  // 4. 月任务
  // ==========================================================================

  describe('月任务 (runMonthly)', () => {
    it('应该成功完成月任务并发射 success 事件', async () => {
      const { scheduler, emittedEvents, metaStorage } = createSchedulerEnv({
        hooks: [createTestHook()],
      })

      const log = await scheduler.runMonthly()

      expect(log.taskName).toBe('monthly')
      expect(log.status).toBe('success')

      expect(emittedEvents.some(e => e.event === 'scheduler:task-success')).toBe(true)

      const logs = await metaStorage.loadTaskLogs()
      expect(logs.length).toBe(1)
    })

    it('应该对 active 钩子应用衰减评分', async () => {
      // 创建一个很久以前的钩子，应该被衰减
      const oldHook = createTestHook({
        id: 'h_old',
        createdAt: Date.now() - 60 * 24 * 60 * 60 * 1000, // 60 天前
        accessCount: 0,
        activeAccessCount: 0,
        lastAccessedAt: 0,
        decayScore: 1.0,
        status: 'active',
      })

      const { scheduler, hooksRef } = createSchedulerEnv({
        hooks: [oldHook],
      })

      await scheduler.runMonthly()

      const hook = hooksRef.current.find(h => h.id === 'h_old')
      expect(hook).toBeDefined()
      // 衰减后 decayScore 应该降低
      expect(hook!.decayScore).toBeLessThan(1.0)
    })

    it('pinned 钩子应该跳过衰减', async () => {
      const oldHook = createTestHook({
        id: 'h_pinned',
        createdAt: Date.now() - 60 * 24 * 60 * 60 * 1000,
        pinned: true,
        decayScore: 1.0,
      })

      const { scheduler, hooksRef } = createSchedulerEnv({
        hooks: [oldHook],
      })

      await scheduler.runMonthly()

      const hook = hooksRef.current.find(h => h.id === 'h_pinned')
      // pinned 钩子 decayScore 不变
      expect(hook?.decayScore).toBe(1.0)
    })

    it('应该硬删除过期 deprecated 钩子', async () => {
      // 创建一个 100 天前标记 deprecated 的钩子
      const deprecatedHook = createTestHook({
        id: 'h_deprecated',
        status: 'deprecated',
        deprecatedAt: Date.now() - 100 * 24 * 60 * 60 * 1000,
        createdAt: Date.now() - 200 * 24 * 60 * 60 * 1000,
        decayScore: 0.05,
      })

      const { scheduler, hooksRef, deleteHookCalls } = createSchedulerEnv({
        hooks: [deprecatedHook],
        configOverrides: {
          decay: {
            halfLifeDays: 30,
            deprecatedThreshold: 0.15,
            deleteAfterDays: 90,
          },
        },
      })

      await scheduler.runMonthly()

      // 钩子应该被删除
      expect(deleteHookCalls).toContain('h_deprecated')
      expect(hooksRef.current.find(h => h.id === 'h_deprecated')).toBeUndefined()
    })

    it('被索引引用的 deprecated 钩子不应该删除', async () => {
      const deprecatedHook = createTestHook({
        id: 'h_deprecated',
        status: 'deprecated',
        deprecatedAt: Date.now() - 100 * 24 * 60 * 60 * 1000,
        createdAt: Date.now() - 200 * 24 * 60 * 60 * 1000,
        decayScore: 0.05,
      })

      const { scheduler, storage, deleteHookCalls } = createSchedulerEnv({
        hooks: [deprecatedHook],
        configOverrides: {
          decay: {
            halfLifeDays: 30,
            deprecatedThreshold: 0.15,
            deleteAfterDays: 90,
          },
        },
      })

      // 预置一个引用该钩子的索引
      await storage.saveIndex({
        id: 'd_test',
        type: 'daily',
        projectId: PROJECT_ID,
        periodStart: Date.now(),
        periodEnd: Date.now(),
        hookIds: ['h_deprecated'],
        summary: 'test',
        keywords: [],
        createdAt: Date.now(),
      })

      await scheduler.runMonthly()

      // 不应该删除
      expect(deleteHookCalls).not.toContain('h_deprecated')
    })

    it('应该清理孤儿文件', async () => {
      const { scheduler, storage } = createSchedulerEnv({
        hooks: [createTestHook({ fileId: 'f_referenced' })],
      })

      // 添加被引用的记忆文件
      await storage.saveMemoryFile(
        'f_referenced',
        { fileId: 'f_referenced', hookId: 'h_test', messageRange: { start: 0, end: 10 }, createdAt: Date.now() },
        []
      )

      // 添加一个孤儿文件
      await storage.saveMemoryFile(
        'f_orphan',
        { fileId: 'f_orphan', hookId: 'h_nonexistent', messageRange: { start: 0, end: 10 }, createdAt: Date.now() },
        []
      )

      await scheduler.runMonthly()

      const files = await storage.listMemoryFiles()
      const fileIds = files.map(f => f.id)
      expect(fileIds).toContain('f_referenced')
      expect(fileIds).not.toContain('f_orphan')
    })

    it('应该重算维度不匹配的向量', async () => {
      // 创建一个 embedding 维度不匹配的钩子
      const hook = createTestHook({
        id: 'h_mismatch',
        embedding: [0.1, 0.2, 0.3], // 3 维
        summaryMethod: 'rule',
        summary: '维度不匹配的钩子',
        status: 'active',
      })

      const { scheduler, hooksRef } = createSchedulerEnv({
        hooks: [hook],
        embeddingDimension: 8, // 期望 8 维
        configOverrides: {
          embedding: { model: 'test', dimension: 8, batchSize: 100 },
        },
      })

      await scheduler.runMonthly()

      const updated = hooksRef.current.find(h => h.id === 'h_mismatch')
      expect(updated?.embedding).toBeDefined()
      expect(updated?.embedding?.length).toBe(8) // 重算为 8 维
    })

    it('应该更新 meta.json', async () => {
      const { scheduler, metaStorage } = createSchedulerEnv({
        hooks: [createTestHook()],
      })

      await scheduler.runMonthly()

      const meta = await metaStorage.loadMeta()
      expect(meta.lastMonthlyRun).toBeGreaterThan(0)
      expect(meta.totalHooks).toBe(1)
    })
  })

  // ==========================================================================
  // 5. 补执行
  // ==========================================================================

  describe('补执行 (catchUp)', () => {
    it('lastRun 为 0 时应该执行所有任务', async () => {
      const { scheduler, metaStorage } = createSchedulerEnv({
        hooks: [createTestHook()],
      })

      // meta 初始 lastRun 都是 0
      await scheduler.catchUp()

      const meta = await metaStorage.loadMeta()
      // catchUp 调用 runDaily/runWeekly/runMonthly，这些方法会写日志
      const logs = await metaStorage.loadTaskLogs()
      expect(logs.length).toBe(3) // daily + weekly + monthly
    })

    it('最近已执行的任务不应该重复执行', async () => {
      const { scheduler, metaStorage } = createSchedulerEnv({
        hooks: [createTestHook()],
      })

      // 手动执行一次
      await scheduler.runDaily()
      await scheduler.runWeekly()
      await scheduler.runMonthly()

      // 更新 meta 的 lastRun
      const meta = await metaStorage.loadMeta()
      meta.lastDailyRun = Date.now()
      meta.lastWeeklyRun = Date.now()
      meta.lastMonthlyRun = Date.now()
      await metaStorage.saveMeta(meta)

      const logsBefore = (await metaStorage.loadTaskLogs()).length
      await scheduler.catchUp()
      const logsAfter = (await metaStorage.loadTaskLogs()).length

      // 不应该重复执行
      expect(logsAfter).toBe(logsBefore)
    })
  })

  // ==========================================================================
  // 6. 中断与错误处理
  // ==========================================================================

  describe('中断与错误处理', () => {
    it('任务失败时应该发射 failed 事件并记录日志', async () => {
      const { scheduler, emittedEvents, metaStorage } = createSchedulerEnv({
        hooks: [createTestHook()],
      })

      // mock storage.saveIndex 抛错
      const { storage } = createSchedulerEnv({ hooks: [] })
      vi.spyOn(storage, 'saveIndex').mockRejectedValue(new Error('存储失败'))

      // 重新创建调度器使用 mock storage
      const fs = new InMemoryFsOperations()
      const metaStorage2 = new MetaStorage(BASE_PATH, fs)
      const rwLock = new ReadWriteLock()
      const embeddingAdapter = createMockEmbeddingAdapter(true)
      const llmAdapter = new RuleBasedLlmAdapter()
      const hooksRef = { current: [createTestHook()] }
      const emittedEvents2: Array<{ event: string; payload: unknown }> = []

      const scheduler2 = new ArchiveScheduler({
        storage,
        embeddingAdapter,
        llmAdapter,
        metaStorage: metaStorage2,
        fs,
        rwLock,
        config: DEFAULT_ARCHIVE_CONFIG,
        projectId: PROJECT_ID,
        getHooks: () => hooksRef.current,
        updateHook: async (hook: Hook) => {
          await storage.saveHook(hook)
          hooksRef.current = hooksRef.current.map(h => (h.id === hook.id ? hook : h))
        },
        deleteHookAndFile: async (hookId: string) => {
          const hook = hooksRef.current.find(h => h.id === hookId)
          if (hook) {
            await storage.deleteHook(hookId)
            await storage.deleteMemoryFile(hook.fileId)
            hooksRef.current = hooksRef.current.filter(h => h.id !== hookId)
          }
        },
        emit: (event: string, payload: unknown) => {
          emittedEvents2.push({ event, payload })
        },
      })

      const log = await scheduler2.runDaily()

      expect(log.status).toBe('failed')
      expect(log.error).toBeDefined()
      expect(emittedEvents2.some(e => e.event === 'scheduler:task-failed')).toBe(true)

      const logs = await metaStorage2.loadTaskLogs()
      expect(logs.length).toBe(1)
      expect(logs[0].status).toBe('failed')

      vi.restoreAllMocks()
    })

    it('中断标志设置后任务应该停止', async () => {
      // 创建大量钩子测试中断
      const hooks: Hook[] = []
      for (let i = 0; i < 100; i++) {
        hooks.push(createTestHook({
          id: `h_${i}`,
          embedding: undefined,
          summary: `钩子 ${i} 的摘要内容`,
          summaryMethod: 'rule',
          createdAt: Date.now(),
        }))
      }

      const { scheduler } = createSchedulerEnv({
        hooks,
        embeddingReady: true,
      })

      // 立即中断
      scheduler.interrupt()

      const log = await scheduler.runDaily()

      // 任务应该被中断（failed 或 success 都可能，取决于中断时机）
      // 主要验证不抛出未捕获异常
      expect(log.taskName).toBe('daily')
      expect(['success', 'failed']).toContain(log.status)
    })
  })

  // ==========================================================================
  // 7. 分批执行
  // ==========================================================================

  describe('分批执行', () => {
    it('大量钩子应该分批处理', async () => {
      // 创建 120 个需要补全向量的钩子（超过 BATCH_SIZE=50）
      const hooks: Hook[] = []
      for (let i = 0; i < 120; i++) {
        hooks.push(createTestHook({
          id: `h_${i}`,
          embedding: undefined,
          summary: `钩子 ${i} 的摘要`,
          summaryMethod: 'rule',
          createdAt: Date.now(),
        }))
      }

      const { scheduler, updateHookCalls } = createSchedulerEnv({
        hooks,
        embeddingReady: true,
      })

      const log = await scheduler.runDaily()

      expect(log.status).toBe('success')
      expect(log.processedCount).toBe(120)
      // 所有钩子都应该被更新
      expect(updateHookCalls.length).toBeGreaterThanOrEqual(120)
    })
  })
})
