/**
 * 归档管理器（核心入口）
 *
 * 宿主通过此类操作框架，聚合所有子模块。
 * 提供 archive() / recall() / getBoundary() / loadChunk() 等方法。
 * 管理生命周期（init/start/stop）。
 *
 * 实现 11 步归档流程（P7 优化）：
 * Step 0: 预检查（P7 新增）
 * Step 1: 读取待归档消息
 * Step 2: 主题分块
 * Step 3: 写入记忆文件
 * Step 4 & 5: 并行生成摘要和向量（P7 优化）
 * Step 6: 构建索引钩子
 * Step 7: 持久化钩子（退避重试 3 次，P10 决策）
 * Step 8: 推进归档边界（P11 安全截断）
 * Step 9: 注入钩子摘要
 * Step 10: 发射事件
 */

import type { AgentBridge } from '../adapters/AgentBridge'
import type { EmbeddingAdapter } from '../adapters/EmbeddingAdapter'
import type { FsOperations } from '../adapters/FsOperations'
import type { LlmAdapter } from '../adapters/LlmAdapter'
import type { StorageAdapter } from '../adapters/StorageAdapter'
import type { TokenizerAdapter } from '../adapters/TokenizerAdapter'
import type {
  AgentMessageSnapshot,
  ArchiveConfig,
  ArchiveEventListener,
  ArchiveEventName,
  ArchiveMeta,
  ArchiveResult,
  ArchiveTriggerOptions,
  Hook,
  MemoryChunk,
  RecallParams,
  RecallResult,
  TaskLogEntry,
} from '../types'
import { DEFAULT_ARCHIVE_CONFIG } from '../defaults'
import { ArchiveBoundary } from './ArchiveBoundary'
import { HookBuilder } from './HookBuilder'
import { MemoryFileWriter } from './MemoryFileWriter'
import { RecallEngine } from './RecallEngine'
import { ArchiveScheduler } from '../scheduler/ArchiveScheduler'
import { MetaStorage } from '../scheduler/MetaStorage'
import { ReadWriteLock } from '../utils/rwLock'
import { findSafeTruncatePoint } from '../utils/safeTruncate'

export interface ArchiveManagerOptions {
  agentBridge: AgentBridge
  storage: StorageAdapter
  embeddingAdapter: EmbeddingAdapter
  llmAdapter: LlmAdapter
  projectId: string
  sessionId: string
  /** P4 新增：文件系统操作（MetaStorage 需要） */
  fs: FsOperations
  /** P4 新增：存储根路径（MetaStorage 需要） */
  basePath: string
  config?: Partial<ArchiveConfig>
  /** H2.2 新增：分词器适配器（可选，未注入时使用 SimpleTokenizerAdapter 降级） */
  tokenizer?: TokenizerAdapter
}

export class ArchiveManager {
  private opts: Required<ArchiveManagerOptions>
  private config: ArchiveConfig
  private boundary: ArchiveBoundary
  private hookBuilder: HookBuilder
  private fileWriter: MemoryFileWriter
  private recallEngine: RecallEngine
  private rwLock: ReadWriteLock
  /** P4 新增：元数据存储 */
  private metaStorage: MetaStorage
  /** P4 新增：周期任务调度器 */
  private scheduler: ArchiveScheduler

  /** 钩子内存缓存（Copy-on-Write，P17 决策） */
  private hooksCache: Hook[] = []
  private initialized: boolean = false
  private listeners: Map<ArchiveEventName, Set<ArchiveEventListener>> = new Map()

  constructor(options: ArchiveManagerOptions) {
    this.config = { ...DEFAULT_ARCHIVE_CONFIG, ...options.config }
    this.opts = options as Required<ArchiveManagerOptions>

    this.boundary = new ArchiveBoundary(this.config.archiveThreshold)
    this.hookBuilder = new HookBuilder({
      projectId: options.projectId,
      sessionId: options.sessionId,
      chunkingConfig: this.config.chunking,
      embeddingAdapter: options.embeddingAdapter,
      llmAdapter: options.llmAdapter,
      summaryEnabled: this.config.summary.enabled,
      summaryMaxLength: this.config.summary.maxLength,
    })
    this.fileWriter = new MemoryFileWriter({
      projectId: options.projectId,
      sessionId: options.sessionId,
      storage: options.storage,
    })
    this.recallEngine = new RecallEngine({
      embeddingAdapter: options.embeddingAdapter,
      getHooks: () => [...this.hooksCache], // 返回快照
      onAccessed: async hookIds => this.updateAccessStats(hookIds),
      tokenizer: options.tokenizer, // H2.2 传递分词器
    })
    this.rwLock = new ReadWriteLock()

    // P4 新增：初始化 MetaStorage 和 ArchiveScheduler
    this.metaStorage = new MetaStorage(options.basePath, options.fs)
    this.scheduler = new ArchiveScheduler({
      storage: options.storage,
      embeddingAdapter: options.embeddingAdapter,
      llmAdapter: options.llmAdapter,
      metaStorage: this.metaStorage,
      fs: options.fs,
      rwLock: this.rwLock,
      config: this.config,
      projectId: options.projectId,
      getHooks: () => [...this.hooksCache],
      updateHook: async hook => {
        await this.opts.storage.saveHook(hook)
        this.hooksCache = this.hooksCache.map(h => (h.id === hook.id ? hook : h))
      },
      deleteHookAndFile: async (hookId, permanent) => {
        await this.deleteHook(hookId, permanent)
      },
      emit: (event, payload) => this.emit(event, payload),
    })
  }

  // ===== 生命周期 =====

  async init(): Promise<void> {
    if (this.initialized) return

    // 加载所有钩子到内存缓存
    this.hooksCache = await this.opts.storage.loadAllHooks()

    // H7.4：LRU 淘汰，控制内存缓存大小
    this.evictLRUHooks()

    // 注册工具到 Agent
    const tools = this.createArchiveTools()
    this.opts.agentBridge.registerTools(tools)

    this.initialized = true

    // P4 新增：根据配置启动周期任务调度器
    if (this.config.scheduler.enabled) {
      this.scheduler.start()
      console.log('[ArchiveManager] 周期任务调度器已启动')
    }
  }

  /**
   * P4 新增：销毁 ArchiveManager，停止调度器
   *
   * 宿主在项目切换或应用关闭时调用。
   */
  dispose(): void {
    this.scheduler.stop()
    this.initialized = false
    console.log('[ArchiveManager] 已销毁，调度器已停止')
  }

  // ===== 周期管理（P4 新增） =====

  /**
   * 启动周期任务调度器
   */
  startScheduler(): void {
    this.scheduler.start()
  }

  /**
   * 停止周期任务调度器
   */
  stopScheduler(): void {
    this.scheduler.stop()
  }

  /**
   * 中断当前运行的周期任务
   */
  interruptScheduler(): void {
    this.scheduler.interrupt()
  }

  /**
   * 获取记忆库元数据
   */
  async getMeta(): Promise<ArchiveMeta> {
    return this.metaStorage.loadMeta()
  }

  /**
   * 手动触发日任务
   */
  async runDailyNow(): Promise<TaskLogEntry> {
    return this.scheduler.runDaily()
  }

  /**
   * 手动触发周任务
   */
  async runWeeklyNow(): Promise<TaskLogEntry> {
    return this.scheduler.runWeekly()
  }

  /**
   * 手动触发月任务
   */
  async runMonthlyNow(): Promise<TaskLogEntry> {
    return this.scheduler.runMonthly()
  }

  /**
   * H5.3 确认合并（两阶段合并 - 阶段 2）
   *
   * 用户在 UI 确认后调用，对 `pending_merge` 钩子执行实际合并。
   *
   * @returns 实际合并的组数
   */
  async confirmMerge(): Promise<number> {
    return this.scheduler.confirmMerge()
  }

  /**
   * H5.3 获取待合并组（供 UI 显示）
   *
   * @returns 待合并组数组
   */
  getPendingMergeGroups(): Array<{ mainHook: Hook; pendingHooks: Hook[] }> {
    return this.scheduler.getPendingMergeGroups()
  }

  /**
   * 更新会话 ID（会话切换时调用）
   *
   * P3-2-3 新增：支持会话切换时更新 sessionId，避免重新初始化整个 ArchiveManager。
   * 会同步更新 HookBuilder 和 MemoryFileWriter 的 sessionId。
   * 同时重置 boundary，因为新会话的消息从 index 0 开始。
   *
   * @param sessionId 新的会话 ID
   */
  updateSessionId(sessionId: string): void {
    this.opts.sessionId = sessionId
    this.hookBuilder.updateSessionId(sessionId)
    this.fileWriter.updateSessionId(sessionId)
    this.boundary.reset()
  }

  /**
   * 获取当前配置（只读副本）
   *
   * P3-4 新增：供宿主 UI 读取配置展示。
   * 返回深拷贝避免外部修改内部状态。
   */
  getConfig(): ArchiveConfig {
    return JSON.parse(JSON.stringify(this.config))
  }

  /**
   * 更新配置
   *
   * P3-4 新增：供宿主 UI 保存配置。
   * 会同步更新 boundary 阈值和 HookBuilder 的分块/摘要参数。
   * 不持久化，持久化由宿主通过 ConfigAdapter 负责。
   *
   * @param partial 部分配置，会与当前配置浅合并（嵌套对象需完整传入）
   */
  updateConfig(partial: Partial<ArchiveConfig>): void {
    const oldThreshold = this.config.archiveThreshold
    this.config = { ...this.config, ...partial }

    // 同步 boundary 阈值
    if (partial.archiveThreshold !== undefined && partial.archiveThreshold !== oldThreshold) {
      this.boundary.updateThreshold(this.config.archiveThreshold)
    }

    // 同步 HookBuilder 参数
    if (partial.chunking) {
      this.hookBuilder.updateChunkingConfig(this.config.chunking)
    }
    if (partial.summary) {
      this.hookBuilder.updateSummaryConfig(
        this.config.summary.enabled,
        this.config.summary.maxLength
      )
    }

    // P4 新增：同步 Scheduler 配置
    if (partial.scheduler || partial.decay || partial.embedding) {
      this.scheduler.updateConfig(this.config)
    }

    // H7.4：hooksCacheMaxSize 变更时触发 LRU 淘汰
    if (partial.hooksCacheMaxSize !== undefined) {
      this.evictLRUHooks()
    }
  }

  // ===== 归档流程（11 步，P7 优化） =====

  /**
   * 执行归档
   */
  async archive(trigger: ArchiveTriggerOptions): Promise<ArchiveResult> {
    if (!this.initialized) {
      throw new Error('ArchiveManager not initialized. Call init() first.')
    }

    // 使用写锁（exclusive）
    return this.rwLock.writeLock(async () => {
      return this.executeArchive(trigger)
    })
  }

  /**
   * H6.2 归档外部会话消息
   *
   * 用于归档非当前会话的消息（如删除会话前归档）。
   * 不推进当前会话的 boundary，不向当前会话注入摘要。
   * 钩子的 sessionId 设置为传入的 sessionId。
   *
   * @param sessionId 目标会话 ID
   * @param messages 目标会话的完整消息
   * @param trigger 归档触发选项
   */
  async archiveExternalMessages(
    sessionId: string,
    messages: AgentMessageSnapshot[],
    trigger: ArchiveTriggerOptions
  ): Promise<ArchiveResult> {
    if (!this.initialized) {
      throw new Error('ArchiveManager not initialized. Call init() first.')
    }

    return this.rwLock.writeLock(async () => {
      // Step 0: 基本检查（跳过 boundary 和 streaming 检查，使用传入消息）
      if (messages.length === 0) {
        throw new Error('No messages to archive (external session)')
      }
      if (messages.length < this.config.minArchiveMessages) {
        throw new Error(
          `Message count ${messages.length} < minArchiveMessages ${this.config.minArchiveMessages}`
        )
      }

      // Step 1: 使用传入的消息（不从 AgentBridge 获取，不应用 boundary）
      const filteredMessages = this.applyExclusionPatterns(messages)
      if (filteredMessages.length === 0) {
        throw new Error('No messages to archive after filtering (external session)')
      }

      // Step 2-6: 构建钩子（messageRange 从 0 开始，因为传入的是完整会话消息）
      const messageRange = { start: 0, end: filteredMessages.length }
      const buildResult = await this.hookBuilder.build(filteredMessages, messageRange, trigger)
      const { hook, chunks, summaryMethod } = buildResult

      // 覆盖钩子的 sessionId 为目标会话
      hook.sessionId = sessionId

      // Step 3: 写入记忆文件
      await this.fileWriter.write(hook.fileId, chunks)

      // Step 7: 持久化钩子（退避重试 3 次）
      await this.retryWithBackoff(
        () => this.opts.storage.saveHook(hook),
        3,
        'saveHook'
      )

      // 更新内存缓存（Copy-on-Write）
      this.hooksCache = [...this.hooksCache, hook]

      // H6.2: 不推进 boundary，不注入摘要（这是外部会话，非当前会话）
      // H7.4: LRU 淘汰
      this.evictLRUHooks()

      // Step 10: 发射事件
      const result: ArchiveResult = {
        hookId: hook.id,
        fileId: hook.fileId,
        tokenCount: hook.tokenCount,
        chunkCount: chunks.length,
        newBoundaryIndex: 0,
        summaryMethod,
      }
      this.emit('archive:complete', result)

      return result
    })
  }

  private async executeArchive(trigger: ArchiveTriggerOptions): Promise<ArchiveResult> {
    // Step 0: 预检查（P7 新增）
    const preCheck = this.preCheck()
    if (!preCheck.passed) {
      throw new Error(`Archive pre-check failed: ${preCheck.reason}`)
    }

    // Step 1: 读取待归档消息
    const allMessages = this.opts.agentBridge.getCurrentMessages()
    const boundaryStart = this.boundary.current
    const toArchive = allMessages.slice(boundaryStart)

    // 应用排除模式（P6 新增）
    const filteredMessages = this.applyExclusionPatterns(toArchive)

    if (filteredMessages.length === 0) {
      throw new Error('No messages to archive after filtering')
    }

    // ===== Prepare 阶段（可重试，失败则抛出，不影响 boundary） =====

    // Step 2-6: 构建钩子（含主题分块、摘要、向量）
    const messageRange = {
      start: boundaryStart,
      end: boundaryStart + filteredMessages.length,
    }
    const buildResult = await this.hookBuilder.build(filteredMessages, messageRange, trigger)
    const { hook, chunks, summaryMethod } = buildResult

    // Step 3: 写入记忆文件
    await this.fileWriter.write(hook.fileId, chunks)

    // Step 7: 持久化钩子（退避重试 3 次，P10 决策）
    await this.retryWithBackoff(
      () => this.opts.storage.saveHook(hook),
      3,
      'saveHook'
    )

    // 更新内存缓存（Copy-on-Write，P17 决策）
    this.hooksCache = [...this.hooksCache, hook]

    // H7.4: LRU 淘汰
    this.evictLRUHooks()

    // ===== Commit 阶段（H6.3 事务机制：失败则 Rollback） =====

    // Step 8: 推进归档边界（P11 安全截断）
    const safeIndex = findSafeTruncatePoint(
      allMessages,
      boundaryStart + filteredMessages.length
    )

    try {
      this.opts.agentBridge.advanceBoundary(safeIndex)
      // agentBridge.advanceBoundary 删除了前 safeIndex 条消息，新消息数组从 0 开始重新索引。
      // 因此 boundary 必须重置为 0，否则下次归档 toArchive = slice(boundaryStart) 会跳过消息。
      this.boundary.reset()

      // Step 9: 注入钩子摘要
      try {
        await this.retryWithBackoff(
          () => Promise.resolve(this.opts.agentBridge.injectHookSummary([hook])),
          3,
          'injectHookSummary'
        )
      } catch (err) {
        // 摘要注入失败不回滚整个事务（记忆已持久化），仅记录事件
        console.error('[ArchiveManager] injectHookSummary failed after retries:', err)
        this.emit('archive:inject-failed', { hookId: hook.id, error: err })
      }
    } catch (commitErr) {
      // Commit 失败：执行 Rollback
      console.error('[ArchiveManager] Commit failed, rolling back:', commitErr)
      await this.rollbackArchive(hook)
      this.emit('archive:failed', {
        hookId: hook.id,
        fileId: hook.fileId,
        error: commitErr instanceof Error ? commitErr.message : String(commitErr),
      })
      throw new Error(
        `Archive commit failed, hook marked as orphan: ${
          commitErr instanceof Error ? commitErr.message : String(commitErr)
        }`
      )
    }

    // Step 10: 发射事件
    const result: ArchiveResult = {
      hookId: hook.id,
      fileId: hook.fileId,
      tokenCount: hook.tokenCount,
      chunkCount: chunks.length,
      newBoundaryIndex: safeIndex,
      summaryMethod,
    }
    this.emit('archive:complete', result)

    return result
  }

  /**
   * H6.3 事务机制：Rollback
   *
   * Commit 阶段失败时调用。将钩子标记为 orphan 状态，
   * 月任务的孤儿清理步骤会删除 orphan 钩子及其记忆文件。
   * 不推进 boundary，下次归档会重新处理这些消息。
   *
   * @param hook 已持久化但 Commit 失败的钩子
   */
  private async rollbackArchive(hook: Hook): Promise<void> {
    try {
      hook.status = 'orphan'
      await this.opts.storage.saveHook(hook)
      // 更新内存缓存
      this.hooksCache = this.hooksCache.map(h => (h.id === hook.id ? hook : h))
      console.warn(`[ArchiveManager] Hook ${hook.id} marked as orphan (rollback)`)
    } catch (err) {
      console.error('[ArchiveManager] Rollback failed to mark orphan:', err)
      // 即使 Rollback 失败也不抛出，月任务的孤儿文件清理会兜底
    }
  }

  // ===== 检索 =====

  async recall(params: RecallParams): Promise<RecallResult[]> {
    if (!this.initialized) {
      throw new Error('ArchiveManager not initialized. Call init() first.')
    }
    // 检索无锁（读取快照）
    return this.recallEngine.recall(params)
  }

  /**
   * 加载记忆片段
   *
   * H7.4: 如果钩子已被 LRU 淘汰出内存缓存，从磁盘按需加载。
   */
  async loadChunk(hookId: string, chunkId: string): Promise<MemoryChunk> {
    if (!this.initialized) {
      throw new Error('ArchiveManager not initialized. Call init() first.')
    }
    const hook = await this.getHookWithFallback(hookId)
    if (!hook) {
      throw new Error(`Hook not found: ${hookId}`)
    }
    return this.fileWriter.loadChunk(hook.fileId, chunkId)
  }

  // ===== 边界管理 =====

  getBoundary(): number {
    return this.boundary.current
  }

  resetBoundary(): void {
    this.boundary.reset()
  }

  restoreBoundary(index: number): void {
    this.boundary.restore(index)
  }

  // ===== 钩子管理 =====

  /**
   * 获取最近 N 个钩子（用于新会话自动注入）
   */
  async getRecentHooks(count: number): Promise<Hook[]> {
    const sorted = [...this.hooksCache]
      .filter(h => h.status === 'active')
      .sort((a, b) => b.createdAt - a.createdAt)
    return sorted.slice(0, count)
  }

  /**
   * H2.1 自动注入最近钩子摘要
   *
   * 按配置 autoInjectRecentCount 获取最近 N 条钩子，
   * 通过 AgentBridge.injectHookSummary 注入到消息上下文。
   *
   * H4.3: 注入数量同时受 maxInjectedSummaries 限制（取两者较小值）。
   *
   * @returns 注入的摘要文本，无注入时返回空字符串
   */
  async injectRecentSummaries(): Promise<string> {
    if (!this.initialized) {
      throw new Error('ArchiveManager not initialized. Call init() first.')
    }
    const autoInjectCount = this.config.injection?.autoInjectRecentCount ?? 0
    if (autoInjectCount <= 0) return ''

    // H4.3: 取 autoInjectRecentCount 和 maxInjectedSummaries 的较小值
    const maxInjected = this.config.maxInjectedSummaries ?? 3
    const count = Math.min(autoInjectCount, maxInjected)

    const recentHooks = await this.getRecentHooks(count)
    if (recentHooks.length === 0) return ''

    return this.opts.agentBridge.injectHookSummary(recentHooks)
  }

  /**
   * 获取所有钩子
   */
  getAllHooks(): Hook[] {
    return [...this.hooksCache]
  }

  /**
   * 给钩子打标签（P9 archive_tag 工具）
   *
   * H7.4: 如果钩子已被 LRU 淘汰出内存缓存，从磁盘按需加载。
   */
  async tagHook(hookId: string, tags: string[]): Promise<void> {
    const hook = await this.getHookWithFallback(hookId)
    if (!hook) {
      throw new Error(`Hook not found: ${hookId}`)
    }
    hook.tags = [...new Set([...hook.tags, ...tags])]
    await this.opts.storage.saveHook(hook)
    // 如果钩子不在缓存中（从磁盘加载），更新缓存中的副本
    this.updateHookInCache(hook)
  }

  /**
   * 标记钩子为 pinned（P16 决策）
   *
   * H7.4: 如果钩子已被 LRU 淘汰出内存缓存，从磁盘按需加载。
   */
  async pinHook(hookId: string, pinned: boolean): Promise<void> {
    const hook = await this.getHookWithFallback(hookId)
    if (!hook) {
      throw new Error(`Hook not found: ${hookId}`)
    }
    hook.pinned = pinned
    await this.opts.storage.saveHook(hook)
    // 如果钩子不在缓存中（从磁盘加载），更新缓存中的副本
    this.updateHookInCache(hook)
  }

  /**
   * 删除钩子（同时删除记忆文件）
   *
   * H5.2 修改：改为软删除（移入回收站），用户可在 ArchivePanel 恢复。
   * 月任务会在 trashRetentionDays 天后调用 emptyTrash 硬删除。
   *
   * H7.4: 如果钩子已被 LRU 淘汰出内存缓存，从磁盘按需加载。
   *
   * @param hookId 钩子 ID
   * @param permanent 是否永久删除（跳过回收站），默认 false
   */
  async deleteHook(hookId: string, permanent: boolean = false): Promise<void> {
    // H7.4: 先从缓存找，找不到从磁盘加载
    let hook: Hook | null = this.hooksCache.find(h => h.id === hookId) ?? null
    if (!hook) {
      hook = await this.opts.storage.loadHook(hookId)
      if (!hook) return
    }

    if (permanent) {
      // 永久删除（如月任务清理 orphan 钩子）
      await this.opts.storage.deleteMemoryFile(hook.fileId)
      await this.opts.storage.deleteHook(hookId)
    } else {
      // H5.2 软删除：移入回收站
      hook.status = 'trashed'
      hook.trashedAt = Date.now()
      await this.opts.storage.saveHook(hook)
      await this.opts.storage.moveToTrash(hookId)
      await this.opts.storage.moveMemoryFileToTrash(hook.fileId)
    }

    // 更新缓存（Copy-on-Write）
    this.hooksCache = this.hooksCache.filter(h => h.id !== hookId)
  }

  /**
   * H5.2 新增：从回收站恢复钩子
   *
   * @param hookId 钩子 ID
   */
  async restoreHook(hookId: string): Promise<void> {
    await this.opts.storage.restoreFromTrash(hookId)
    // 重新加载该钩子到缓存
    const hook = await this.opts.storage.loadHook(hookId)
    if (hook) {
      hook.status = 'active'
      hook.trashedAt = undefined
      await this.opts.storage.saveHook(hook)
      this.hooksCache = [...this.hooksCache, hook]
      // H7.4: LRU 淘汰
      this.evictLRUHooks()
    }
  }

  /**
   * H5.2 新增：列出回收站中的钩子
   */
  async listTrashedHooks(): Promise<Hook[]> {
    return this.opts.storage.listTrashedHooks()
  }

  /**
   * H5.2 新增：清空回收站
   *
   * @param beforeTimestamp 只清理此时间戳之前移入回收站的项，0 或 undefined 表示全部
   */
  async emptyTrash(beforeTimestamp?: number): Promise<{ hooks: number; files: number }> {
    return this.opts.storage.emptyTrash(beforeTimestamp)
  }

  // ===== 事件系统 =====

  on(event: ArchiveEventName, listener: ArchiveEventListener): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(listener)
  }

  off(event: ArchiveEventName, listener: ArchiveEventListener): void {
    this.listeners.get(event)?.delete(listener)
  }

  private emit(event: ArchiveEventName, payload: unknown): void {
    this.listeners.get(event)?.forEach(listener => {
      try {
        listener(payload)
      } catch (err) {
        console.error(`[ArchiveManager] Event listener error for ${event}:`, err)
      }
    })
  }

  // ===== 内部方法 =====

  /**
   * Step 0: 预检查（P7 新增）
   */
  private preCheck(): { passed: boolean; reason?: string } {
    // 检查是否正在流式输出
    if (this.opts.agentBridge.isStreaming()) {
      return { passed: false, reason: 'Agent is streaming' }
    }

    // 检查消息数量
    const messages = this.opts.agentBridge.getCurrentMessages()
    const toArchive = messages.slice(this.boundary.current)
    if (toArchive.length < this.config.minArchiveMessages) {
      return {
        passed: false,
        reason: `Message count ${toArchive.length} < minArchiveMessages ${this.config.minArchiveMessages}`,
      }
    }

    return { passed: true }
  }

  /**
   * 应用排除模式（P6 新增）
   */
  private applyExclusionPatterns(messages: AgentMessageSnapshot[]): AgentMessageSnapshot[] {
    if (!this.config.exclusionPatterns || this.config.exclusionPatterns.length === 0) {
      return messages
    }

    const patterns = this.config.exclusionPatterns.map(p => {
      try {
        return new RegExp(p, 'i')
      } catch {
        return null
      }
    }).filter(Boolean) as RegExp[]

    if (patterns.length === 0) return messages

    return messages.filter(msg => {
      return !patterns.some(p => p.test(msg.content || ''))
    })
  }

  /**
   * 退避重试（P10 决策：1s/2s/4s）
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number,
    operationName: string
  ): Promise<T> {
    let lastError: unknown
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn()
      } catch (err) {
        lastError = err
        if (i < maxRetries - 1) {
          const delay = Math.pow(2, i) * 1000 // 1s, 2s, 4s
          console.warn(
            `[ArchiveManager] ${operationName} failed (attempt ${i + 1}/${maxRetries}), retrying in ${delay}ms:`,
            err
          )
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }
    throw lastError
  }

  /**
   * 更新访问统计（P16 决策：仅计主动检索）
   */
  private async updateAccessStats(hookIds: string[]): Promise<void> {
    const now = Date.now()
    for (const id of hookIds) {
      const hook = this.hooksCache.find(h => h.id === id)
      if (hook) {
        hook.accessCount++
        hook.activeAccessCount++ // P16: 主动检索访问
        hook.lastAccessedAt = now
      }
    }
    // 异步保存（不阻塞检索流程）
    for (const id of hookIds) {
      const hook = this.hooksCache.find(h => h.id === id)
      if (hook) {
        this.opts.storage.saveHook(hook).catch(err => {
          console.warn(`[ArchiveManager] Failed to save accessed hook ${id}:`, err)
        })
      }
    }
  }

  /**
   * H7.4：LRU 淘汰钩子，控制内存缓存大小
   *
   * 当 hooksCache 数量超过 config.hooksCacheMaxSize 时，按 lastAccessedAt 升序
   * 淘汰最久未访问的 active 且非 pinned 钩子。
   * 被淘汰的钩子仍存储在磁盘上，需要时通过 getHookWithFallback 按需加载。
   *
   * hooksCacheMaxSize = 0 时不淘汰。
   */
  private evictLRUHooks(): void {
    const maxSize = this.config.hooksCacheMaxSize ?? 0
    if (maxSize <= 0) return
    if (this.hooksCache.length <= maxSize) return

    // 分离可淘汰和不可淘汰的钩子
    // 不可淘汰：pinned 或 status !== 'active'（非活跃钩子需要调度器处理）
    const evictable = this.hooksCache.filter(h => !h.pinned && h.status === 'active')
    const protected_ = this.hooksCache.filter(h => h.pinned || h.status !== 'active')

    // 如果不可淘汰的已超过限制，无法继续淘汰
    if (protected_.length >= maxSize) {
      console.warn(
        `[ArchiveManager] H7.4: protected hooks (${protected_.length}) >= maxSize (${maxSize}), skipping eviction`
      )
      return
    }

    // 计算需要淘汰的数量
    const targetEvictable = maxSize - protected_.length
    const toEvict = evictable.length - targetEvictable
    if (toEvict <= 0) return

    // 按 lastAccessedAt 升序排序，淘汰最久未访问的
    const sortedEvictable = [...evictable].sort((a, b) => a.lastAccessedAt - b.lastAccessedAt)
    const evictedHooks = sortedEvictable.slice(0, toEvict)
    const evictedIds = new Set(evictedHooks.map(h => h.id))

    // 更新缓存：保留未被淘汰的钩子
    this.hooksCache = this.hooksCache.filter(h => !evictedIds.has(h.id))

    console.log(
      `[ArchiveManager] H7.4: LRU evicted ${toEvict} hooks, cache size: ${this.hooksCache.length}`
    )
  }

  /**
   * H7.4：获取钩子（带磁盘回退）
   *
   * 先从内存缓存查找，找不到则从磁盘按需加载。
   * 用于 loadChunk/tagHook/pinHook 等需要访问可能被 LRU 淘汰的钩子的方法。
   *
   * @param hookId 钩子 ID
   * @returns 钩子对象，找不到返回 null
   */
  private async getHookWithFallback(hookId: string): Promise<Hook | null> {
    const cached = this.hooksCache.find(h => h.id === hookId)
    if (cached) return cached
    // 从磁盘按需加载
    return this.opts.storage.loadHook(hookId)
  }

  /**
   * H7.4：更新缓存中的钩子副本
   *
   * 如果钩子在缓存中，更新它；如果不在（从磁盘加载的），不主动加入缓存
   * （避免频繁加载导致缓存膨胀，LRU 淘汰会在下次归档时统一处理）。
   *
   * @param hook 已修改的钩子
   */
  private updateHookInCache(hook: Hook): void {
    const inCache = this.hooksCache.some(h => h.id === hook.id)
    if (inCache) {
      this.hooksCache = this.hooksCache.map(h => (h.id === hook.id ? hook : h))
    }
  }

  /**
   * 创建 Agent 工具（P9 决策：4 个工具）
   */
  private createArchiveTools() {
    return [
      {
        name: 'archive_recall',
        description: '检索已归档的对话上下文记忆。当需要回顾之前的对话内容时使用。',
        parameters: {
          query: { type: 'string', required: false, description: '检索查询（list 模式可空）' },
          mode: {
            type: 'string',
            enum: ['keyword', 'semantic', 'hybrid', 'list'],
            default: 'hybrid',
          },
          topK: { type: 'number', default: 5 },
        },
        execute: async (args: Record<string, unknown>) => {
          const results = await this.recall({
            query: (args.query as string) || '',
            mode: (args.mode as RecallParams['mode']) || 'hybrid',
            topK: args.topK as number | undefined,
          })
          return results.map(r => ({
            hookId: r.hook.id,
            summary: r.hook.summary,
            score: r.score,
            matchedFields: r.matchedFields,
            chunkTitles: r.hook.chunkTitles.map(ct => ({
              chunkId: ct.chunkId,
              title: ct.title,
            })),
            createdAt: r.hook.createdAt,
          }))
        },
      },
      {
        name: 'archive_load_chunk',
        description: '加载指定归档记忆的指定主题块完整内容。recall 后需要查看具体对话时使用。',
        parameters: {
          hookId: { type: 'string', required: true },
          chunkId: { type: 'string', required: true },
        },
        execute: async (args: Record<string, unknown>) => {
          const chunk = await this.loadChunk(
            args.hookId as string,
            args.chunkId as string
          )
          return {
            chunkId: chunk.chunkId,
            title: chunk.title,
            outputType: chunk.outputType,
            messages: chunk.messages,
          }
        },
      },
      {
        name: 'archive_tag',
        description: '给归档记忆钩子打标签，标记重要记忆。',
        parameters: {
          hookId: { type: 'string', required: true },
          tags: { type: 'array', required: true, description: '标签列表' },
        },
        execute: async (args: Record<string, unknown>) => {
          await this.tagHook(args.hookId as string, args.tags as string[])
          return { success: true }
        },
      },
      {
        name: 'archive_now',
        description: '立即归档当前对话上下文。当对话过长需要压缩时使用。',
        parameters: {},
        execute: async () => {
          const result = await this.archive({ source: 'manual' })
          return {
            hookId: result.hookId,
            tokenCount: result.tokenCount,
            chunkCount: result.chunkCount,
          }
        },
      },
    ]
  }
}
