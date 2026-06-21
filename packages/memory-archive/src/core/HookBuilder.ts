/**
 * 索引钩子构建器
 *
 * 归档时构建 Hook 对象（元数据 + 记忆文件引用 + 内部标题 + 关键词 + 向量）。
 * 调用 chunker 进行主题分块，提取块标题。
 * 调用 EmbeddingAdapter 生成向量。
 * 调用 LlmAdapter 生成摘要、关键词、重要性评分。
 */

import { nanoid } from 'nanoid'
import type { EmbeddingAdapter } from '../adapters/EmbeddingAdapter'
import type { LlmAdapter } from '../adapters/LlmAdapter'
import type {
  AgentMessageSnapshot,
  ArchiveTriggerOptions,
  ChunkTitle,
  Hook,
  MemoryChunk,
} from '../types'
import { chunkMessages, extractChunkTitles, type ChunkingConfig } from '../utils/chunker'
import { countMessagesTokens } from '../utils/tokenCounter'

export interface HookBuilderOptions {
  projectId: string
  sessionId: string
  chunkingConfig: ChunkingConfig
  embeddingAdapter: EmbeddingAdapter
  llmAdapter: LlmAdapter
  summaryEnabled: boolean
  summaryMaxLength: number
}

export interface BuildHookResult {
  hook: Hook
  chunks: MemoryChunk[]
  summaryMethod: 'llm' | 'rule' | 'none'
}

export class HookBuilder {
  private opts: HookBuilderOptions

  constructor(options: HookBuilderOptions) {
    this.opts = options
  }

  /**
   * 更新会话 ID（会话切换时调用）
   *
   * P3-2-3 新增：支持会话切换时更新 sessionId，避免重新初始化整个 HookBuilder。
   * 影响后续构建的钩子元数据中的 sessionId 字段。
   */
  updateSessionId(sessionId: string): void {
    this.opts.sessionId = sessionId
  }

  /**
   * 更新分块配置
   *
   * P3-4 新增：支持运行时修改分块参数（minChunkTokens/maxChunkTokens）。
   */
  updateChunkingConfig(config: ChunkingConfig): void {
    this.opts.chunkingConfig = config
  }

  /**
   * 更新摘要配置
   *
   * P3-4 新增：支持运行时修改摘要开关和最大长度。
   */
  updateSummaryConfig(enabled: boolean, maxLength: number): void {
    this.opts.summaryEnabled = enabled
    this.opts.summaryMaxLength = maxLength
  }

  /**
   * 构建钩子（P7 决策：Step 4 摘要和 Step 5 向量并行执行）
   *
   * @param messages 待归档的消息列表
   * @param messageRange 消息范围
   * @param trigger 归档触发源
   */
  async build(
    messages: AgentMessageSnapshot[],
    messageRange: { start: number; end: number },
    trigger: ArchiveTriggerOptions
  ): Promise<BuildHookResult> {
    const now = Date.now()

    // Step 2: 主题分块
    const chunks = chunkMessages(messages, this.opts.chunkingConfig)
    const chunkTitles: ChunkTitle[] = extractChunkTitles(chunks)

    // Step 4 & 5: 并行生成摘要和向量（P7 优化）
    const summaryResult = await this.generateSummary(chunks, messages)
    const embedding = await this.generateEmbedding(summaryResult.summary)

    // 提取关键词
    const keywords = await this.opts.llmAdapter.extractKeywords(
      messages.map(m => ({ role: m.role, content: m.content }))
    )

    // 评估重要性
    const importance = await this.opts.llmAdapter.assessImportance(
      messages.map(m => ({ role: m.role, content: m.content }))
    )

    // 计算总 token 数
    const tokenCount = countMessagesTokens(messages)

    // 生成 fileId
    const fileId = `f_${nanoid(12)}`
    const hookId = `h_${nanoid(12)}`

    // Step 6: 构建钩子
    const hook: Hook = {
      id: hookId,
      fileId,
      sessionId: this.opts.sessionId,
      projectId: this.opts.projectId,
      createdAt: now,
      tokenCount,
      messageRange,
      chunkTitles,
      keywords,
      tags: [],
      embedding,
      summary: summaryResult.summary,
      summaryMethod: summaryResult.method,
      accessCount: 0,
      activeAccessCount: 0,
      lastAccessedAt: now,
      decayScore: 1.0,
      status: 'active',
      importance,
      pinned: false,
      relatedHookIds: [],
      source: trigger.source,
      version: '1.0',
    }

    return {
      hook,
      chunks,
      summaryMethod: summaryResult.method,
    }
  }

  /**
   * 生成摘要（P7 Step 4）
   * 方式 A（默认）：LLM 生成摘要
   * 方式 B（降级）：规则提取，标记 summaryMethod='rule'
   * 方式 C（关闭）：summary 为空，summaryMethod='none'
   */
  private async generateSummary(
    _chunks: MemoryChunk[],
    messages: AgentMessageSnapshot[]
  ): Promise<{ summary: string; method: 'llm' | 'rule' | 'none' }> {
    // 方式 C：摘要关闭
    if (!this.opts.summaryEnabled) {
      return { summary: '', method: 'none' }
    }

    const messageContents = messages.map(m => ({ role: m.role, content: m.content }))

    // 方式 A：LLM 生成
    if (this.opts.llmAdapter.isReady()) {
      try {
        const summary = await this.opts.llmAdapter.summarize(
          messageContents,
          this.opts.summaryMaxLength
        )
        return { summary, method: 'llm' }
      } catch (err) {
        console.warn('[HookBuilder] LLM summarize failed, falling back to rule:', err)
      }
    }

    // 方式 B：规则降级（RuleBasedLlmAdapter 始终可用）
    const ruleAdapter = this.opts.llmAdapter
    const summary = await ruleAdapter.summarize(messageContents, this.opts.summaryMaxLength)
    return { summary, method: 'rule' }
  }

  /**
   * 生成向量（P7 Step 5）
   * if EmbeddingAdapter.isReady(): embed(summary)
   * else: undefined（等日任务补全）
   */
  private async generateEmbedding(summary: string): Promise<number[] | undefined> {
    if (!summary) return undefined
    if (!this.opts.embeddingAdapter.isReady()) return undefined
    try {
      return await this.opts.embeddingAdapter.embed(summary)
    } catch (err) {
      console.warn('[HookBuilder] Embedding failed, will be补全 by daily task:', err)
      return undefined
    }
  }
}
