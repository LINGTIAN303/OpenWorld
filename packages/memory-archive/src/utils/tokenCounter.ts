/**
 * Token 计数工具
 *
 * 使用 gpt-tokenizer（tiktoken 的纯 JS 实现）进行精确 token 计数。
 * gpt-tokenizer 使用与 OpenAI tiktoken 相同的 BPE 词表，精度一致。
 * 纯 JS 实现，无需 WASM 加载，在浏览器/Node/Tauri 环境均可直接使用。
 */

import { encode } from 'gpt-tokenizer'
import type { AgentMessageSnapshot } from '../types'

/**
 * 估算文本的 token 数
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  try {
    return encode(text).length
  } catch {
    // 降级：英文约 4 字符/token，中文约 2 字符/token
    const cjkChars = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length
    const otherChars = text.length - cjkChars
    return Math.ceil(cjkChars / 2 + otherChars / 4)
  }
}

/**
 * 计算单条消息的 token 数（含角色开销约 4 token）
 */
export function countMessageTokens(message: AgentMessageSnapshot): number {
  const roleOverhead = 4
  const contentTokens = estimateTokens(message.content || '')
  const toolNameTokens = message.toolName ? estimateTokens(message.toolName) + 2 : 0
  return roleOverhead + contentTokens + toolNameTokens
}

/**
 * 计算消息列表的总 token 数
 */
export function countMessagesTokens(messages: AgentMessageSnapshot[]): number {
  let total = 0
  for (const msg of messages) {
    total += countMessageTokens(msg)
  }
  // 消息间分隔符开销
  total += messages.length * 3
  return total
}
