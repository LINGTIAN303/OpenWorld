/**
 * ChineseTokenizerAdapter - 中文分词器宿主实现（H2.2）
 *
 * 宿主层额外附挂的中文分词器，可对接 jieba、nodejieba、segmentit 等分词库。
 * 框架保持零硬依赖，此实现位于宿主层，按需启用。
 *
 * 使用方式：
 * 1. 安装分词库：pnpm add nodejieba（或 jieba-wasm 等）
 * 2. 在 useMemoryArchive.init() 中注入：
 *    ```ts
 *    const tokenizer = new ChineseTokenizerAdapter()
 *    archiveManager = new ArchiveManager({ ..., tokenizer })
 *    ```
 *
 * 未安装分词库时，isReady() 返回 false，框架自动降级到 SimpleTokenizerAdapter。
 *
 * 可额外附挂 jieba 等分词库以提升中文检索精度。
 */

import type { TokenizerAdapter } from '@worldsmith/memory-archive'

export class ChineseTokenizerAdapter implements TokenizerAdapter {
  /** 分词库实例（动态加载，避免硬依赖） */
  private segmenter: { cut: (text: string) => string[] } | null = null
  /** 初始化状态 */
  private initialized = false

  constructor() {
    this.tryLoadSegmenter()
  }

  /**
   * 尝试动态加载分词库
   *
   * 按优先级尝试加载：nodejieba > jieba-wasm > segmentit
   * 加载失败则保持未就绪状态，框架会降级到 SimpleTokenizerAdapter。
   */
  private tryLoadSegmenter(): void {
    // 尝试加载 nodejieba（原生模块，性能最佳）
    try {
      const nodejieba = require('nodejieba')
      this.segmenter = { cut: (text: string) => nodejieba.cut(text) }
      this.initialized = true
      console.log('[ChineseTokenizerAdapter] 使用 nodejieba 分词器')
      return
    } catch {
      // nodejieba 不可用，继续尝试其他库
    }

    // 尝试加载 segmentit（纯 JS 实现，无需原生编译）
    try {
      const { Segment, useDefault } = require('segmentit')
      const segment = new Segment()
      segment.use(useDefault)
      this.segmenter = { cut: (text: string) => segment.doSegment(text).map((item: { w: string }) => item.w) }
      this.initialized = true
      console.log('[ChineseTokenizerAdapter] 使用 segmentit 分词器')
      return
    } catch {
      // segmentit 不可用
    }

    console.log('[ChineseTokenizerAdapter] 未安装中文分词库，将降级到 SimpleTokenizerAdapter')
  }

  isReady(): boolean {
    return this.initialized && this.segmenter !== null
  }

  tokenize(text: string): string[] {
    if (!this.segmenter) return []
    const tokens = this.segmenter.cut(text)
    // 过滤空白和单字符停用词
    return tokens.filter(t => t.trim().length >= 2)
  }

  extractKeywords(text: string, maxCount: number = 10): string[] {
    if (!this.segmenter) return []
    // 尝试使用 nodejieba 的 extract 方法（TF-IDF）
    try {
      const nodejieba = require('nodejieba')
      if (typeof nodejieba.extract === 'function') {
        return nodejieba.extract(text, maxCount).map((item: { word: string }) => item.word)
      }
    } catch {
      // 降级到词频统计
    }
    // 降级：分词 + 词频统计
    const tokens = this.tokenize(text)
    const wordFreq = new Map<string, number>()
    for (const token of tokens) {
      wordFreq.set(token, (wordFreq.get(token) || 0) + 1)
    }
    return Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxCount)
      .map(([word]) => word)
  }
}
