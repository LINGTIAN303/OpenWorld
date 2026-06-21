/**
 * 归档边界管理
 *
 * 维护"已归档消息索引边界"（当前会话中 Agent 可见消息的起点）。
 * 边界之前的消息已被归档，Agent 不再可见；边界之后的消息仍在上下文窗口中。
 */

export class ArchiveBoundary {
  private boundaryIndex: number = 0
  private archiveThreshold: number

  constructor(archiveThreshold: number) {
    this.archiveThreshold = archiveThreshold
  }

  /**
   * 获取当前边界索引
   * 此索引之前（不含）的消息已被归档
   */
  get current(): number {
    return this.boundaryIndex
  }

  /**
   * 判断是否应该归档
   * @param tokenCount 当前上下文 token 数
   */
  shouldArchive(tokenCount: number): boolean {
    return tokenCount >= this.archiveThreshold
  }

  /**
   * 推进边界
   * @param archivedUpToIndex 已归档到的消息索引（不含此索引）
   */
  advanceBoundary(archivedUpToIndex: number): void {
    if (archivedUpToIndex > this.boundaryIndex) {
      this.boundaryIndex = archivedUpToIndex
    }
  }

  /**
   * 重置边界（如 clearHistory 时调用）
   */
  reset(): void {
    this.boundaryIndex = 0
  }

  /**
   * 恢复边界（如 abort 重建 agent 后调用）
   */
  restore(index: number): void {
    this.boundaryIndex = index
  }

  /**
   * 更新归档阈值
   */
  updateThreshold(newThreshold: number): void {
    this.archiveThreshold = newThreshold
  }
}
