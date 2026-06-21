/**
 * Agent 框架适配接口（宿主必实现）
 *
 * 框架通过此接口与具体 Agent 框架解耦。
 * 宿主需实现此接口并注入到 ArchiveManager。
 */

import type { AgentMessageSnapshot, ArchiveResult, ArchiveTool, Hook } from '../types'

export interface AgentBridge {
  /** 获取当前会话消息（用于归档） */
  getCurrentMessages(): AgentMessageSnapshot[]
  /** 获取当前上下文 token 数 */
  getCurrentTokenCount(): number
  /** 推进归档边界（清空 Agent 内部已归档消息） */
  advanceBoundary(archivedUpToIndex: number): void
  /** 注入钩子摘要到 system prompt（新会话/归档后自动注入） */
  injectHookSummary(hooks: Hook[]): string
  /** 注册工具到 Agent（供 Agent 按需检索归档） */
  registerTools(tools: ArchiveTool[]): void
  /** 是否正在流式输出（P2 新增，归档前检查） */
  isStreaming(): boolean
  /** 归档完成回调（P2 新增，可选） */
  onArchiveComplete?(callback: (result: ArchiveResult) => void): void
  /**
   * 恢复归档边界（P12 新增，可选）
   *
   * 从持久化存储（sessionStorage）读取边界索引并恢复。
   * 用于 abort 重建 agent / ensureInitialized 后调用。
   */
  restoreBoundary?(): void
  /**
   * 重置归档边界（P12 新增，可选）
   *
   * 清空持久化的边界索引，重置为 0。
   * 用于 clearHistory 时调用。
   */
  resetBoundary?(): void
  /**
   * 获取钩子摘要文本（P12 新增，可选）
   *
   * 返回最近注入的钩子摘要文本，供 system prompt 拼接使用。
   * 与 injectHookSummary 的区别：此方法不修改 messages 数组，
   * 仅返回文本供调用方在构建 system prompt 时拼接。
   *
   * @returns 钩子摘要文本，无摘要时返回空字符串
   */
  getHookSummaryForPrompt?(): string
}
