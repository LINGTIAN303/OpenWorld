/**
 * 读写锁（P17 决策）
 *
 * P17 决策：改用读写锁 + 分批执行 + 可中断
 *
 * 锁规则：
 * - 归档操作：exclusive 锁（写记忆文件+钩子）
 * - 日任务：shared 锁（只读 hooks，写索引时升级为 exclusive）
 * - 周/月任务：exclusive 锁（写钩子+删除文件），分批执行
 * - 检索操作：无锁（读取 hooksCache 的快照）
 *
 * 超时：30 秒，超时后放弃当前操作
 */

export class ReadWriteLock {
  private readers: number = 0
  private writers: number = 0
  private writeQueue: Array<() => void> = []
  private readQueue: Array<() => void> = []
  private writerResolve: (() => void) | null = null

  /**
   * 获取读锁（shared）
   * 多个读操作可并发，但会等待正在进行的写操作完成
   */
  async readLock<T>(fn: () => Promise<T>, timeoutMs: number = 30000): Promise<T> {
    await this.acquireRead(timeoutMs)
    try {
      return await fn()
    } finally {
      this.releaseRead()
    }
  }

  /**
   * 获取写锁（exclusive）
   * 写操作独占，等待所有读操作和其他写操作完成
   */
  async writeLock<T>(fn: () => Promise<T>, timeoutMs: number = 30000): Promise<T> {
    await this.acquireWrite(timeoutMs)
    try {
      return await fn()
    } finally {
      this.releaseWrite()
    }
  }

  /**
   * 尝试获取写锁（非阻塞）
   * 如果无法立即获取，返回 false
   */
  tryWriteLock(): boolean {
    if (this.readers === 0 && this.writers === 0) {
      this.writers++
      return true
    }
    return false
  }

  /**
   * 释放写锁（配合 tryWriteLock 使用）
   */
  releaseTryWriteLock(): void {
    if (this.writers > 0) {
      this.writers--
      this.dispatchNext()
    }
  }

  private async acquireRead(timeoutMs: number): Promise<void> {
    // 如果有正在写的或等待写的，排队
    if (this.writers > 0 || this.writeQueue.length > 0) {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          const idx = this.readQueue.indexOf(resolve)
          if (idx >= 0) this.readQueue.splice(idx, 1)
          reject(new Error('Read lock timeout'))
        }, timeoutMs)
        this.readQueue.push(() => {
          clearTimeout(timeout)
          resolve()
        })
      })
    }
    this.readers++
  }

  private async acquireWrite(timeoutMs: number): Promise<void> {
    this.writers++
    // 如果有读者、有正在等待的写者、或者有其他写者（writers > 1 表示除自己外还有写者），则排队等待
    if (this.readers > 0 || this.writerResolve !== null || this.writers > 1) {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          const idx = this.writeQueue.indexOf(resolve)
          if (idx >= 0) this.writeQueue.splice(idx, 1)
          this.writers--
          reject(new Error('Write lock timeout'))
        }, timeoutMs)
        this.writeQueue.push(() => {
          clearTimeout(timeout)
          resolve()
        })
      })
    }
    this.writerResolve = null
  }

  private releaseRead(): void {
    this.readers--
    if (this.readers === 0) {
      this.dispatchNext()
    }
  }

  private releaseWrite(): void {
    this.writers--
    this.dispatchNext()
  }

  private dispatchNext(): void {
    // 优先唤醒写操作（避免写饥饿）
    if (this.writers > 0 && this.writeQueue.length > 0 && this.readers === 0) {
      const next = this.writeQueue.shift()!
      next()
      return
    }
    // 其次唤醒读操作
    if (this.writeQueue.length === 0 && this.readQueue.length > 0) {
      while (this.readQueue.length > 0) {
        const next = this.readQueue.shift()!
        next()
      }
    }
  }
}
