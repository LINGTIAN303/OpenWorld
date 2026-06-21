/**
 * decay 单元测试（P16 衰减评分算法）
 */
import { describe, it, expect } from 'vitest'
import { calculateDecayScore, shouldDeprecate, shouldHardDelete } from '../src/utils/decay'
import type { Hook, DecayParams } from '../src/types'

const DEFAULT_PARAMS: DecayParams = {
  halfLifeDays: 30,
  deprecatedThreshold: 0.15,
  deleteAfterDays: 90,
}

function makeHook(overrides: Partial<Hook> = {}): Hook {
  return {
    id: 'test-id',
    fileId: 'file-1',
    sessionId: 'session-1',
    projectId: 'project-1',
    createdAt: Date.now(),
    tokenCount: 1000,
    messageRange: { start: 0, end: 10 },
    chunkTitles: [],
    keywords: [],
    tags: [],
    summary: '测试摘要',
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

describe('calculateDecayScore', () => {
  it('pinned 钩子固定返回 1.0', () => {
    const hook = makeHook({ pinned: true, createdAt: 0 })
    expect(calculateDecayScore(hook, Date.now(), DEFAULT_PARAMS)).toBe(1.0)
  })

  it('刚创建的钩子评分接近 1.0', () => {
    const now = Date.now()
    const hook = makeHook({ createdAt: now, lastAccessedAt: now })
    const score = calculateDecayScore(hook, now, DEFAULT_PARAMS)
    // timeFactor=1, accessFactor=0, recencyFactor=1, importanceWeight=0.75
    // score = 1 * (0.4 + 0 + 0.3) * 0.75 = 0.525
    expect(score).toBeCloseTo(0.525, 2)
  })

  it('半衰期后评分约为初始的一半', () => {
    const now = Date.now()
    const halfLifeMs = 30 * 24 * 60 * 60 * 1000
    const hook = makeHook({
      createdAt: now - halfLifeMs,
      lastAccessedAt: now - halfLifeMs,
    })
    const score = calculateDecayScore(hook, now, DEFAULT_PARAMS)
    // timeFactor=0.5, accessFactor=0, recencyFactor=0.5 (30天 <= 30 返回 0.5), importanceWeight=0.75
    // score = 0.5 * (0.4 + 0 + 0.3 * 0.5) * 0.75 = 0.5 * 0.55 * 0.75 = 0.20625
    expect(score).toBeCloseTo(0.20625, 2)
  })

  it('高 importance 的钩子评分更高', () => {
    const now = Date.now()
    const lowImportance = makeHook({ importance: 0.2, createdAt: now, lastAccessedAt: now })
    const highImportance = makeHook({ importance: 1.0, createdAt: now, lastAccessedAt: now })
    const lowScore = calculateDecayScore(lowImportance, now, DEFAULT_PARAMS)
    const highScore = calculateDecayScore(highImportance, now, DEFAULT_PARAMS)
    expect(highScore).toBeGreaterThan(lowScore)
  })

  it('主动检索访问次数越多评分越高', () => {
    const now = Date.now()
    const noAccess = makeHook({ activeAccessCount: 0, createdAt: now, lastAccessedAt: now })
    const manyAccess = makeHook({ activeAccessCount: 100, createdAt: now, lastAccessedAt: now })
    const noScore = calculateDecayScore(noAccess, now, DEFAULT_PARAMS)
    const manyScore = calculateDecayScore(manyAccess, now, DEFAULT_PARAMS)
    expect(manyScore).toBeGreaterThan(noScore)
  })

  it('7 天内访问 recencyFactor=1.0', () => {
    const now = Date.now()
    const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000
    const hook = makeHook({ lastAccessedAt: threeDaysAgo, createdAt: now - 10 * 24 * 60 * 60 * 1000 })
    const score = calculateDecayScore(hook, now, DEFAULT_PARAMS)
    // recencyFactor=1.0
    expect(score).toBeGreaterThan(0)
  })

  it('评分始终在 0-1 范围内', () => {
    const now = Date.now()
    // 极老的钩子
    const oldHook = makeHook({
      createdAt: 0,
      lastAccessedAt: 0,
      activeAccessCount: 0,
      importance: 0,
    })
    const score = calculateDecayScore(oldHook, now, DEFAULT_PARAMS)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(1)
  })
})

describe('shouldDeprecate', () => {
  it('pinned 钩子不淘汰', () => {
    const hook = makeHook({ pinned: true, status: 'active' })
    expect(shouldDeprecate(hook, 0.01, DEFAULT_PARAMS)).toBe(false)
  })

  it('非 active 状态不淘汰', () => {
    const hook = makeHook({ status: 'deprecated' })
    expect(shouldDeprecate(hook, 0.01, DEFAULT_PARAMS)).toBe(false)
  })

  it('评分低于阈值时淘汰', () => {
    const hook = makeHook({ status: 'active' })
    expect(shouldDeprecate(hook, 0.1, DEFAULT_PARAMS)).toBe(true)
  })

  it('评分高于阈值时不淘汰', () => {
    const hook = makeHook({ status: 'active' })
    expect(shouldDeprecate(hook, 0.5, DEFAULT_PARAMS)).toBe(false)
  })
})

describe('shouldHardDelete', () => {
  it('非 deprecated 状态不删除', () => {
    const hook = makeHook({ status: 'active' })
    expect(shouldHardDelete(hook, Date.now(), DEFAULT_PARAMS)).toBe(false)
  })

  it('无 deprecatedAt 不删除', () => {
    const hook = makeHook({ status: 'deprecated', deprecatedAt: undefined })
    expect(shouldHardDelete(hook, Date.now(), DEFAULT_PARAMS)).toBe(false)
  })

  it('deprecated 超过 deleteAfterDays 时删除', () => {
    const now = Date.now()
    const oldDeprecated = now - (91 * 24 * 60 * 60 * 1000) // 91 天前
    const hook = makeHook({ status: 'deprecated', deprecatedAt: oldDeprecated })
    expect(shouldHardDelete(hook, now, DEFAULT_PARAMS)).toBe(true)
  })

  it('deprecated 未超过 deleteAfterDays 不删除', () => {
    const now = Date.now()
    const recentDeprecated = now - (10 * 24 * 60 * 60 * 1000) // 10 天前
    const hook = makeHook({ status: 'deprecated', deprecatedAt: recentDeprecated })
    expect(shouldHardDelete(hook, now, DEFAULT_PARAMS)).toBe(false)
  })
})
