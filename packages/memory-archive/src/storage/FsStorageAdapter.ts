/**
 * 文件系统存储适配器（P5 决策：分块 JSON 文件）
 *
 * 通过 FsOperations 接口抽象文件系统操作，保持框架零硬依赖。
 * 宿主在 Tauri 环境注入 @tauri-apps/api/fs 实现，在 Node 环境注入 fs 实现。
 *
 * 目录结构（P5 决策）：
 * {basePath}/
 * ├── hooks/{hookId}.json           # 钩子文件
 * ├── files/{fileId}/               # 记忆文件目录
 * │   ├── header.json               # 文件头
 * │   └── chunks/{chunkId}.json     # 分块文件
 * ├── indices/
 * │   ├── daily/{date}.json
 * │   └── weekly/{week}.json
 * ├── trash/                        # H5.2 回收站
 * │   ├── hooks/{hookId}.json       # 软删除的钩子
 * │   └── files/{fileId}/           # 软删除的记忆文件
 * └── meta.json
 */

import type { FsOperations } from '../adapters/FsOperations'
import type { StorageAdapter } from '../adapters/StorageAdapter'
import type { ArchiveIndex, Hook, MemoryChunk, MemoryFileHeader } from '../types'

export interface FsStorageAdapterOptions {
  basePath: string
  fs: FsOperations
}

export class FsStorageAdapter implements StorageAdapter {
  private basePath: string
  private fs: FsOperations

  constructor(options: FsStorageAdapterOptions) {
    this.basePath = options.basePath
    this.fs = options.fs
  }

  // ===== 路径辅助 =====

  private hookPath(hookId: string): string {
    return `${this.basePath}/hooks/${hookId}.json`
  }

  private fileDir(fileId: string): string {
    return `${this.basePath}/files/${fileId}`
  }

  private headerPath(fileId: string): string {
    return `${this.fileDir(fileId)}/header.json`
  }

  private chunkPath(fileId: string, chunkId: string): string {
    return `${this.fileDir(fileId)}/chunks/${chunkId}.json`
  }

  private indexDir(type: 'daily' | 'weekly'): string {
    return `${this.basePath}/indices/${type}`
  }

  private indexPath(type: 'daily' | 'weekly', id: string): string {
    return `${this.indexDir(type)}/${id}.json`
  }

  // H5.2 回收站路径辅助
  private trashHookPath(hookId: string): string {
    return `${this.basePath}/trash/hooks/${hookId}.json`
  }

  private trashFileDir(fileId: string): string {
    return `${this.basePath}/trash/files/${fileId}`
  }

  private trashHeaderPath(fileId: string): string {
    return `${this.trashFileDir(fileId)}/header.json`
  }

  private async ensureDir(path: string): Promise<void> {
    if (!(await this.fs.exists(path))) {
      await this.fs.mkdir(path, true)
    }
  }

  // ===== 钩子操作 =====

  async saveHook(hook: Hook): Promise<void> {
    const dir = `${this.basePath}/hooks`
    await this.ensureDir(dir)
    await this.fs.writeFile(this.hookPath(hook.id), JSON.stringify(hook, null, 2))
  }

  async loadHook(hookId: string): Promise<Hook | null> {
    const path = this.hookPath(hookId)
    if (!(await this.fs.exists(path))) return null
    const content = await this.fs.readFile(path)
    return JSON.parse(content) as Hook
  }

  async loadAllHooks(): Promise<Hook[]> {
    const dir = `${this.basePath}/hooks`
    if (!(await this.fs.exists(dir))) return []
    const files = await this.fs.readDir(dir)
    const hooks: Hook[] = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      const content = await this.fs.readFile(`${dir}/${file}`)
      hooks.push(JSON.parse(content) as Hook)
    }
    return hooks
  }

  async deleteHook(hookId: string): Promise<void> {
    const path = this.hookPath(hookId)
    if (await this.fs.exists(path)) {
      await this.fs.remove(path)
    }
  }

  // ===== 记忆文件操作（P5 分块 JSON） =====

  async saveMemoryFile(
    fileId: string,
    header: MemoryFileHeader,
    chunks: MemoryChunk[]
  ): Promise<void> {
    const dir = this.fileDir(fileId)
    const chunksDir = `${dir}/chunks`
    await this.ensureDir(chunksDir)

    // 写入 header
    await this.fs.writeFile(this.headerPath(fileId), JSON.stringify(header, null, 2))

    // 写入每个 chunk
    for (const chunk of chunks) {
      await this.fs.writeFile(this.chunkPath(fileId, chunk.chunkId), JSON.stringify(chunk, null, 2))
    }
  }

  async loadMemoryFileChunk(fileId: string, chunkId: string): Promise<MemoryChunk> {
    const path = this.chunkPath(fileId, chunkId)
    if (!(await this.fs.exists(path))) {
      throw new Error(`Chunk not found: fileId=${fileId}, chunkId=${chunkId}`)
    }
    const content = await this.fs.readFile(path)
    return JSON.parse(content) as MemoryChunk
  }

  async deleteMemoryFile(fileId: string): Promise<void> {
    const dir = this.fileDir(fileId)
    if (await this.fs.exists(dir)) {
      await this.fs.remove(dir)
    }
  }

  async listMemoryFiles(): Promise<{ id: string; size: number }[]> {
    const dir = `${this.basePath}/files`
    if (!(await this.fs.exists(dir))) return []
    const entries = await this.fs.readDir(dir)
    const result: { id: string; size: number }[] = []
    for (const entry of entries) {
      // 每个 entry 是一个 fileId 目录
      const headerPath = this.headerPath(entry)
      if (await this.fs.exists(headerPath)) {
        const content = await this.fs.readFile(headerPath)
        const header = JSON.parse(content) as MemoryFileHeader
        result.push({ id: entry, size: header.totalTokens })
      }
    }
    return result
  }

  // ===== 索引操作 =====

  async saveIndex(index: ArchiveIndex): Promise<void> {
    const dir = this.indexDir(index.type)
    await this.ensureDir(dir)
    await this.fs.writeFile(this.indexPath(index.type, index.id), JSON.stringify(index, null, 2))
  }

  async loadIndices(type: 'daily' | 'weekly'): Promise<ArchiveIndex[]> {
    const dir = this.indexDir(type)
    if (!(await this.fs.exists(dir))) return []
    const files = await this.fs.readDir(dir)
    const indices: ArchiveIndex[] = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      const content = await this.fs.readFile(`${dir}/${file}`)
      indices.push(JSON.parse(content) as ArchiveIndex)
    }
    return indices
  }

  // ===== 统计 =====

  async getStorageStats(): Promise<{
    totalHooks: number
    totalFiles: number
    totalBytes: number
  }> {
    let totalHooks = 0
    let totalFiles = 0
    let totalBytes = 0

    // 统计钩子
    const hooksDir = `${this.basePath}/hooks`
    if (await this.fs.exists(hooksDir)) {
      const hookFiles = await this.fs.readDir(hooksDir)
      totalHooks = hookFiles.filter(f => f.endsWith('.json')).length
      for (const f of hookFiles) {
        const content = await this.fs.readFile(`${hooksDir}/${f}`)
        totalBytes += content.length
      }
    }

    // 统计记忆文件
    const filesDir = `${this.basePath}/files`
    if (await this.fs.exists(filesDir)) {
      const fileDirs = await this.fs.readDir(filesDir)
      totalFiles = fileDirs.length
      for (const fileId of fileDirs) {
        const chunksDir = `${this.fileDir(fileId)}/chunks`
        if (await this.fs.exists(chunksDir)) {
          const chunkFiles = await this.fs.readDir(chunksDir)
          for (const cf of chunkFiles) {
            const content = await this.fs.readFile(`${chunksDir}/${cf}`)
            totalBytes += content.length
          }
        }
        const headerContent = await this.fs.readFile(this.headerPath(fileId))
        totalBytes += headerContent.length
      }
    }

    return { totalHooks, totalFiles, totalBytes }
  }

  // ===== 回收站（H5.2 新增） =====

  /**
   * 将钩子移入回收站（软删除）
   *
   * 读取原钩子文件 → 写入 trash/hooks/ → 删除原文件。
   * FsOperations 无 rename，用读取+写入+删除模拟 move。
   */
  async moveToTrash(hookId: string): Promise<void> {
    const srcPath = this.hookPath(hookId)
    if (!(await this.fs.exists(srcPath))) {
      // 原文件不存在，可能已被删除，跳过
      return
    }
    const dstPath = this.trashHookPath(hookId)
    const dstDir = `${this.basePath}/trash/hooks`
    await this.ensureDir(dstDir)
    // 读取原文件内容
    const content = await this.fs.readFile(srcPath)
    // 写入回收站
    await this.fs.writeFile(dstPath, content)
    // 删除原文件
    await this.fs.remove(srcPath)
  }

  /**
   * 将记忆文件移入回收站（软删除）
   *
   * 将 files/{fileId}/ 整个目录移动到 trash/files/{fileId}/。
   */
  async moveMemoryFileToTrash(fileId: string): Promise<void> {
    const srcDir = this.fileDir(fileId)
    if (!(await this.fs.exists(srcDir))) {
      return
    }
    const dstDir = this.trashFileDir(fileId)
    const dstChunksDir = `${dstDir}/chunks`
    await this.ensureDir(dstChunksDir)

    // 移动 header
    const headerSrc = this.headerPath(fileId)
    if (await this.fs.exists(headerSrc)) {
      const headerContent = await this.fs.readFile(headerSrc)
      await this.fs.writeFile(this.trashHeaderPath(fileId), headerContent)
    }

    // 移动 chunks
    const chunksSrcDir = `${srcDir}/chunks`
    if (await this.fs.exists(chunksSrcDir)) {
      const chunkFiles = await this.fs.readDir(chunksSrcDir)
      for (const cf of chunkFiles) {
        if (!cf.endsWith('.json')) continue
        const chunkContent = await this.fs.readFile(`${chunksSrcDir}/${cf}`)
        await this.fs.writeFile(`${dstChunksDir}/${cf}`, chunkContent)
      }
    }

    // 删除原目录
    await this.fs.remove(srcDir)
  }

  /**
   * 从回收站恢复钩子（软删除恢复）
   *
   * 将 trash/hooks/{hookId}.json 移回 hooks/{hookId}.json。
   */
  async restoreFromTrash(hookId: string): Promise<void> {
    const srcPath = this.trashHookPath(hookId)
    if (!(await this.fs.exists(srcPath))) {
      throw new Error(`Trashed hook not found: ${hookId}`)
    }
    const dstPath = this.hookPath(hookId)
    const dstDir = `${this.basePath}/hooks`
    await this.ensureDir(dstDir)
    // 读取回收站文件
    const content = await this.fs.readFile(srcPath)
    // 写回 hooks 目录
    await this.fs.writeFile(dstPath, content)
    // 删除回收站文件
    await this.fs.remove(srcPath)

    // 同时恢复关联的记忆文件（如果回收站中存在）
    const hook = JSON.parse(content) as Hook
    const trashFileDir = this.trashFileDir(hook.fileId)
    if (await this.fs.exists(trashFileDir)) {
      const restoreFileDir = this.fileDir(hook.fileId)
      const restoreChunksDir = `${restoreFileDir}/chunks`
      await this.ensureDir(restoreChunksDir)

      const trashHeader = this.trashHeaderPath(hook.fileId)
      if (await this.fs.exists(trashHeader)) {
        const headerContent = await this.fs.readFile(trashHeader)
        await this.fs.writeFile(this.headerPath(hook.fileId), headerContent)
      }

      const trashChunksDir = `${trashFileDir}/chunks`
      if (await this.fs.exists(trashChunksDir)) {
        const chunkFiles = await this.fs.readDir(trashChunksDir)
        for (const cf of chunkFiles) {
          if (!cf.endsWith('.json')) continue
          const chunkContent = await this.fs.readFile(`${trashChunksDir}/${cf}`)
          await this.fs.writeFile(`${restoreChunksDir}/${cf}`, chunkContent)
        }
      }

      // 删除回收站中的文件目录
      await this.fs.remove(trashFileDir)
    }
  }

  /**
   * 列出回收站中的钩子
   */
  async listTrashedHooks(): Promise<Hook[]> {
    const trashHooksDir = `${this.basePath}/trash/hooks`
    if (!(await this.fs.exists(trashHooksDir))) {
      return []
    }
    const files = await this.fs.readDir(trashHooksDir)
    const hooks: Hook[] = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      const content = await this.fs.readFile(`${trashHooksDir}/${file}`)
      try {
        hooks.push(JSON.parse(content) as Hook)
      } catch {
        // 跳过损坏的文件
      }
    }
    return hooks
  }

  /**
   * 清空回收站（硬删除回收站中的所有数据）
   *
   * @param beforeTimestamp 只清理此时间戳之前移入回收站的项（按 trashedAt 过滤），0 或 undefined 表示全部
   * @returns 清理的项数
   */
  async emptyTrash(beforeTimestamp?: number): Promise<{ hooks: number; files: number }> {
    let hooksDeleted = 0
    let filesDeleted = 0

    const trashHooksDir = `${this.basePath}/trash/hooks`
    if (await this.fs.exists(trashHooksDir)) {
      const files = await this.fs.readDir(trashHooksDir)
      for (const file of files) {
        if (!file.endsWith('.json')) continue
        const filePath = `${trashHooksDir}/${file}`
        const content = await this.fs.readFile(filePath)
        try {
          const hook = JSON.parse(content) as Hook
          // 按时间戳过滤
          if (beforeTimestamp && hook.trashedAt && hook.trashedAt > beforeTimestamp) {
            continue
          }
          // 删除钩子文件
          await this.fs.remove(filePath)
          hooksDeleted++
          // 同时删除回收站中的记忆文件目录
          const trashFileDir = this.trashFileDir(hook.fileId)
          if (await this.fs.exists(trashFileDir)) {
            await this.fs.remove(trashFileDir)
            filesDeleted++
          }
        } catch {
          // 损坏的文件直接删除
          await this.fs.remove(filePath)
          hooksDeleted++
        }
      }
    }

    // 清理回收站中孤立的记忆文件（无对应钩子的）
    const trashFilesDir = `${this.basePath}/trash/files`
    if (await this.fs.exists(trashFilesDir)) {
      const fileDirs = await this.fs.readDir(trashFilesDir)
      for (const fileId of fileDirs) {
        const dirPath = `${trashFilesDir}/${fileId}`
        await this.fs.remove(dirPath)
        filesDeleted++
      }
    }

    return { hooks: hooksDeleted, files: filesDeleted }
  }
}
