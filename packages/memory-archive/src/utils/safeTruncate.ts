/**
 * 安全截断点查找（P11 决策）
 *
 * P11 决策：advanceBoundary 直接截断 state.messages 时需保证安全
 *
 * 安全截断规则：
 * 1. 不在流式输出中截断（由 AgentBridge.isStreaming() 保证）
 * 2. 保持消息对完整性（tool_call → tool_result 不拆分）
 * 3. 不在 assistant 消息中间截断
 *
 * 截断策略：
 * - 从目标索引向前查找，找到第一个安全截断点
 * - 安全截断点：user 消息的起始位置（新的对话轮次开始）
 * - 如果找不到安全截断点，保持原样不截断（返回原长度）
 */

import type { AgentMessageSnapshot } from '../types'

/**
 * 查找安全截断点
 *
 * @param messages 完整消息列表
 * @param targetIndex 期望截断到的索引（含此索引之前的消息将被丢弃）
 * @returns 实际安全截断点索引（此索引及之后的消息保留）
 */
export function findSafeTruncatePoint(
  messages: AgentMessageSnapshot[],
  targetIndex: number
): number {
  if (targetIndex <= 0) return 0
  if (targetIndex >= messages.length) return messages.length

  // 从 targetIndex 向前查找安全截断点
  for (let i = targetIndex; i > 0; i--) {
    if (isSafeTruncatePoint(messages, i)) {
      return i
    }
  }

  // 找不到安全截断点，不截断
  return messages.length
}

/**
 * 判断给定索引是否为安全截断点
 *
 * 安全截断点条件：
 * 1. 当前位置是 user 消息（新对话轮次的开始）
 * 2. 前一条消息不是 tool_call 的 assistant 消息（避免拆分工具调用链）
 * 3. 前一条消息不是等待 tool_result 的消息
 */
function isSafeTruncatePoint(
  messages: AgentMessageSnapshot[],
  index: number
): boolean {
  if (index === 0) return true
  if (index >= messages.length) return true

  const current = messages[index]
  const prev = messages[index - 1]

  // 当前必须是 user 消息（新轮次开始）
  if (current.role !== 'user') return false

  // 前一条不能是 tool 消息（工具结果未完成）
  if (prev.role === 'tool') return false

  // 前一条不能是带 toolName 的 assistant 消息（等待 tool_result）
  if (prev.role === 'assistant' && prev.toolName) return false

  return true
}

/**
 * 验证截断后消息列表的完整性
 *
 * 检查：
 * 1. 不存在孤立的 tool 消息（没有对应的 assistant tool_call）
 * 2. 不存在未完成的工具调用链（assistant tool_call 后没有 tool result）
 */
export function validateTruncatedMessages(
  messages: AgentMessageSnapshot[]
): { valid: boolean; issues: string[] } {
  const issues: string[] = []

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]

    // 检查孤立的 tool 消息
    if (msg.role === 'tool') {
      if (i === 0) {
        issues.push(`Message ${i}: tool message without preceding assistant tool_call`)
        continue
      }
      const prev = messages[i - 1]
      if (prev.role !== 'assistant' || !prev.toolName) {
        // 可能有多个 tool 消息连续（多工具调用），向前查找
        for (let j = i - 1; j >= 0 && messages[j].role === 'tool'; j--) {
          // 继续向前找
        }
        // 简化检查：如果前面连续的都不是 assistant+toolName，报告问题
        let hasAssistantCaller = false
        for (let j = i - 1; j >= 0; j--) {
          if (messages[j].role === 'assistant' && messages[j].toolName) {
            hasAssistantCaller = true
            break
          }
          if (messages[j].role === 'user') break
        }
        if (!hasAssistantCaller) {
          issues.push(`Message ${i}: tool message without preceding assistant tool_call`)
        }
      }
    }

    // 检查未完成的工具调用链（最后一条消息是 assistant tool_call）
    if (i === messages.length - 1 && msg.role === 'assistant' && msg.toolName) {
      issues.push(`Message ${i}: assistant tool_call without following tool result`)
    }
  }

  return { valid: issues.length === 0, issues }
}
