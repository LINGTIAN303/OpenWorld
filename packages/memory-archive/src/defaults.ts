/**
 * 默认配置（含 P6 新增的 5 个配置项）
 */

import type { ArchiveConfig } from './types'

export const DEFAULT_ARCHIVE_CONFIG: ArchiveConfig = {
  archiveThreshold: 400000,
  minArchiveMessages: 10,

  triggers: {
    onTokenThreshold: true,
    onSessionEnd: true,
    manual: true,
  },

  scheduler: {
    enabled: true,
    dailyHour: 3,
    weeklyDay: 0,
    monthlyDay: 1,
  },

  decay: {
    halfLifeDays: 30,
    deprecatedThreshold: 0.15,
    deleteAfterDays: 90,
  },

  injection: {
    autoInjectRecentCount: 2,
    maxSummaryTokens: 2000,
  },

  chunking: {
    strategy: 'topic',
    minChunkTokens: 2000,
    maxChunkTokens: 20000,
  },

  embedding: {
    model: 'text-embedding-3-small',
    dimension: 1536,
    batchSize: 100,
  },

  summary: {
    enabled: true,
    maxLength: 5000,
    method: 'llm',
  },

  maxHooks: 1000,
  maxStorageMB: 500,

  exclusionPatterns: [],

  // ===== H 系列修复新增配置 =====

  /** H1.4 阈值动态范围下限（archiveThreshold * 0.75） */
  archiveThresholdMin: 300000,

  /** H1.4 阈值动态范围上限（archiveThreshold * 1.25） */
  archiveThresholdMax: 500000,

  /** H4.3 归档后注入的摘要数量上限 */
  maxInjectedSummaries: 3,

  /** H2.5 检索默认 minScore（前端可配置） */
  defaultMinScore: 0.25,

  /** H7.4 钩子内存缓存 LRU 最大数量（0 表示不淘汰） */
  hooksCacheMaxSize: 200,

  /** H5.2 回收站保留天数（超过后月任务自动清空） */
  trashRetentionDays: 7,
}
