/**
 * 衰减评分算法（P16 优化）
 *
 * P16 决策：增加 recency 和 importance 因子，区分主动/自动访问
 *
 * 新公式：
 *   score = timeFactor × (0.4 + 0.3 × accessFactor + 0.3 × recencyFactor) × importanceWeight
 *
 * 其中：
 * - timeFactor: 半衰期模型，Math.pow(0.5, ageDays / halfLifeDays)
 * - accessFactor: 仅计主动检索访问，Math.log(1 + activeAccessCount) / Math.log(10)
 * - recencyFactor: 7天内=1.0, 30天内=0.5, 超过30天=0
 * - importanceWeight: 0.5 + importance × 0.5（范围 0.5-1.0）
 *
 * pinned 钩子跳过衰减，固定返回 1.0
 */

import type { DecayParams, Hook } from '../types'

export function calculateDecayScore(hook: Hook, now: number, params: DecayParams): number {
  // pinned 钩子跳过衰减（P16 决策）
  if (hook.pinned) return 1.0

  const ageDays = (now - hook.createdAt) / (24 * 60 * 60 * 1000)

  // 时间衰减因子：半衰期模型
  const timeFactor = Math.pow(0.5, ageDays / params.halfLifeDays)

  // 访问频次因子：仅计主动检索访问（P16 决策）
  const accessFactor = Math.log(1 + hook.activeAccessCount) / Math.log(10)

  // 最近访问因子（P16 新增）
  const daysSinceLastAccess = (now - hook.lastAccessedAt) / (24 * 60 * 60 * 1000)
  let recencyFactor: number
  if (daysSinceLastAccess <= 7) recencyFactor = 1.0
  else if (daysSinceLastAccess <= 30) recencyFactor = 0.5
  else recencyFactor = 0

  // 重要性权重（P16 新增）
  const importanceWeight = 0.5 + hook.importance * 0.5

  // 综合评分（P16 新公式）
  const score =
    timeFactor * (0.4 + 0.3 * accessFactor + 0.3 * recencyFactor) * importanceWeight
  return Math.max(0, Math.min(1, score))
}

/**
 * 判断钩子是否应该被标记为 deprecated
 */
export function shouldDeprecate(hook: Hook, decayScore: number, params: DecayParams): boolean {
  if (hook.pinned) return false
  if (hook.status !== 'active') return false
  return decayScore < params.deprecatedThreshold
}

/**
 * 判断 deprecated 钩子是否应该被硬删除
 */
export function shouldHardDelete(hook: Hook, now: number, params: DecayParams): boolean {
  if (hook.status !== 'deprecated') return false
  if (!hook.deprecatedAt) return false
  const daysSinceDeprecated = (now - hook.deprecatedAt) / (24 * 60 * 60 * 1000)
  return daysSinceDeprecated > params.deleteAfterDays
}
