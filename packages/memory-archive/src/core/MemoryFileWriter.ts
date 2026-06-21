/**
 * 记忆文件写入器（P5 决策：分块 JSON 文件）
 *
 * 负责将归档的记忆文件写入存储。
 * P5 决策：每个块独立 JSON 文件，无需字节偏移。
 */

import type { StorageAdapter } from '../adapters/StorageAdapter'
import type { MemoryChunk, MemoryFileHeader } from '../types'

export interface MemoryFileWriterOptions {
  projectId: string
  sessionId: string
  storage: StorageAdapter
}

export class MemoryFileWriter {
  private opts: MemoryFileWriterOptions

  constructor(options: MemoryFileWriterOptions) {
    this.opts = options
  }

  /**
   * 更新会话 ID（会话切换时调用）
   *
   * P3-2-3 新增：支持会话切换时更新 sessionId，避免重新初始化整个 MemoryFileWriter。
   * 影响后续写入的文件头中的 sessionId 字段。
   */
  updateSessionId(sessionId: string): void {
    this.opts.sessionId = sessionId
  }

  /**
   * 写入记忆文件
   *
   * @param fileId 文件 ID
   * @param chunks 主题分块列表
   * @returns 文件头信息
   */
  async write(fileId: string, chunks: MemoryChunk[]): Promise<MemoryFileHeader> {
    const now = Date.now()
    const totalTokens = chunks.reduce((sum, c) => sum + c.tokenCount, 0)

    const header: MemoryFileHeader = {
      fileId,
      projectId: this.opts.projectId,
      sessionId: this.opts.sessionId,
      createdAt: now,
      totalTokens,
      totalChunks: chunks.length,
      formatVersion: '1.0',
      encoding: 'utf-8',
    }

    await this.opts.storage.saveMemoryFile(fileId, header, chunks)

    return header
  }

  /**
   * 删除记忆文件
   */
  async delete(fileId: string): Promise<void> {
    await this.opts.storage.deleteMemoryFile(fileId)
  }

  /**
   * 加载单个分块
   */
  async loadChunk(fileId: string, chunkId: string): Promise<MemoryChunk> {
    return this.opts.storage.loadMemoryFileChunk(fileId, chunkId)
  }
}
