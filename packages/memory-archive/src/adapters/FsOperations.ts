/**
 * 文件系统操作注入接口（新增，P11 决策：依赖注入文件操作）
 *
 * FsStorageAdapter 通过此接口抽象文件系统操作，保持框架零硬依赖。
 * 宿主在 Tauri 环境注入 @tauri-apps/api/fs 实现，在 Node 环境注入 fs 实现。
 *
 * 示例（Tauri 环境）：
 * ```typescript
 * import { readTextFile, writeTextFile, mkdir, remove, readDir } from '@tauri-apps/api/fs'
 * const fsOps: FsOperations = {
 *   readFile: (path) => readTextFile(path),
 *   writeFile: (path, content) => writeTextFile(path, content),
 *   mkdir: (path, recursive) => mkdir(path, { recursive }),
 *   remove: (path) => remove(path),
 *   exists: async (path) => { try { await readDir(path); return true } catch { return false } },
 *   readDir: async (path) => (await readDir(path)).map(e => e.name)
 * }
 * ```
 */

export interface FsOperations {
  /** 读取文本文件 */
  readFile(path: string): Promise<string>
  /** 写入文本文件（自动创建父目录） */
  writeFile(path: string, content: string): Promise<void>
  /** 创建目录 */
  mkdir(path: string, recursive?: boolean): Promise<void>
  /** 删除文件或目录 */
  remove(path: string): Promise<void>
  /** 检查路径是否存在 */
  exists(path: string): Promise<boolean>
  /** 列出目录下的条目名称 */
  readDir(path: string): Promise<string[]>
}
