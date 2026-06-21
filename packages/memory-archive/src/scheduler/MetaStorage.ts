/**
 * MetaStorage - 记忆库元数据与任务日志存储（P18 决策）
 *
 * 管理 meta.json 和 logs/ 目录，为周期任务提供基础设施：
 * - meta.json：记忆库元数据（版本、统计、最后执行时间、失败队列）
 * - logs/：任务执行日志（保留 30 天）
 *
 * P18 决策要点：
 * - meta.json 损坏时从 hooks/ 目录重建
 * - 任务日志保留 30 天
 * - 失败删除队列记录到 meta.failedDeletions[]
 */

import type { FsOperations } from '../adapters/FsOperations'
import type { ArchiveMeta, Hook, TaskLogEntry } from '../types'

/** 日志保留天数（P18 决策：30 天） */
const LOG_RETENTION_DAYS = 30

export class MetaStorage {
  private basePath: string
  private fs: FsOperations

  constructor(basePath: string, fs: FsOperations) {
    this.basePath = basePath
    this.fs = fs
  }

  // ===== meta.json 读写 =====

  private get metaPath(): string {
    return `${this.basePath}/meta.json`
  }

  private get logsDir(): string {
    return `${this.basePath}/logs`
  }

  private get hooksDir(): string {
    return `${this.basePath}/hooks`
  }

  /**
   * 加载 meta.json
   *
   * meta.json 不存在时返回默认值（不抛错）。
   * meta.json 解析失败时触发重建。
   */
  async loadMeta(): Promise<ArchiveMeta> {
    const path = this.metaPath
    if (!(await this.fs.exists(path))) {
      return this.createDefaultMeta()
    }

    try {
      const content = await this.fs.readFile(path)
      const parsed = JSON.parse(content) as ArchiveMeta
      return this.normalizeMeta(parsed)
    } catch (err) {
      console.warn('[MetaStorage] meta.json 解析失败，触发重建:', err)
      return this.rebuildMetaFromHooks()
    }
  }

  /**
   * 保存 meta.json
   */
  async saveMeta(meta: ArchiveMeta): Promise<void> {
    const dir = this.basePath
    if (!(await this.fs.exists(dir))) {
      await this.fs.mkdir(dir, true)
    }
    await this.fs.writeFile(this.metaPath, JSON.stringify(meta, null, 2))
  }

  /**
   * P18 决策：从 hooks/ 目录重建 meta.json
   *
   * 遍历所有 hook 文件，重新计算统计信息。
   * 保留 lastDailyRun/lastWeeklyRun/lastMonthlyRun 为 0（无法恢复）。
   * 清空 failedDeletions（重建时无法判断哪些删除失败）。
   */
  async rebuildMetaFromHooks(): Promise<ArchiveMeta> {
    const hooks = await this.loadAllHooksFromFs()
    const fileIds = new Set(hooks.map(h => h.fileId))

    const meta = this.createDefaultMeta()
    meta.totalHooks = hooks.length
    meta.totalFiles = fileIds.size
    meta.totalStorageBytes = await this.calculateStorageBytes()

    await this.saveMeta(meta)
    console.log('[MetaStorage] meta.json 已从 hooks 重建:', {
      totalHooks: meta.totalHooks,
      totalFiles: meta.totalFiles,
    })

    return meta
  }

  // ===== 任务日志（P18：保留 30 天） =====

  /**
   * 追加任务日志
   *
   * 日志按日组织：logs/{YYYY-MM-DD}.json，每日一个文件，数组追加。
   */
  async appendTaskLog(log: TaskLogEntry): Promise<void> {
    const dir = this.logsDir
    if (!(await this.fs.exists(dir))) {
      await this.fs.mkdir(dir, true)
    }

    const dateStr = this.formatDate(log.startTime)
    const path = `${dir}/${dateStr}.json`

    // 读取现有日志（如果存在）
    let logs: TaskLogEntry[] = []
    if (await this.fs.exists(path)) {
      try {
        const content = await this.fs.readFile(path)
        logs = JSON.parse(content) as TaskLogEntry[]
      } catch {
        // 解析失败则覆盖
        logs = []
      }
    }

    logs.push(log)
    await this.fs.writeFile(path, JSON.stringify(logs, null, 2))
  }

  /**
   * 加载任务日志
   *
   * @param dateRange 可选的时间范围过滤（按 startTime 过滤）
   */
  async loadTaskLogs(dateRange?: { start: number; end: number }): Promise<TaskLogEntry[]> {
    const dir = this.logsDir
    if (!(await this.fs.exists(dir))) return []

    const files = await this.fs.readDir(dir)
    const allLogs: TaskLogEntry[] = []

    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const content = await this.fs.readFile(`${dir}/${file}`)
        const logs = JSON.parse(content) as TaskLogEntry[]
        allLogs.push(...logs)
      } catch {
        // 跳过解析失败的文件
      }
    }

    if (dateRange) {
      return allLogs.filter(
        log => log.startTime >= dateRange.start && log.startTime <= dateRange.end
      )
    }

    return allLogs.sort((a, b) => a.startTime - b.startTime)
  }

  /**
   * 清理过期日志（P18：删除 30 天前的日志文件）
   *
   * @returns 删除的日志文件数
   */
  async cleanExpiredLogs(): Promise<number> {
    const dir = this.logsDir
    if (!(await this.fs.exists(dir))) return 0

    const files = await this.fs.readDir(dir)
    const now = Date.now()
    const cutoff = now - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000
    let deletedCount = 0

    for (const file of files) {
      if (!file.endsWith('.json')) continue
      // 从文件名解析日期：YYYY-MM-DD.json
      const dateStr = file.replace('.json', '')
      const timestamp = this.parseDateToTimestamp(dateStr)
      if (timestamp !== null && timestamp < cutoff) {
        try {
          await this.fs.remove(`${dir}/${file}`)
          deletedCount++
        } catch (err) {
          console.warn(`[MetaStorage] 删除过期日志失败: ${file}`, err)
        }
      }
    }

    return deletedCount
  }

  // ===== 内部辅助方法 =====

  private createDefaultMeta(): ArchiveMeta {
    return {
      version: '1.0',
      lastDailyRun: 0,
      lastWeeklyRun: 0,
      lastMonthlyRun: 0,
      totalHooks: 0,
      totalFiles: 0,
      totalStorageBytes: 0,
      failedDeletions: [],
      dailyStats: {},
    }
  }

  /**
   * 规范化 meta 对象，确保所有字段存在
   */
  private normalizeMeta(meta: Partial<ArchiveMeta>): ArchiveMeta {
    const defaults = this.createDefaultMeta()
    return {
      version: meta.version || defaults.version,
      lastDailyRun: meta.lastDailyRun ?? defaults.lastDailyRun,
      lastWeeklyRun: meta.lastWeeklyRun ?? defaults.lastWeeklyRun,
      lastMonthlyRun: meta.lastMonthlyRun ?? defaults.lastMonthlyRun,
      totalHooks: meta.totalHooks ?? defaults.totalHooks,
      totalFiles: meta.totalFiles ?? defaults.totalFiles,
      totalStorageBytes: meta.totalStorageBytes ?? defaults.totalStorageBytes,
      failedDeletions: meta.failedDeletions ?? defaults.failedDeletions,
      dailyStats: meta.dailyStats ?? defaults.dailyStats,
    }
  }

  /**
   * 从文件系统加载所有钩子（重建 meta 用）
   */
  private async loadAllHooksFromFs(): Promise<Hook[]> {
    const dir = this.hooksDir
    if (!(await this.fs.exists(dir))) return []

    const files = await this.fs.readDir(dir)
    const hooks: Hook[] = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const content = await this.fs.readFile(`${dir}/${file}`)
        hooks.push(JSON.parse(content) as Hook)
      } catch {
        // 跳过解析失败的文件
      }
    }
    return hooks
  }

  /**
   * 计算存储字节数（hooks + files）
   */
  private async calculateStorageBytes(): Promise<number> {
    let totalBytes = 0

    // hooks 目录
    const hooksDir = this.hooksDir
    if (await this.fs.exists(hooksDir)) {
      const hookFiles = await this.fs.readDir(hooksDir)
      for (const f of hookFiles) {
        if (!f.endsWith('.json')) continue
        try {
          const content = await this.fs.readFile(`${hooksDir}/${f}`)
          totalBytes += content.length
        } catch {
          // 跳过
        }
      }
    }

    // files 目录
    const filesDir = `${this.basePath}/files`
    if (await this.fs.exists(filesDir)) {
      const fileDirs = await this.fs.readDir(filesDir)
      for (const fileId of fileDirs) {
        const chunksDir = `${filesDir}/${fileId}/chunks`
        if (await this.fs.exists(chunksDir)) {
          const chunkFiles = await this.fs.readDir(chunksDir)
          for (const cf of chunkFiles) {
            try {
              const content = await this.fs.readFile(`${chunksDir}/${cf}`)
              totalBytes += content.length
            } catch {
              // 跳过
            }
          }
        }
        const headerPath = `${filesDir}/${fileId}/header.json`
        if (await this.fs.exists(headerPath)) {
          try {
            const content = await this.fs.readFile(headerPath)
            totalBytes += content.length
          } catch {
            // 跳过
          }
        }
      }
    }

    return totalBytes
  }

  /**
   * 格式化时间戳为 YYYY-MM-DD（本地时区）
   */
  private formatDate(timestamp: number): string {
    const d = new Date(timestamp)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  /**
   * 解析 YYYY-MM-DD 为时间戳（本地时区当天 00:00:00）
   *
   * @returns 时间戳，解析失败返回 null
   */
  private parseDateToTimestamp(dateStr: string): number | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
    if (!match) return null
    const year = parseInt(match[1], 10)
    const month = parseInt(match[2], 10) - 1
    const day = parseInt(match[3], 10)
    const d = new Date(year, month, day, 0, 0, 0, 0)
    return d.getTime()
  }
}
