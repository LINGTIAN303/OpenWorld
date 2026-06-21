/**
 * ArchiveScheduler - 周期任务调度器（P1/P15/P17/P18 决策）
 *
 * P1 决策：天/周/月三个 Task 合并为 ArchiveScheduler 的方法
 * P15 决策：职责划分
 *   - 日任务：补全缺失向量 + 生成日索引 + 更新访问统计快照
 *   - 周任务：同主题合并去重 + 生成周索引
 *   - 月任务：衰减评分 + 硬删除 + 清理孤儿文件 + 清理过期索引 + 重算向量
 * P17 决策：读写锁 + 分批执行 + 可中断
 * P18 决策：任务日志 + 失败队列 + meta.json 重建 + 幂等性
 *
 * 调度策略：
 * - setInterval 每小时检查一次
 * - 根据 meta.json 的 lastRun 时间戳判断是否需要执行
 * - 补执行：超过 3 次只执行最近 1 次（P18）
 */

import type { EmbeddingAdapter } from '../adapters/EmbeddingAdapter'
import type { FsOperations } from '../adapters/FsOperations'
import type { LlmAdapter } from '../adapters/LlmAdapter'
import type { StorageAdapter } from '../adapters/StorageAdapter'
import type {
  ArchiveConfig,
  ArchiveEventName,
  ArchiveIndex,
  Hook,
  TaskLogEntry,
} from '../types'
import { calculateDecayScore, shouldDeprecate, shouldHardDelete } from '../utils/decay'
import type { ReadWriteLock } from '../utils/rwLock'
import type { MetaStorage } from './MetaStorage'

/** 每小时检查一次 */
const CHECK_INTERVAL_MS = 60 * 60 * 1000
/** 分批大小（P17 决策：每批 50 个） */
const BATCH_SIZE = 50
/** 批间释放锁时间（P17 决策：100ms） */
const BATCH_PAUSE_MS = 100
/** 补执行阈值（P18 决策：超过 3 次只执行最近 1 次） */
const CATCH_UP_THRESHOLD = 3
/** 日索引保留天数 */
const DAILY_INDEX_RETENTION_DAYS = 90
/** 周索引保留周数 */
const WEEKLY_INDEX_RETENTION_WEEKS = 12

export interface ArchiveSchedulerOptions {
  storage: StorageAdapter
  embeddingAdapter: EmbeddingAdapter
  llmAdapter: LlmAdapter
  metaStorage: MetaStorage
  fs: FsOperations
  rwLock: ReadWriteLock
  config: ArchiveConfig
  projectId: string
  /** 读取 hooksCache 快照 */
  getHooks: () => Hook[]
  /** 保存钩子并更新缓存 */
  updateHook: (hook: Hook) => Promise<void>
  /**
   * 删除钩子及其记忆文件
   *
   * H5.2 修改：permanent 参数控制软删除/硬删除。
   * - permanent=false（默认）：软删除，移入回收站
   * - permanent=true：永久删除，跳过回收站（用于 orphan 钩子清理）
   */
  deleteHookAndFile: (hookId: string, permanent?: boolean) => Promise<void>
  /** 事件发射器 */
  emit: (event: ArchiveEventName, payload: unknown) => void
}

export class ArchiveScheduler {
  private opts: ArchiveSchedulerOptions
  private timer: ReturnType<typeof setInterval> | null = null
  private interruptFlag: boolean = false
  private running: boolean = false

  /**
   * H7.4：月任务专用的全量钩子缓存
   *
   * 月任务开始时从磁盘加载所有钩子（包括被 LRU 淘汰的），
   * 月任务结束后清空。避免月任务遗漏被 LRU 淘汰的钩子，
   * 特别是 cleanOrphanFiles 会误删被淘汰钩子的记忆文件。
   */
  private monthlyAllHooks: Hook[] | null = null

  constructor(options: ArchiveSchedulerOptions) {
    this.opts = options
  }

  // ===== 生命周期 =====

  /**
   * 启动调度器
   *
   * 设置 setInterval 每小时检查一次，并立即执行一次补执行检查。
   */
  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      this.checkAndRun().catch(err => {
        console.error('[ArchiveScheduler] checkAndRun failed:', err)
      })
    }, CHECK_INTERVAL_MS)
    // 启动时补执行
    this.checkAndRun().catch(err => {
      console.error('[ArchiveScheduler] 启动补执行失败:', err)
    })
  }

  /**
   * 停止调度器
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /**
   * 中断当前运行的任务（P17 可中断）
   *
   * 设置 interruptFlag，当前批完成后任务停止。
   */
  interrupt(): void {
    this.interruptFlag = true
  }

  /**
   * P4 新增：更新配置
   *
   * 当宿主通过 ArchiveManager.updateConfig 修改配置时同步到调度器。
   * 影响 scheduler（dailyHour/weeklyDay/monthlyDay）和 decay 参数。
   */
  updateConfig(config: ArchiveConfig): void {
    this.opts.config = config
  }

  // ===== 日任务（P15 调整后） =====

  /**
   * 日任务：补全缺失向量 + 生成日索引 + 更新访问统计快照
   */
  async runDaily(): Promise<TaskLogEntry> {
    const startTime = Date.now()
    const taskName = 'daily'
    console.log('[ArchiveScheduler] 日任务开始')

    try {
      // Step 1: 补全缺失向量（shared 锁）
      const vectorCount = await this.runStep('daily-step1-vectors', async () => {
        return this.opts.rwLock.readLock(() => this.completeMissingVectors())
      })

      // Step 2: 生成当日索引（exclusive 锁）
      await this.runStep('daily-step2-index', async () => {
        await this.opts.rwLock.writeLock(() => this.generateDailyIndex())
      })

      // Step 3: 更新访问统计快照
      await this.runStep('daily-step3-stats', async () => {
        await this.updateDailyStats()
      })

      const log: TaskLogEntry = {
        taskName,
        startTime,
        endTime: Date.now(),
        status: 'success',
        processedCount: vectorCount,
      }
      await this.opts.metaStorage.appendTaskLog(log)
      this.opts.emit('scheduler:task-success', log)
      console.log('[ArchiveScheduler] 日任务完成:', log)
      return log
    } catch (err) {
      const log: TaskLogEntry = {
        taskName,
        startTime,
        endTime: Date.now(),
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      }
      await this.opts.metaStorage.appendTaskLog(log)
      this.opts.emit('scheduler:task-failed', log)
      console.error('[ArchiveScheduler] 日任务失败:', err)
      return log
    }
  }

  // ===== 周任务（P15 调整后） =====

  /**
   * 周任务：H5.3 两阶段合并 - 阶段 1（标记待合并）+ 生成周索引
   *
   * 注意：周任务只标记 `pending_merge`，不执行实际合并。
   * 用户需在 ArchivePanel 确认后调用 `confirmMerge()` 执行阶段 2。
   */
  async runWeekly(): Promise<TaskLogEntry> {
    const startTime = Date.now()
    const taskName = 'weekly'
    console.log('[ArchiveScheduler] 周任务开始')

    try {
      let markedCount = 0

      // H5.3 Step 1: 标记同主题钩子为 pending_merge（exclusive 锁，分批执行）
      await this.runStep('weekly-step1-mark', async () => {
        markedCount = await this.opts.rwLock.writeLock(() => this.markPendingMerge())
      })

      // H5.3 有待合并组时发射事件，通知 UI 显示确认界面
      if (markedCount > 0) {
        this.opts.emit('scheduler:merge-pending', { count: markedCount })
      }

      // Step 2: 生成周索引（exclusive 锁）
      await this.runStep('weekly-step2-index', async () => {
        await this.opts.rwLock.writeLock(() => this.generateWeeklyIndex())
      })

      const log: TaskLogEntry = {
        taskName,
        startTime,
        endTime: Date.now(),
        status: 'success',
        processedCount: markedCount,
      }
      await this.opts.metaStorage.appendTaskLog(log)
      this.opts.emit('scheduler:task-success', log)
      console.log('[ArchiveScheduler] 周任务完成:', log)
      return log
    } catch (err) {
      const log: TaskLogEntry = {
        taskName,
        startTime,
        endTime: Date.now(),
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      }
      await this.opts.metaStorage.appendTaskLog(log)
      this.opts.emit('scheduler:task-failed', log)
      console.error('[ArchiveScheduler] 周任务失败:', err)
      return log
    }
  }

  // ===== 月任务（P15 调整后） =====

  /**
   * 月任务：衰减评分 + 硬删除 + 清理孤儿文件 + 清理过期索引 + 重算向量 + 更新meta
   */
  async runMonthly(): Promise<TaskLogEntry> {
    const startTime = Date.now()
    const taskName = 'monthly'
    console.log('[ArchiveScheduler] 月任务开始')

    // H7.4：月任务开始时从磁盘加载所有钩子（包括被 LRU 淘汰的）
    // 避免月任务遗漏被淘汰的钩子，特别是 cleanOrphanFiles 会误删被淘汰钩子的记忆文件
    try {
      this.monthlyAllHooks = await this.opts.storage.loadAllHooks()
      console.log(`[ArchiveScheduler] 月任务加载全量钩子: ${this.monthlyAllHooks.length} 个`)
    } catch (err) {
      console.warn('[ArchiveScheduler] 月任务加载全量钩子失败，降级使用缓存:', err)
      this.monthlyAllHooks = null
    }

    try {
      let decayedCount = 0
      let deletedCount = 0
      let rebuiltCount = 0

      // Step 1: 衰减评分（exclusive 锁，分批执行）
      await this.runStep('monthly-step1-decay', async () => {
        decayedCount = await this.opts.rwLock.writeLock(() => this.applyDecayScores())
      })

      // Step 2: 硬删除过期 deprecated 钩子
      await this.runStep('monthly-step2-delete', async () => {
        deletedCount = await this.opts.rwLock.writeLock(() => this.hardDeleteExpiredHooks())
      })

      // Step 2.5: H6.3 清理 orphan 钩子（事务失败遗留）
      await this.runStep('monthly-step2.5-orphan-hooks', async () => {
        const orphanDeleted = await this.opts.rwLock.writeLock(() => this.cleanOrphanHooks())
        deletedCount += orphanDeleted
      })

      // Step 3: 清理未引用的记忆文件
      await this.runStep('monthly-step3-orphan', async () => {
        await this.opts.rwLock.writeLock(() => this.cleanOrphanFiles())
      })

      // Step 4: 清理过期索引
      await this.runStep('monthly-step4-index', async () => {
        await this.cleanExpiredIndices()
      })

      // Step 5: 重算向量防漂移（P15 从周任务移入）
      await this.runStep('monthly-step5-rebuild', async () => {
        rebuiltCount = await this.opts.rwLock.writeLock(() => this.rebuildVectorsIfNeeded())
      })

      // Step 5.5: H5.2 清理过期回收站
      await this.runStep('monthly-step5.5-trash', async () => {
        const trashResult = await this.cleanExpiredTrash()
        deletedCount += trashResult
      })

      // Step 6: 更新 meta.json
      await this.runStep('monthly-step6-meta', async () => {
        await this.updateMonthlyMeta()
      })

      const log: TaskLogEntry = {
        taskName,
        startTime,
        endTime: Date.now(),
        status: 'success',
        processedCount: decayedCount + deletedCount + rebuiltCount,
      }
      await this.opts.metaStorage.appendTaskLog(log)
      this.opts.emit('scheduler:task-success', log)
      console.log('[ArchiveScheduler] 月任务完成:', log)
      return log
    } catch (err) {
      const log: TaskLogEntry = {
        taskName,
        startTime,
        endTime: Date.now(),
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      }
      await this.opts.metaStorage.appendTaskLog(log)
      this.opts.emit('scheduler:task-failed', log)
      console.error('[ArchiveScheduler] 月任务失败:', err)
      return log
    } finally {
      // H7.4：月任务结束后清空全量钩子缓存，释放内存
      this.monthlyAllHooks = null
    }
  }

  // ===== 补执行（P18 决策） =====

  /**
   * H7.4：获取月任务专用的全量钩子
   *
   * 月任务开始时从磁盘加载所有钩子（包括被 LRU 淘汰的）到 monthlyAllHooks，
   * 月任务中的方法通过此方法获取钩子，确保不遗漏被淘汰的钩子。
   * 非月任务期间（monthlyAllHooks 为 null）降级使用 getHooks()。
   */
  private getHooksForMonthlyTask(): Hook[] {
    return this.monthlyAllHooks ?? this.opts.getHooks()
  }

  /**
   * 补执行检查
   *
   * P18 决策：超过 3 次则只执行最近 1 次
   */
  async catchUp(): Promise<void> {
    const now = Date.now()
    const meta = await this.opts.metaStorage.loadMeta()

    // 日任务补执行
    const dailyMissed = this.countMissedDaily(meta.lastDailyRun, now)
    if (dailyMissed > 0) {
      console.log(`[ArchiveScheduler] 日任务补执行（错过 ${dailyMissed} 次）`)
      if (dailyMissed <= CATCH_UP_THRESHOLD) {
        await this.runDaily()
      } else {
        // P18：超过 3 次只执行最近 1 次
        console.log('[ArchiveScheduler] 错过次数过多，只执行最近 1 次')
        await this.runDaily()
      }
    }

    // 周任务补执行
    const weeklyMissed = this.countMissedWeekly(meta.lastWeeklyRun, now)
    if (weeklyMissed > 0) {
      console.log(`[ArchiveScheduler] 周任务补执行（错过 ${weeklyMissed} 次）`)
      await this.runWeekly()
    }

    // 月任务补执行
    const monthlyMissed = this.countMissedMonthly(meta.lastMonthlyRun, now)
    if (monthlyMissed > 0) {
      console.log(`[ArchiveScheduler] 月任务补执行（错过 ${monthlyMissed} 次）`)
      await this.runMonthly()
    }
  }

  // ===== 内部：日任务步骤 =====

  /**
   * Step 1: 补全缺失向量（分批执行）
   *
   * @returns 补全的向量数
   */
  private async completeMissingVectors(): Promise<number> {
    const hooks = this.opts.getHooks()
    const needVector = hooks.filter(
      h => h.embedding == null && h.summaryMethod !== 'none' && h.summary.length > 0
    )

    if (needVector.length === 0) return 0
    if (!this.opts.embeddingAdapter.isReady()) {
      console.warn('[ArchiveScheduler] EmbeddingAdapter 未就绪，跳过向量补全')
      return 0
    }

    let count = 0
    await this.runBatched(needVector, async batch => {
      for (const hook of batch) {
        if (this.interruptFlag) return
        try {
          hook.embedding = await this.opts.embeddingAdapter.embed(hook.summary)
          await this.opts.updateHook(hook)
          count++
        } catch (err) {
          console.warn(`[ArchiveScheduler] 补全向量失败 hook=${hook.id}:`, err)
        }
      }
    })
    return count
  }

  /**
   * Step 2: 生成当日索引
   */
  private async generateDailyIndex(): Promise<void> {
    const now = Date.now()
    const hooks = this.opts.getHooks()
    const todayHooks = hooks.filter(h => isSameDay(h.createdAt, now))

    if (todayHooks.length === 0) {
      console.log('[ArchiveScheduler] 无当日钩子，跳过日索引生成')
      return
    }

    const dateStr = formatDateYYYYMMDD(now)
    const indexId = `d_${dateStr}`

    // 聚合关键词
    const keywords = aggregateKeywords(todayHooks)

    // 生成摘要
    let summary: string
    try {
      if (this.opts.llmAdapter.isReady()) {
        const messages = todayHooks.map(h => ({
          role: 'assistant',
          content: h.summary,
        }))
        summary = await this.opts.llmAdapter.summarize(messages, 2000)
      } else {
        summary = `当日归档 ${todayHooks.length} 个钩子，关键词：${keywords.slice(0, 10).join('、')}`
      }
    } catch (err) {
      console.warn('[ArchiveScheduler] 日索引摘要生成失败，降级规则提取:', err)
      summary = `当日归档 ${todayHooks.length} 个钩子，关键词：${keywords.slice(0, 10).join('、')}`
    }

    // 生成向量
    let embedding: number[] | undefined
    if (this.opts.embeddingAdapter.isReady()) {
      try {
        embedding = await this.opts.embeddingAdapter.embed(summary)
      } catch (err) {
        console.warn('[ArchiveScheduler] 日索引向量生成失败:', err)
      }
    }

    const index: ArchiveIndex = {
      id: indexId,
      type: 'daily',
      projectId: this.opts.projectId,
      periodStart: getDayStart(now),
      periodEnd: getDayEnd(now),
      hookIds: todayHooks.map(h => h.id),
      summary,
      keywords,
      embedding,
      createdAt: now,
    }

    await this.opts.storage.saveIndex(index)

    // P18：钩子补全后立即设置 dailyIndexId
    for (const hook of todayHooks) {
      if (hook.dailyIndexId !== indexId) {
        hook.dailyIndexId = indexId
        await this.opts.updateHook(hook)
      }
    }

    console.log(`[ArchiveScheduler] 日索引已生成: ${indexId} (${todayHooks.length} hooks)`)
  }

  /**
   * Step 3: 更新访问统计快照
   */
  private async updateDailyStats(): Promise<void> {
    const now = Date.now()
    const meta = await this.opts.metaStorage.loadMeta()
    const dateStr = formatDateYYYYMMDD(now)

    const hooks = this.opts.getHooks()
    const todayHooks = hooks.filter(h => isSameDay(h.createdAt, now))

    meta.dailyStats[dateStr] = {
      accessCount: hooks.reduce((sum, h) => sum + h.accessCount, 0),
      newHooks: todayHooks.length,
    }

    await this.opts.metaStorage.saveMeta(meta)
  }

  // ===== 内部：周任务步骤 =====

  /**
   * H5.3 两阶段合并 - 阶段 1：标记待合并钩子
   *
   * 聚类后只标记非主钩子为 `pending_merge`，不执行实际合并。
   * 用户在 UI 确认后调用 `confirmMerge()` 执行阶段 2。
   *
   * @returns 标记的待合并组数
   */
  private async markPendingMerge(): Promise<number> {
    const now = Date.now()
    const hooks = this.opts.getHooks()
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000

    // 取最近 7 天的 active 钩子（排除已 pending_merge 的）
    const recentHooks = hooks.filter(
      h => h.createdAt >= sevenDaysAgo && h.status === 'active' && h.keywords.length > 0
    )

    if (recentHooks.length < 2) return 0

    // 按关键词 Jaccard 相似度聚类
    const groups = this.clusterBySimilarity(recentHooks)
    if (groups.length === 0) return 0

    let markedCount = 0
    for (const group of groups) {
      if (this.interruptFlag) break

      // P18 幂等性：跳过已 deprecated 的钩子
      const activeInGroup = group.filter(h => h.status === 'active')
      if (activeInGroup.length < 2) continue

      // 选择组内 decayScore 最高的钩子作为"主钩子"
      const mainHook = activeInGroup.reduce((max, h) =>
        h.decayScore > max.decayScore ? h : max
      )
      const others = activeInGroup.filter(h => h.id !== mainHook.id)

      // H5.3 阶段 1：只标记 pending_merge，不执行合并
      const nowTs = Date.now()
      for (const other of others) {
        other.status = 'pending_merge'
        other.pendingMergeAt = nowTs
        // 在 customMetadata 中记录主钩子 ID，供 confirmMerge 使用
        other.customMetadata = { ...other.customMetadata, mergeTargetId: mainHook.id }
        await this.opts.updateHook(other)
      }

      // 在主钩子的 relatedHookIds 中记录待合并钩子
      mainHook.relatedHookIds = [...new Set([...mainHook.relatedHookIds, ...others.map(o => o.id)])]
      await this.opts.updateHook(mainHook)

      markedCount++

      // 批间暂停
      await new Promise(r => setTimeout(r, BATCH_PAUSE_MS))
    }

    console.log(`[ArchiveScheduler] 周任务标记 ${markedCount} 组待合并`)
    return markedCount
  }

  /**
   * H5.3 两阶段合并 - 阶段 2：确认合并
   *
   * 用户在 UI 确认后调用，对 `pending_merge` 钩子执行实际合并。
   * 合并后原钩子变为 `deprecated`，主钩子摘要和向量重算。
   *
   * @returns 实际合并的组数
   */
  async confirmMerge(): Promise<number> {
    const hooks = this.opts.getHooks()
    const pendingHooks = hooks.filter(h => h.status === 'pending_merge')
    if (pendingHooks.length === 0) return 0

    // 按 mergeTargetId 分组
    const groupMap = new Map<string, Hook[]>()
    for (const ph of pendingHooks) {
      const targetId = ph.customMetadata?.mergeTargetId as string | undefined
      if (!targetId) {
        // 无主钩子 ID，跳过（数据异常）
        console.warn(`[ArchiveScheduler] confirmMerge: 钩子 ${ph.id} 无 mergeTargetId，跳过`)
        continue
      }
      if (!groupMap.has(targetId)) {
        groupMap.set(targetId, [])
      }
      groupMap.get(targetId)!.push(ph)
    }

    let mergedCount = 0
    for (const [mainId, others] of groupMap) {
      if (this.interruptFlag) break

      const mainHook = hooks.find(h => h.id === mainId)
      if (!mainHook) {
        // 主钩子不存在，将待合并钩子恢复为 active
        console.warn(`[ArchiveScheduler] confirmMerge: 主钩子 ${mainId} 不存在，恢复待合并钩子`)
        for (const other of others) {
          other.status = 'active'
          other.pendingMergeAt = undefined
          other.customMetadata = { ...other.customMetadata }
          delete other.customMetadata!.mergeTargetId
          await this.opts.updateHook(other)
        }
        continue
      }

      // 执行实际合并：标记 pending_merge 钩子为 deprecated
      const nowTs = Date.now()
      for (const other of others) {
        other.status = 'deprecated'
        other.deprecatedAt = nowTs
        other.pendingMergeAt = undefined
        // 清理 customMetadata 中的 mergeTargetId
        other.customMetadata = { ...other.customMetadata }
        delete other.customMetadata!.mergeTargetId
        await this.opts.updateHook(other)
      }

      // 合并关键词和关联钩子到主钩子
      mainHook.keywords = [...new Set([...mainHook.keywords, ...others.flatMap(o => o.keywords)])]
      mainHook.relatedHookIds = [...new Set([...mainHook.relatedHookIds, ...others.map(o => o.id)])]

      // 重新生成主钩子摘要（LLM 合并摘要）
      try {
        if (this.opts.llmAdapter.isReady()) {
          const messages = [
            { role: 'assistant', content: mainHook.summary },
            ...others.map(o => ({ role: 'assistant', content: o.summary })),
          ]
          mainHook.summary = await this.opts.llmAdapter.summarize(messages, this.opts.config.summary.maxLength)
          mainHook.summaryMethod = 'llm'
        }
      } catch (err) {
        console.warn('[ArchiveScheduler] confirmMerge 合并摘要失败，保留主钩子原摘要:', err)
      }

      // 重新生成主钩子向量
      if (this.opts.embeddingAdapter.isReady()) {
        try {
          mainHook.embedding = await this.opts.embeddingAdapter.embed(mainHook.summary)
        } catch (err) {
          console.warn('[ArchiveScheduler] confirmMerge 主钩子向量重算失败:', err)
        }
      }

      await this.opts.updateHook(mainHook)
      mergedCount++

      // 批间暂停
      await new Promise(r => setTimeout(r, BATCH_PAUSE_MS))
    }

    console.log(`[ArchiveScheduler] confirmMerge: 合并 ${mergedCount} 组`)
    return mergedCount
  }

  /**
   * H5.3 获取待合并组（供 UI 显示）
   *
   * 返回当前所有 `pending_merge` 钩子按主钩子分组的列表。
   *
   * @returns 待合并组数组，每组包含主钩子和待合并钩子列表
   */
  getPendingMergeGroups(): Array<{ mainHook: Hook; pendingHooks: Hook[] }> {
    const hooks = this.opts.getHooks()
    const pendingHooks = hooks.filter(h => h.status === 'pending_merge')
    if (pendingHooks.length === 0) return []

    const groupMap = new Map<string, Hook[]>()
    for (const ph of pendingHooks) {
      const targetId = ph.customMetadata?.mergeTargetId as string | undefined
      if (!targetId) continue
      if (!groupMap.has(targetId)) {
        groupMap.set(targetId, [])
      }
      groupMap.get(targetId)!.push(ph)
    }

    const result: Array<{ mainHook: Hook; pendingHooks: Hook[] }> = []
    for (const [mainId, others] of groupMap) {
      const mainHook = hooks.find(h => h.id === mainId)
      if (mainHook) {
        result.push({ mainHook, pendingHooks: others })
      }
    }
    return result
  }

  /**
   * Step 3: 生成周索引
   */
  private async generateWeeklyIndex(): Promise<void> {
    const now = Date.now()
    const hooks = this.opts.getHooks()
    const weekStart = getWeekStart(now)
    const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000

    const weekHooks = hooks.filter(h => h.createdAt >= weekStart && h.createdAt < weekEnd)
    if (weekHooks.length === 0) {
      console.log('[ArchiveScheduler] 无本周钩子，跳过周索引生成')
      return
    }

    const weekStr = formatISOWeek(now)
    const indexId = `w_${weekStr}`

    const keywords = aggregateKeywords(weekHooks)

    // 生成摘要
    let summary: string
    try {
      if (this.opts.llmAdapter.isReady()) {
        const messages = weekHooks.map(h => ({
          role: 'assistant',
          content: h.summary,
        }))
        summary = await this.opts.llmAdapter.summarize(messages, 3000)
      } else {
        summary = `本周归档 ${weekHooks.length} 个钩子，关键词：${keywords.slice(0, 15).join('、')}`
      }
    } catch (err) {
      console.warn('[ArchiveScheduler] 周索引摘要生成失败，降级规则提取:', err)
      summary = `本周归档 ${weekHooks.length} 个钩子，关键词：${keywords.slice(0, 15).join('、')}`
    }

    // 生成向量
    let embedding: number[] | undefined
    if (this.opts.embeddingAdapter.isReady()) {
      try {
        embedding = await this.opts.embeddingAdapter.embed(summary)
      } catch (err) {
        console.warn('[ArchiveScheduler] 周索引向量生成失败:', err)
      }
    }

    const index: ArchiveIndex = {
      id: indexId,
      type: 'weekly',
      projectId: this.opts.projectId,
      periodStart: weekStart,
      periodEnd: weekEnd,
      hookIds: weekHooks.map(h => h.id),
      summary,
      keywords,
      embedding,
      createdAt: now,
    }

    await this.opts.storage.saveIndex(index)

    // 更新 hook.weeklyIndexId
    for (const hook of weekHooks) {
      if (hook.weeklyIndexId !== indexId) {
        hook.weeklyIndexId = indexId
        await this.opts.updateHook(hook)
      }
    }

    console.log(`[ArchiveScheduler] 周索引已生成: ${indexId} (${weekHooks.length} hooks)`)
  }

  // ===== 内部：月任务步骤 =====

  /**
   * Step 1: 衰减评分（分批执行）
   *
   * @returns 评分的钩子数
   */
  private async applyDecayScores(): Promise<number> {
    const now = Date.now()
    // H7.4：使用全量钩子（包括被 LRU 淘汰的）
    const hooks = this.getHooksForMonthlyTask()
    const activeHooks = hooks.filter(h => h.status === 'active')
    const decayParams = {
      halfLifeDays: this.opts.config.decay.halfLifeDays,
      deprecatedThreshold: this.opts.config.decay.deprecatedThreshold,
      deleteAfterDays: this.opts.config.decay.deleteAfterDays,
    }

    let count = 0
    await this.runBatched(activeHooks, async batch => {
      for (const hook of batch) {
        if (this.interruptFlag) return
        // P16：pinned 钩子跳过衰减
        if (hook.pinned) continue

        hook.decayScore = calculateDecayScore(hook, now, decayParams)
        if (shouldDeprecate(hook, hook.decayScore, decayParams)) {
          hook.status = 'deprecated'
          hook.deprecatedAt = now
        }
        await this.opts.updateHook(hook)
        count++
      }
    })
    return count
  }

  /**
   * Step 2: 硬删除过期 deprecated 钩子
   *
   * @returns 删除的钩子数
   */
  private async hardDeleteExpiredHooks(): Promise<number> {
    const now = Date.now()
    // H7.4：使用全量钩子（包括被 LRU 淘汰的）
    const hooks = this.getHooksForMonthlyTask()
    const deprecatedHooks = hooks.filter(h => h.status === 'deprecated')
    const decayParams = {
      halfLifeDays: this.opts.config.decay.halfLifeDays,
      deprecatedThreshold: this.opts.config.decay.deprecatedThreshold,
      deleteAfterDays: this.opts.config.decay.deleteAfterDays,
    }

    // 加载索引，检查钩子是否被索引引用
    const dailyIndices = await this.opts.storage.loadIndices('daily')
    const weeklyIndices = await this.opts.storage.loadIndices('weekly')
    const allIndexHookIds = new Set([
      ...dailyIndices.flatMap(i => i.hookIds),
      ...weeklyIndices.flatMap(i => i.hookIds),
    ])

    const meta = await this.opts.metaStorage.loadMeta()
    let deletedCount = 0

    for (const hook of deprecatedHooks) {
      if (this.interruptFlag) break

      if (!shouldHardDelete(hook, now, decayParams)) continue

      // 检查是否被索引引用
      if (allIndexHookIds.has(hook.id)) {
        console.log(`[ArchiveScheduler] 钩子 ${hook.id} 被索引引用，跳过删除`)
        continue
      }

      try {
        await this.opts.deleteHookAndFile(hook.id)
        deletedCount++
      } catch (err) {
        console.warn(`[ArchiveScheduler] 删除钩子失败 ${hook.id}:`, err)
        // P18：失败队列
        if (!meta.failedDeletions.includes(hook.fileId)) {
          meta.failedDeletions.push(hook.fileId)
        }
      }
    }

    // 清理 failedDeletions 中已成功的项
    const currentHooks = this.opts.getHooks()
    const currentFileIds = new Set(currentHooks.map(h => h.fileId))
    meta.failedDeletions = meta.failedDeletions.filter(id => currentFileIds.has(id))

    await this.opts.metaStorage.saveMeta(meta)
    return deletedCount
  }

  /**
   * H6.3 Step 2.5: 清理 orphan 钩子（事务失败遗留）
   *
   * orphan 状态的钩子是归档事务 Commit 失败时标记的，
   * 其记忆文件已写入但 boundary 未推进，属于无效记忆。
   * 月任务直接永久删除 orphan 钩子及其记忆文件（H5.2：permanent=true 跳过回收站）。
   *
   * @returns 删除的 orphan 钩子数
   */
  private async cleanOrphanHooks(): Promise<number> {
    // H7.4：使用全量钩子（包括被 LRU 淘汰的）
    const hooks = this.getHooksForMonthlyTask()
    const orphanHooks = hooks.filter(h => h.status === 'orphan')

    if (orphanHooks.length === 0) return 0

    let deletedCount = 0
    for (const hook of orphanHooks) {
      if (this.interruptFlag) break
      try {
        // H5.2：permanent=true 永久删除，不进入回收站
        await this.opts.deleteHookAndFile(hook.id, true)
        deletedCount++
        console.log(`[ArchiveScheduler] 清理 orphan 钩子: ${hook.id}`)
      } catch (err) {
        console.warn(`[ArchiveScheduler] 清理 orphan 钩子失败 ${hook.id}:`, err)
      }
    }
    return deletedCount
  }

  /**
   * H5.2 Step 5.5: 清理过期回收站
   *
   * 清空回收站中超过 trashRetentionDays 天的项。
   *
   * @returns 清理的项数（hooks + files）
   */
  private async cleanExpiredTrash(): Promise<number> {
    const retentionDays = this.opts.config.trashRetentionDays ?? 7
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
    try {
      const result = await this.opts.storage.emptyTrash(cutoff)
      if (result.hooks > 0 || result.files > 0) {
        console.log(`[ArchiveScheduler] 清理过期回收站: ${result.hooks} 钩子, ${result.files} 文件`)
      }
      return result.hooks + result.files
    } catch (err) {
      console.warn('[ArchiveScheduler] 清理过期回收站失败:', err)
      return 0
    }
  }

  /**
   * Step 3: 清理未引用的记忆文件（孤儿文件）
   */
  private async cleanOrphanFiles(): Promise<void> {
    // H7.4：使用全量钩子（包括被 LRU 淘汰的），避免误删被淘汰钩子的记忆文件
    const hooks = this.getHooksForMonthlyTask()
    const referencedFileIds = new Set(hooks.map(h => h.fileId))

    const allFiles = await this.opts.storage.listMemoryFiles()
    const orphanFiles = allFiles.filter(f => !referencedFileIds.has(f.id))

    for (const orphan of orphanFiles) {
      if (this.interruptFlag) break
      try {
        await this.opts.storage.deleteMemoryFile(orphan.id)
        console.log(`[ArchiveScheduler] 清理孤儿文件: ${orphan.id}`)
      } catch (err) {
        console.warn(`[ArchiveScheduler] 清理孤儿文件失败 ${orphan.id}:`, err)
      }
    }
  }

  /**
   * Step 4: 清理过期索引
   */
  private async cleanExpiredIndices(): Promise<void> {
    const now = Date.now()
    const dailyCutoff = now - DAILY_INDEX_RETENTION_DAYS * 24 * 60 * 60 * 1000
    const weeklyCutoff = now - WEEKLY_INDEX_RETENTION_WEEKS * 7 * 24 * 60 * 60 * 1000

    // 清理日索引
    const dailyIndices = await this.opts.storage.loadIndices('daily')
    for (const index of dailyIndices) {
      if (this.interruptFlag) break
      if (index.periodEnd < dailyCutoff) {
        try {
          await this.deleteIndex('daily', index.id)
        } catch (err) {
          console.warn(`[ArchiveScheduler] 删除过期日索引失败 ${index.id}:`, err)
        }
      }
    }

    // 清理周索引
    const weeklyIndices = await this.opts.storage.loadIndices('weekly')
    for (const index of weeklyIndices) {
      if (this.interruptFlag) break
      if (index.periodEnd < weeklyCutoff) {
        try {
          await this.deleteIndex('weekly', index.id)
        } catch (err) {
          console.warn(`[ArchiveScheduler] 删除过期周索引失败 ${index.id}:`, err)
        }
      }
    }
  }

  /**
   * Step 5: 重算向量防漂移（P15 从周任务移入）
   *
   * @returns 重算的向量数
   */
  private async rebuildVectorsIfNeeded(): Promise<number> {
    // H7.4：使用全量钩子（包括被 LRU 淘汰的）
    const hooks = this.getHooksForMonthlyTask()
    const activeHooks = hooks.filter(h => h.status === 'active' && h.summaryMethod !== 'none')

    if (activeHooks.length === 0) return 0
    if (!this.opts.embeddingAdapter.isReady()) return 0

    // 检测 embedding 维度是否变化
    const expectedDim = this.opts.config.embedding.dimension
    const needRebuild = activeHooks.filter(h => {
      if (!h.embedding) return false
      return h.embedding.length !== expectedDim
    })

    // 也补全缺失向量的钩子
    const missingVector = activeHooks.filter(h => !h.embedding && h.summary.length > 0)
    const toRebuild = [...needRebuild, ...missingVector]

    if (toRebuild.length === 0) return 0

    let count = 0
    await this.runBatched(toRebuild, async batch => {
      for (const hook of batch) {
        if (this.interruptFlag) return
        try {
          hook.embedding = await this.opts.embeddingAdapter.embed(hook.summary)
          await this.opts.updateHook(hook)
          count++
        } catch (err) {
          console.warn(`[ArchiveScheduler] 重算向量失败 hook=${hook.id}:`, err)
        }
      }
    })

    if (count > 0) {
      this.opts.emit('scheduler:task-success', { event: 'archive:vectors-rebuilt', count })
      console.log(`[ArchiveScheduler] 重算向量 ${count} 个`)
    }
    return count
  }

  /**
   * Step 6: 更新 meta.json
   */
  private async updateMonthlyMeta(): Promise<void> {
    const now = Date.now()
    const meta = await this.opts.metaStorage.loadMeta()

    meta.lastMonthlyRun = now

    // 更新统计
    const stats = await this.opts.storage.getStorageStats()
    meta.totalHooks = stats.totalHooks
    meta.totalFiles = stats.totalFiles
    meta.totalStorageBytes = stats.totalBytes

    await this.opts.metaStorage.saveMeta(meta)

    // 清理过期日志
    const deletedLogs = await this.opts.metaStorage.cleanExpiredLogs()
    if (deletedLogs > 0) {
      console.log(`[ArchiveScheduler] 清理过期日志 ${deletedLogs} 个`)
    }
  }

  // ===== 内部：调度逻辑 =====

  /**
   * 检查并执行到期的任务
   */
  private async checkAndRun(): Promise<void> {
    if (this.running) {
      console.log('[ArchiveScheduler] 已有任务在运行，跳过本次检查')
      return
    }

    this.running = true
    this.interruptFlag = false

    try {
      const now = Date.now()
      const meta = await this.opts.metaStorage.loadMeta()
      const cfg = this.opts.config.scheduler

      // 日任务
      if (shouldRunDaily(meta.lastDailyRun, now, cfg.dailyHour)) {
        await this.runDaily()
      }

      // 周任务
      if (shouldRunWeekly(meta.lastWeeklyRun, now, cfg.weeklyDay)) {
        await this.runWeekly()
      }

      // 月任务
      if (shouldRunMonthly(meta.lastMonthlyRun, now, cfg.monthlyDay)) {
        await this.runMonthly()
      }
    } finally {
      this.running = false
      this.interruptFlag = false
    }
  }

  // ===== 内部：工具方法 =====

  /**
   * 分批执行（P17 决策）
   */
  private async runBatched<T>(
    items: T[],
    fn: (batch: T[]) => Promise<void>
  ): Promise<void> {
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      if (this.interruptFlag) {
        console.log('[ArchiveScheduler] 任务被中断')
        return
      }
      const batch = items.slice(i, i + BATCH_SIZE)
      await fn(batch)
      if (i + BATCH_SIZE < items.length) {
        await new Promise(r => setTimeout(r, BATCH_PAUSE_MS))
      }
    }
  }

  /**
   * 执行单个步骤，捕获错误并记录
   */
  private async runStep<T>(stepName: string, fn: () => Promise<T>): Promise<T> {
    if (this.interruptFlag) {
      throw new Error(`任务被中断（${stepName}）`)
    }
    try {
      return await fn()
    } catch (err) {
      console.error(`[ArchiveScheduler] 步骤失败 ${stepName}:`, err)
      throw err
    }
  }

  /**
   * 按关键词 Jaccard 相似度聚类
   */
  private clusterBySimilarity(hooks: Hook[]): Hook[][] {
    const groups: Hook[][] = []
    const assigned = new Set<string>()

    for (const hook of hooks) {
      if (assigned.has(hook.id)) continue

      const group: Hook[] = [hook]
      assigned.add(hook.id)

      for (const other of hooks) {
        if (assigned.has(other.id)) continue
        const similarity = jaccardSimilarity(hook.keywords, other.keywords)
        if (similarity > 0.5) {
          group.push(other)
          assigned.add(other.id)
        }
      }

      if (group.length >= 2) {
        groups.push(group)
      }
    }

    return groups
  }

  /**
   * 删除索引文件
   *
   * StorageAdapter 接口未提供 deleteIndex，通过 FsOperations 直接删除。
   */
  private async deleteIndex(type: 'daily' | 'weekly', indexId: string): Promise<void> {
    const basePath = (this.opts.storage as unknown as { basePath: string }).basePath
    const indexPath = `${basePath}/indices/${type}/${indexId}.json`
    if (await this.opts.fs.exists(indexPath)) {
      await this.opts.fs.remove(indexPath)
    }
  }

  // ===== 内部：补执行计数 =====

  private countMissedDaily(lastRun: number, now: number): number {
    if (lastRun === 0) return 1
    const daysPassed = Math.floor((now - lastRun) / (24 * 60 * 60 * 1000))
    return Math.max(0, daysPassed)
  }

  private countMissedWeekly(lastRun: number, now: number): number {
    if (lastRun === 0) return 1
    const weeksPassed = Math.floor((now - lastRun) / (7 * 24 * 60 * 60 * 1000))
    return Math.max(0, weeksPassed)
  }

  private countMissedMonthly(lastRun: number, now: number): number {
    if (lastRun === 0) return 1
    const monthsPassed = Math.floor((now - lastRun) / (30 * 24 * 60 * 60 * 1000))
    return Math.max(0, monthsPassed)
  }
}

// ===== 工具函数 =====

/**
 * Jaccard 相似度（周任务聚类用）
 */
function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const setA = new Set(a)
  const setB = new Set(b)
  let intersection = 0
  for (const x of setA) {
    if (setB.has(x)) intersection++
  }
  const union = setA.size + setB.size - intersection
  if (union === 0) return 0
  return intersection / union
}

/**
 * 聚合关键词
 */
function aggregateKeywords(hooks: Hook[]): string[] {
  const counts = new Map<string, number>()
  for (const hook of hooks) {
    for (const kw of hook.keywords) {
      counts.set(kw, (counts.get(kw) || 0) + 1)
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([kw]) => kw)
}

/**
 * 判断两个时间戳是否同一天（本地时区）
 */
function isSameDay(ts1: number, ts2: number): boolean {
  const d1 = new Date(ts1)
  const d2 = new Date(ts2)
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  )
}

/**
 * 获取当天开始时间戳（00:00:00）
 */
function getDayStart(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * 获取当天结束时间戳（23:59:59.999）
 */
function getDayEnd(ts: number): number {
  const d = new Date(ts)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

/**
 * 获取本周开始时间戳（周日 00:00:00）
 */
function getWeekStart(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d.getTime()
}

/**
 * 格式化为 YYYYMMDD
 */
function formatDateYYYYMMDD(ts: number): string {
  const d = new Date(ts)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

/**
 * 格式化为 ISO 周号（如 2026w25）
 */
function formatISOWeek(ts: number): string {
  const d = new Date(ts)
  const year = d.getFullYear()
  const startOfYear = new Date(year, 0, 1)
  const daysSinceStart = Math.floor((d.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000))
  const weekNum = Math.ceil((daysSinceStart + startOfYear.getDay() + 1) / 7)
  return `${year}w${String(weekNum).padStart(2, '0')}`
}

// ===== 调度判断函数 =====

/**
 * 判断是否应该执行日任务
 *
 * 条件：上次执行不在今天，且当前时间 >= dailyHour
 */
function shouldRunDaily(lastRun: number, now: number, dailyHour: number): boolean {
  if (lastRun === 0) return true
  // 如果上次执行是今天，跳过
  if (isSameDay(lastRun, now)) return false
  // 当前时间达到 dailyHour 才执行
  const currentHour = new Date(now).getHours()
  return currentHour >= dailyHour
}

/**
 * 判断是否应该执行周任务
 *
 * 条件：上次执行不在本周，且今天是 weeklyDay
 */
function shouldRunWeekly(lastRun: number, now: number, weeklyDay: number): boolean {
  if (lastRun === 0) return true
  // 检查是否本周已执行
  const weekStart = getWeekStart(now)
  if (lastRun >= weekStart) return false
  // 今天是 weeklyDay 才执行
  const currentDay = new Date(now).getDay()
  return currentDay === weeklyDay
}

/**
 * 判断是否应该执行月任务
 *
 * 条件：上次执行不在本月，且今天是 monthlyDay
 */
function shouldRunMonthly(lastRun: number, now: number, monthlyDay: number): boolean {
  if (lastRun === 0) return true
  // 检查是否本月已执行
  const d = new Date(now)
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime()
  if (lastRun >= monthStart) return false
  // 今天是 monthlyDay 才执行
  return d.getDate() === monthlyDay
}
