/**
 * 存储适配器接口（内置默认实现）
 *
 * 定义钩子、记忆文件、索引的持久化操作。
 * 框架提供 FsStorageAdapter（文件系统）和 IdbStorageAdapter（IndexedDB）两种默认实现。
 *
 * H5.2 新增：回收站机制。删除操作改为软删除（移入 trash 目录），
 * 保留 trashRetentionDays 天后由月任务自动清理。
 * 用户可在 ArchivePanel 回收站视图中恢复或手动清空。
 */

import type { ArchiveIndex, Hook, MemoryChunk, MemoryFileHeader } from '../types'

export interface StorageAdapter {
  // ===== 钩子（轻量元数据，可全部常驻内存） =====
  saveHook(hook: Hook): Promise<void>
  loadHook(hookId: string): Promise<Hook | null>
  loadAllHooks(): Promise<Hook[]>
  deleteHook(hookId: string): Promise<void>

  // ===== 记忆文件（分块 JSON 文件，按需加载） =====
  saveMemoryFile(fileId: string, header: MemoryFileHeader, chunks: MemoryChunk[]): Promise<void>
  loadMemoryFileChunk(fileId: string, chunkId: string): Promise<MemoryChunk>
  deleteMemoryFile(fileId: string): Promise<void>
  /** P2 新增 */
  listMemoryFiles(): Promise<{ id: string; size: number }[]>

  // ===== 索引（日/周汇总索引） =====
  saveIndex(index: ArchiveIndex): Promise<void>
  loadIndices(type: 'daily' | 'weekly'): Promise<ArchiveIndex[]>

  // ===== 统计（P2 新增） =====
  getStorageStats(): Promise<{ totalHooks: number; totalFiles: number; totalBytes: number }>

  // ===== 回收站（H5.2 新增） =====
  /**
   * 将钩子移入回收站（软删除）
   *
   * 将钩子文件从 hooks/ 移到 trash/hooks/，不删除数据。
   * 月任务会在 trashRetentionDays 天后调用 emptyTrash 清理。
   *
   * @param hookId 钩子 ID
   */
  moveToTrash(hookId: string): Promise<void>
  /**
   * 将记忆文件移入回收站（软删除）
   *
   * @param fileId 文件 ID
   */
  moveMemoryFileToTrash(fileId: string): Promise<void>
  /**
   * 从回收站恢复钩子（软删除恢复）
   *
   * 将钩子文件从 trash/hooks/ 移回 hooks/。
   *
   * @param hookId 钩子 ID
   */
  restoreFromTrash(hookId: string): Promise<void>
  /**
   * 列出回收站中的钩子
   *
   * @returns 回收站中的钩子列表
   */
  listTrashedHooks(): Promise<Hook[]>
  /**
   * 清空回收站（硬删除回收站中的所有数据）
   *
   * 月任务在 trashRetentionDays 天后调用。
   * 也可由用户在 ArchivePanel 手动触发。
   *
   * @param beforeTimestamp 只清理此时间戳之前移入回收站的项，0 表示全部
   * @returns 清理的项数
   */
  emptyTrash(beforeTimestamp?: number): Promise<{ hooks: number; files: number }>
}
