/**
 * RecallEngine 单元测试（P9 四种检索模式）
 */
import { describe, it, expect, vi } from 'vitest'
import { RecallEngine } from '../src/core/RecallEngine'
import type { EmbeddingAdapter } from '../src/adapters/EmbeddingAdapter'
import type { Hook, RecallParams } from '../src/types'

function makeHook(overrides: Partial<Hook> = {}): Hook {
  return {
    id: 'hook-1',
    fileId: 'file-1',
    sessionId: 'session-1',
    projectId: 'project-1',
    createdAt: Date.now(),
    tokenCount: 1000,
    messageRange: { start: 0, end: 10 },
    chunkTitles: [
      {
        chunkId: 'c1',
        title: '角色设计讨论',
        outputType: 'creative',
        userMessageAnchor: '请帮我设计一个角色',
        tokenCount: 500,
      },
    ],
    keywords: ['角色', '设计', 'character'],
    tags: [],
    summary: '讨论了角色设计方案',
    summaryMethod: 'llm',
    accessCount: 0,
    activeAccessCount: 0,
    lastAccessedAt: Date.now(),
    decayScore: 1.0,
    status: 'active',
    importance: 0.5,
    pinned: false,
    relatedHookIds: [],
    source: 'threshold',
    version: '1.0',
    ...overrides,
  }
}

function makeMockEmbedding(ready: boolean = true): EmbeddingAdapter {
  return {
    isReady: () => ready,
    embed: vi.fn().mockResolvedValue([1, 0, 0]),
    embedBatch: vi.fn().mockResolvedValue([[1, 0, 0]]),
  }
}

describe('RecallEngine', () => {
  describe('list 模式', () => {
    it('返回所有 active 钩子', async () => {
      const hooks = [
        makeHook({ id: 'h1' }),
        makeHook({ id: 'h2' }),
        makeHook({ id: 'h3', status: 'deprecated' }), // 非 active，应被过滤
      ]
      const engine = new RecallEngine({
        embeddingAdapter: makeMockEmbedding(),
        getHooks: () => hooks,
        onAccessed: vi.fn().mockResolvedValue(undefined),
      })
      const results = await engine.recall({ query: '', mode: 'list' })
      expect(results).toHaveLength(2) // 只返回 active 钩子
      expect(results.map(r => r.hook.id)).toEqual(['h1', 'h2'])
    })

    it('list 模式 score 为 0', async () => {
      const hooks = [makeHook()]
      const engine = new RecallEngine({
        embeddingAdapter: makeMockEmbedding(),
        getHooks: () => hooks,
        onAccessed: vi.fn().mockResolvedValue(undefined),
      })
      const results = await engine.recall({ query: '', mode: 'list' })
      expect(results[0].score).toBe(0)
    })

    it('list 模式更新访问统计', async () => {
      const hooks = [makeHook({ id: 'h1' })]
      const onAccessed = vi.fn().mockResolvedValue(undefined)
      const engine = new RecallEngine({
        embeddingAdapter: makeMockEmbedding(),
        getHooks: () => hooks,
        onAccessed,
      })
      await engine.recall({ query: '', mode: 'list' })
      expect(onAccessed).toHaveBeenCalledWith(['h1'])
    })
  })

  describe('keyword 模式', () => {
    it('chunkTitle 匹配得分 +3', async () => {
      const hooks = [makeHook({ id: 'h1' })]
      const engine = new RecallEngine({
        embeddingAdapter: makeMockEmbedding(),
        getHooks: () => hooks,
        onAccessed: vi.fn().mockResolvedValue(undefined),
      })
      const results = await engine.recall({ query: '角色设计', mode: 'keyword' })
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].matchedFields).toContain('chunkTitle')
    })

    it('keywords 精确匹配得分 +4', async () => {
      const hooks = [makeHook({ id: 'h1', keywords: ['角色', '设计'] })]
      const engine = new RecallEngine({
        embeddingAdapter: makeMockEmbedding(),
        getHooks: () => hooks,
        onAccessed: vi.fn().mockResolvedValue(undefined),
      })
      const results = await engine.recall({ query: '角色', mode: 'keyword' })
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].matchedFields).toContain('keyword:exact')
    })

    it('summary 包含匹配得分 +1', async () => {
      const hooks = [makeHook({ id: 'h1', summary: '讨论了角色设计方案' })]
      const engine = new RecallEngine({
        embeddingAdapter: makeMockEmbedding(),
        getHooks: () => hooks,
        onAccessed: vi.fn().mockResolvedValue(undefined),
      })
      const results = await engine.recall({ query: '角色设计', mode: 'keyword' })
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].matchedFields).toContain('summary')
    })

    it('规则摘要降权（P10 决策，score × 0.8）', async () => {
      const llmHook = makeHook({ id: 'h1', summaryMethod: 'llm' as const })
      const ruleHook = makeHook({ id: 'h2', summaryMethod: 'rule' as const })
      const engine = new RecallEngine({
        embeddingAdapter: makeMockEmbedding(),
        getHooks: () => [llmHook, ruleHook],
        onAccessed: vi.fn().mockResolvedValue(undefined),
      })
      const results = await engine.recall({ query: '角色设计', mode: 'keyword' })
      const llmResult = results.find(r => r.hook.id === 'h1')
      const ruleResult = results.find(r => r.hook.id === 'h2')
      if (llmResult && ruleResult) {
        expect(ruleResult.score).toBeLessThan(llmResult.score)
      }
    })

    it('无匹配时返回空数组', async () => {
      const hooks = [makeHook({ id: 'h1' })]
      const engine = new RecallEngine({
        embeddingAdapter: makeMockEmbedding(),
        getHooks: () => hooks,
        onAccessed: vi.fn().mockResolvedValue(undefined),
      })
      const results = await engine.recall({ query: '完全不相关的查询xyz', mode: 'keyword' })
      expect(results).toHaveLength(0)
    })

    it('空查询返回空数组', async () => {
      const hooks = [makeHook()]
      const engine = new RecallEngine({
        embeddingAdapter: makeMockEmbedding(),
        getHooks: () => hooks,
        onAccessed: vi.fn().mockResolvedValue(undefined),
      })
      const results = await engine.recall({ query: '', mode: 'keyword' })
      expect(results).toHaveLength(0)
    })
  })

  describe('semantic 模式', () => {
    it('embedding 适配器未就绪时返回空数组', async () => {
      const hooks = [makeHook({ embedding: [1, 0, 0] })]
      const engine = new RecallEngine({
        embeddingAdapter: makeMockEmbedding(false),
        getHooks: () => hooks,
        onAccessed: vi.fn().mockResolvedValue(undefined),
      })
      const results = await engine.recall({ query: '测试', mode: 'semantic' })
      expect(results).toHaveLength(0)
    })

    it('无 embedding 的钩子被跳过', async () => {
      const hooks = [makeHook({ embedding: undefined })]
      const engine = new RecallEngine({
        embeddingAdapter: makeMockEmbedding(true),
        getHooks: () => hooks,
        onAccessed: vi.fn().mockResolvedValue(undefined),
      })
      const results = await engine.recall({ query: '测试', mode: 'semantic' })
      expect(results).toHaveLength(0)
    })

    it('余弦相似度匹配', async () => {
      const hooks = [makeHook({ id: 'h1', embedding: [1, 0, 0] })]
      const mockEmbedding: EmbeddingAdapter = {
        isReady: () => true,
        embed: vi.fn().mockResolvedValue([1, 0, 0]), // 完全相同
        embedBatch: vi.fn(),
      }
      const engine = new RecallEngine({
        embeddingAdapter: mockEmbedding,
        getHooks: () => hooks,
        onAccessed: vi.fn().mockResolvedValue(undefined),
      })
      const results = await engine.recall({ query: '测试', mode: 'semantic', minScore: 0.5 })
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].matchedFields).toContain('semantic')
    })
  })

  describe('hybrid 模式', () => {
    it('合并关键词和语义结果', async () => {
      const hooks = [
        makeHook({ id: 'h1', keywords: ['角色'], embedding: [1, 0, 0] }),
      ]
      const mockEmbedding: EmbeddingAdapter = {
        isReady: () => true,
        embed: vi.fn().mockResolvedValue([1, 0, 0]),
        embedBatch: vi.fn(),
      }
      const engine = new RecallEngine({
        embeddingAdapter: mockEmbedding,
        getHooks: () => hooks,
        onAccessed: vi.fn().mockResolvedValue(undefined),
      })
      const results = await engine.recall({ query: '角色', mode: 'hybrid' })
      expect(results.length).toBeGreaterThan(0)
      // 应同时包含 keyword 和 semantic 匹配字段
      expect(results[0].matchedFields).toContain('keyword:exact')
      expect(results[0].matchedFields).toContain('semantic')
    })

    it('合并同 hook 取最高分', async () => {
      const hooks = [makeHook({ id: 'h1', keywords: ['角色'], embedding: [1, 0, 0] })]
      const mockEmbedding: EmbeddingAdapter = {
        isReady: () => true,
        embed: vi.fn().mockResolvedValue([1, 0, 0]),
        embedBatch: vi.fn(),
      }
      const engine = new RecallEngine({
        embeddingAdapter: mockEmbedding,
        getHooks: () => hooks,
        onAccessed: vi.fn().mockResolvedValue(undefined),
      })
      const results = await engine.recall({ query: '角色', mode: 'hybrid' })
      // 同一个 hook 只出现一次
      expect(results.filter(r => r.hook.id === 'h1')).toHaveLength(1)
    })
  })

  describe('通用功能', () => {
    it('topK 限制返回数量', async () => {
      const hooks = [
        makeHook({ id: 'h1', keywords: ['角色'] }),
        makeHook({ id: 'h2', keywords: ['角色'] }),
        makeHook({ id: 'h3', keywords: ['角色'] }),
      ]
      const engine = new RecallEngine({
        embeddingAdapter: makeMockEmbedding(),
        getHooks: () => hooks,
        onAccessed: vi.fn().mockResolvedValue(undefined),
      })
      const results = await engine.recall({ query: '角色', mode: 'keyword', topK: 2 })
      expect(results).toHaveLength(2)
    })

    it('结果按分数降序排列', async () => {
      const hooks = [
        makeHook({ id: 'h1', keywords: ['角色'], activeAccessCount: 0 }),
        makeHook({ id: 'h2', keywords: ['角色'], activeAccessCount: 100 }),
      ]
      const engine = new RecallEngine({
        embeddingAdapter: makeMockEmbedding(),
        getHooks: () => hooks,
        onAccessed: vi.fn().mockResolvedValue(undefined),
      })
      const results = await engine.recall({ query: '角色', mode: 'keyword' })
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score)
    })

    it('时间范围过滤', async () => {
      const now = Date.now()
      const oldHook = makeHook({ id: 'h1', createdAt: now - 100000, keywords: ['角色'] })
      const newHook = makeHook({ id: 'h2', createdAt: now, keywords: ['角色'] })
      const engine = new RecallEngine({
        embeddingAdapter: makeMockEmbedding(),
        getHooks: () => [oldHook, newHook],
        onAccessed: vi.fn().mockResolvedValue(undefined),
      })
      const params: RecallParams = {
        query: '角色',
        mode: 'keyword',
        dateRange: { start: now - 1000, end: now + 1000 },
      }
      const results = await engine.recall(params)
      expect(results.every(r => r.hook.id === 'h2')).toBe(true)
    })

    it('输出类型过滤', async () => {
      const creativeHook = makeHook({
        id: 'h1',
        keywords: ['角色'],
        chunkTitles: [{ chunkId: 'c1', title: '创作', outputType: 'creative', userMessageAnchor: '锚点', tokenCount: 100 }],
      })
      const codeHook = makeHook({
        id: 'h2',
        keywords: ['角色'],
        chunkTitles: [{ chunkId: 'c2', title: '代码', outputType: 'code', userMessageAnchor: '锚点', tokenCount: 100 }],
      })
      const engine = new RecallEngine({
        embeddingAdapter: makeMockEmbedding(),
        getHooks: () => [creativeHook, codeHook],
        onAccessed: vi.fn().mockResolvedValue(undefined),
      })
      const results = await engine.recall({
        query: '角色',
        mode: 'keyword',
        outputTypes: ['creative'],
      })
      expect(results.every(r => r.hook.id === 'h1')).toBe(true)
    })

    it('检索后更新访问统计', async () => {
      const hooks = [makeHook({ id: 'h1', keywords: ['角色'] })]
      const onAccessed = vi.fn().mockResolvedValue(undefined)
      const engine = new RecallEngine({
        embeddingAdapter: makeMockEmbedding(),
        getHooks: () => hooks,
        onAccessed,
      })
      await engine.recall({ query: '角色', mode: 'keyword' })
      expect(onAccessed).toHaveBeenCalledWith(['h1'])
    })
  })
})
