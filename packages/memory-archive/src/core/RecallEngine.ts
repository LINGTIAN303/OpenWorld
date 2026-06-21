/**
 * 检索引擎（P9 决策：4 种检索模式）
 *
 * 支持四种检索模式：
 * - keyword: 关键词检索
 * - semantic: 语义检索（向量余弦相似度）
 * - hybrid: 混合检索（关键词 + 语义）
 * - list: 返回所有钩子元数据（不排序不评分，P9 新增）
 *
 * P10 决策：规则摘要降权（score × 0.8）
 * P16 决策：检索时更新 activeAccessCount（仅计主动检索）
 * P3-5-2 优化：查询向量 LRU 缓存 + hook embedding norm 预计算
 */

import type { EmbeddingAdapter } from '../adapters/EmbeddingAdapter'
import type { TokenizerAdapter } from '../adapters/TokenizerAdapter'
import { SimpleTokenizerAdapter } from '../adapters/SimpleTokenizerAdapter'
import type { Hook, RecallParams, RecallResult } from '../types'

/** 查询向量缓存大小（LRU） */
const QUERY_VECTOR_CACHE_SIZE = 32

export interface RecallEngineOptions {
  embeddingAdapter: EmbeddingAdapter
  /** 获取当前所有钩子（从缓存读取快照） */
  getHooks: () => Hook[]
  /** 钩子访问后更新统计的回调 */
  onAccessed: (hookIds: string[]) => Promise<void>
  /** H2.2 分词器（可选，未注入时使用 SimpleTokenizerAdapter） */
  tokenizer?: TokenizerAdapter
}

export class RecallEngine {
  private opts: RecallEngineOptions
  /** H2.2 分词器实例 */
  private tokenizer: TokenizerAdapter

  /** P3-5-2：查询向量 LRU 缓存（key=query 文本） */
  private queryVectorCache: Map<string, number[]> = new Map()

  /** P3-5-2：hook embedding norm 预计算缓存（key=hook.id） */
  private hookNormCache: Map<string, number> = new Map()

  /** P3-5-2：缓存的 hook id 集合，用于检测缓存失效 */
  private cachedHookIds: Set<string> = new Set()

  /** H7.3：关键词倒排索引（keyword(lowercase) → Set<hookId>） */
  private invertedIndex: Map<string, Set<string>> = new Map()

  /** H7.3：倒排索引对应的 hook id 集合，用于检测索引失效 */
  private indexedHookIds: Set<string> = new Set()

  constructor(options: RecallEngineOptions) {
    this.opts = options
    this.tokenizer = options.tokenizer ?? new SimpleTokenizerAdapter()
  }

  /**
   * 执行检索
   */
  async recall(params: RecallParams): Promise<RecallResult[]> {
    const hooks = this.opts.getHooks().filter(h => h.status === 'active')

    // P3-5-2：检测 hook 列表变化，失效 norm 缓存
    this.invalidateNormCacheIfNeeded(hooks)
    // H7.3：检测 hook 列表变化，重建倒排索引
    this.rebuildInvertedIndexIfNeeded(hooks)

    // list 模式：返回所有钩子元数据（不排序不评分）
    if (params.mode === 'list') {
      const filtered = this.applyFilters(hooks, params)
      const results: RecallResult[] = filtered.map(hook => ({
        hook,
        score: 0,
        matchedFields: [],
      }))
      // 更新访问统计
      if (results.length > 0) {
        await this.opts.onAccessed(results.map(r => r.hook.id))
      }
      return results
    }

    // keyword / semantic / hybrid 模式
    let results: RecallResult[] = []

    if (params.mode === 'keyword' || params.mode === 'hybrid') {
      const keywordResults = this.keywordSearch(hooks, params.query, params.minScore || 0.25)
      if (params.mode === 'keyword') {
        results = keywordResults
      } else {
        // hybrid: 合并关键词和语义结果
        const semanticResults = await this.semanticSearch(hooks, params.query, params.minScore || 0.25)
        results = this.mergeResults(keywordResults, semanticResults)
      }
    } else if (params.mode === 'semantic') {
      results = await this.semanticSearch(hooks, params.query, params.minScore || 0.25)
    }

    // 应用过滤
    results = this.applyFiltersToResults(results, params)

    // 排序并取 topK
    const topK = params.topK || 5
    results.sort((a, b) => b.score - a.score)
    results = results.slice(0, topK)

    // 更新访问统计（P16 决策：仅计主动检索）
    if (results.length > 0) {
      await this.opts.onAccessed(results.map(r => r.hook.id))
    }

    return results
  }

  /**
   * P3-5-2：检测 hook 列表变化，失效 norm 缓存
   *
   * 当 hook 数量或 id 集合变化时，清空 norm 缓存。
   * 这是一种简单的失效策略，避免逐个检测。
   */
  private invalidateNormCacheIfNeeded(hooks: Hook[]): void {
    const currentIds = new Set(hooks.map(h => h.id))
    if (currentIds.size !== this.cachedHookIds.size) {
      // 数量变化，直接失效
      this.hookNormCache.clear()
      this.cachedHookIds = currentIds
      return
    }
    // 数量相同，检测 id 是否一致
    for (const id of currentIds) {
      if (!this.cachedHookIds.has(id)) {
        this.hookNormCache.clear()
        this.cachedHookIds = currentIds
        return
      }
    }
  }

  /**
   * H7.3：构建/更新关键词倒排索引
   *
   * 当 hook 列表变化时重建倒排索引（keyword → Set<hookId>）。
   * 索引覆盖 hook.keywords 和 chunkTitles 中的关键词，
   * 用于 keywordSearch 的候选集筛选，避免全量线性扫描。
   */
  private rebuildInvertedIndexIfNeeded(hooks: Hook[]): void {
    const currentIds = new Set(hooks.map(h => h.id))
    // 检测 hook id 集合是否变化
    let needsRebuild = false
    if (currentIds.size !== this.indexedHookIds.size) {
      needsRebuild = true
    } else {
      for (const id of currentIds) {
        if (!this.indexedHookIds.has(id)) {
          needsRebuild = true
          break
        }
      }
    }
    if (!needsRebuild) return

    // 重建倒排索引
    this.invertedIndex.clear()
    this.indexedHookIds = currentIds

    for (const hook of hooks) {
      // 索引 keywords
      for (const kw of hook.keywords) {
        const kwLower = kw.toLowerCase()
        if (!this.invertedIndex.has(kwLower)) {
          this.invertedIndex.set(kwLower, new Set())
        }
        this.invertedIndex.get(kwLower)!.add(hook.id)
      }
      // 索引 chunkTitles（用于子串匹配的候选集加速）
      for (const ct of hook.chunkTitles) {
        const titleLower = ct.title.toLowerCase()
        if (titleLower) {
          if (!this.invertedIndex.has(titleLower)) {
            this.invertedIndex.set(titleLower, new Set())
          }
          this.invertedIndex.get(titleLower)!.add(hook.id)
        }
      }
    }
  }

  /**
   * H7.3：通过倒排索引筛选候选钩子
   *
   * 对查询词分词后，在倒排索引中查找包含任一查询词的钩子 id 集合。
   * 返回候选钩子列表（去重），供 keywordSearch 做详细评分。
   *
   * 注意：倒排索引只覆盖 keywords 和 chunkTitles，
   * summary 和 userMessageAnchor 的子串匹配仍需全量扫描。
   * 但由于这两类匹配命中率低且评分权重小，可接受漏检。
   * 若需要精确匹配，调用方可传 null 跳过索引筛选。
   */
  private getCandidatesViaIndex(hooks: Hook[], queryWords: Set<string>): Hook[] {
    if (queryWords.size === 0 || this.invertedIndex.size === 0) {
      return hooks
    }
    const candidateIds = new Set<string>()
    for (const word of queryWords) {
      // 精确匹配
      const exact = this.invertedIndex.get(word)
      if (exact) {
        for (const id of exact) candidateIds.add(id)
      }
      // 前缀/包含匹配（扫描索引 key，性能优于扫描全部 hooks）
      for (const [indexKey, hookIds] of this.invertedIndex) {
        if (indexKey !== word && (indexKey.includes(word) || word.includes(indexKey))) {
          for (const id of hookIds) candidateIds.add(id)
        }
      }
    }
    // 返回候选钩子（保持原始顺序）
    return hooks.filter(h => candidateIds.has(h.id))
  }

  /**
   * P3-5-2：获取查询向量（带 LRU 缓存）
   */
  private async getQueryVector(query: string): Promise<number[] | null> {
    // 检查缓存
    const cached = this.queryVectorCache.get(query)
    if (cached) {
      // LRU：移到末尾（Map 保持插入顺序，删除再添加）
      this.queryVectorCache.delete(query)
      this.queryVectorCache.set(query, cached)
      return cached
    }

    // 生成新向量
    try {
      const vec = await this.opts.embeddingAdapter.embed(query)
      // LRU 淘汰
      if (this.queryVectorCache.size >= QUERY_VECTOR_CACHE_SIZE) {
        const oldestKey = this.queryVectorCache.keys().next().value
        if (oldestKey) {
          this.queryVectorCache.delete(oldestKey)
        }
      }
      this.queryVectorCache.set(query, vec)
      return vec
    } catch (err) {
      console.warn('[RecallEngine] Query embedding failed:', err)
      return null
    }
  }

  /**
   * P3-5-2：获取 hook embedding 的预计算 norm（带缓存）
   */
  private getHookNorm(hook: Hook): number {
    const cached = this.hookNormCache.get(hook.id)
    if (cached !== undefined) return cached

    if (!hook.embedding) {
      return 0
    }
    const norm = Math.sqrt(hook.embedding.reduce((sum, v) => sum + v * v, 0))
    this.hookNormCache.set(hook.id, norm)
    return norm
  }

  /**
   * 关键词检索
   *
   * H7.3 优化：先通过倒排索引筛选候选钩子（keywords + chunkTitles 匹配），
   * 再合并 summary/userMessageAnchor 子串匹配的钩子，避免漏检。
   *
   * 评分规则：
   * - chunkTitle 匹配 +3
   * - keywords 精确匹配 +4
   * - keywords 包含 +1
   * - summary 包含 +1
   * - userMessageAnchor 包含 +2
   * - 加权：score += activeAccessCount * 0.05
   * - 规则摘要降权：score *= 0.8（P10 决策）
   */
  private keywordSearch(hooks: Hook[], query: string, minScore: number): RecallResult[] {
    if (!query) return []
    const queryLower = query.toLowerCase()
    // H2.2: 使用 tokenizer 分词（支持中文分词库），降级为空格分词
    const queryWords = new Set(
      this.tokenizer.isReady()
        ? this.tokenizer.tokenize(queryLower)
        : queryLower.split(/\s+/).filter(w => w.length > 0)
    )

    // H7.3: 通过倒排索引筛选候选钩子（keywords + chunkTitles 匹配）
    const indexCandidates = this.getCandidatesViaIndex(hooks, queryWords)
    const candidateIds = new Set(indexCandidates.map(h => h.id))

    // H7.3: 全量扫描 summary 和 userMessageAnchor 子串匹配（避免漏检）
    // 这两类匹配无法通过倒排索引加速，但命中率低，全量扫描可接受
    for (const hook of hooks) {
      if (candidateIds.has(hook.id)) continue
      let matched = false
      if (hook.summary && hook.summary.toLowerCase().includes(queryLower)) {
        matched = true
      }
      if (!matched) {
        for (const ct of hook.chunkTitles) {
          if (ct.userMessageAnchor.toLowerCase().includes(queryLower)) {
            matched = true
            break
          }
        }
      }
      if (matched) candidateIds.add(hook.id)
    }

    // 构建候选钩子列表（保持原始顺序）
    const candidateHooks = hooks.filter(h => candidateIds.has(h.id))

    const results: RecallResult[] = []

    for (const hook of candidateHooks) {
      let score = 0
      const matchedFields: string[] = []

      // chunkTitle 匹配
      for (const ct of hook.chunkTitles) {
        if (ct.title.toLowerCase().includes(queryLower)) {
          score += 3
          matchedFields.push('chunkTitle')
          break
        }
      }

      // keywords 匹配
      for (const kw of hook.keywords) {
        const kwLower = kw.toLowerCase()
        // 精确匹配（queryWords 中包含该关键词）
        if (queryWords.has(kwLower)) {
          score += 4
          matchedFields.push('keyword:exact')
          break
        }
        // 包含匹配
        if (queryLower.includes(kwLower) || kwLower.includes(queryLower)) {
          score += 1
          if (!matchedFields.includes('keyword:partial')) {
            matchedFields.push('keyword:partial')
          }
        }
      }

      // summary 包含
      if (hook.summary && hook.summary.toLowerCase().includes(queryLower)) {
        score += 1
        matchedFields.push('summary')
      }

      // userMessageAnchor 包含
      for (const ct of hook.chunkTitles) {
        if (ct.userMessageAnchor.toLowerCase().includes(queryLower)) {
          score += 2
          matchedFields.push('userMessageAnchor')
          break
        }
      }

      if (score === 0) continue

      // 加权：访问频次
      score += hook.activeAccessCount * 0.05

      // P10 决策：规则摘要降权
      if (hook.summaryMethod === 'rule') {
        score *= 0.8
      }

      if (score >= minScore) {
        results.push({ hook, score, matchedFields })
      }
    }

    return results
  }

  /**
   * 语义检索（向量余弦相似度）
   *
   * P3-5-2 优化：
   * - 查询向量 LRU 缓存（避免重复 embed 同一 query）
   * - hook embedding norm 预计算缓存（避免每次检索重复计算）
   */
  private async semanticSearch(
    hooks: Hook[],
    query: string,
    minScore: number
  ): Promise<RecallResult[]> {
    if (!this.opts.embeddingAdapter.isReady()) {
      return []
    }

    if (!query) return []

    // P3-5-2：使用缓存的查询向量
    const queryVec = await this.getQueryVector(query)
    if (!queryVec) return []

    const results: RecallResult[] = []

    for (const hook of hooks) {
      if (!hook.embedding) continue

      // P3-5-2：使用预计算的 norm
      const similarity = cosineSimilarityWithNorm(queryVec, hook.embedding, this.getHookNorm(hook))
      if (similarity >= minScore) {
        // 语义分 ×5 对齐关键词分量纲
        const score = similarity * 5
        const matchedFields = ['semantic']

        // P10 决策：规则摘要降权
        const finalScore = hook.summaryMethod === 'rule' ? score * 0.8 : score

        results.push({ hook, score: finalScore, matchedFields })
      }
    }

    return results
  }

  /**
   * 混合合并（hybrid 模式）
   * 合并同 hook 取最高分
   */
  private mergeResults(
    keywordResults: RecallResult[],
    semanticResults: RecallResult[]
  ): RecallResult[] {
    const map = new Map<string, RecallResult>()

    for (const r of keywordResults) {
      map.set(r.hook.id, { ...r, matchedFields: [...r.matchedFields] })
    }

    for (const r of semanticResults) {
      const existing = map.get(r.hook.id)
      if (existing) {
        // 合并同 hook 取最高分
        existing.score = Math.max(existing.score, r.score)
        existing.matchedFields = [...new Set([...existing.matchedFields, ...r.matchedFields])]
      } else {
        map.set(r.hook.id, { ...r, matchedFields: [...r.matchedFields] })
      }
    }

    return Array.from(map.values())
  }

  /**
   * 应用过滤器
   */
  private applyFilters(hooks: Hook[], params: RecallParams): Hook[] {
    let filtered = hooks

    // 时间范围过滤
    if (params.dateRange) {
      filtered = filtered.filter(h => {
        return (
          h.createdAt >= params.dateRange!.start && h.createdAt <= params.dateRange!.end
        )
      })
    }

    // 输出类型过滤
    if (params.outputTypes && params.outputTypes.length > 0) {
      filtered = filtered.filter(h =>
        h.chunkTitles.some(ct => params.outputTypes!.includes(ct.outputType))
      )
    }

    return filtered
  }

  /**
   * 对结果应用过滤器
   */
  private applyFiltersToResults(results: RecallResult[], params: RecallParams): RecallResult[] {
    let filtered = results

    // 时间范围过滤
    if (params.dateRange) {
      filtered = filtered.filter(r => {
        return (
          r.hook.createdAt >= params.dateRange!.start &&
          r.hook.createdAt <= params.dateRange!.end
        )
      })
    }

    // 输出类型过滤
    if (params.outputTypes && params.outputTypes.length > 0) {
      filtered = filtered.filter(r =>
        r.hook.chunkTitles.some(ct => params.outputTypes!.includes(ct.outputType))
      )
    }

    return filtered
  }
}

/**
 * P3-5-2：使用预计算 norm 的余弦相似度
 *
 * 避免每次检索都重新计算 hook embedding 的 norm。
 * queryVec 的 norm 仍需实时计算（因为 query 可能变化）。
 */
function cosineSimilarityWithNorm(a: number[], b: number[], normB: number): number {
  if (a.length !== b.length || normB === 0) return 0
  let dotProduct = 0
  let normA = 0
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
  }
  if (normA === 0) return 0
  return dotProduct / (Math.sqrt(normA) * normB)
}
