/**
 * 主题分块算法（P8 优化）
 *
 * 四维度分块决策（优先级从高到低）：
 * 1. 工具调用链（toolCall → toolResult 不拆分，P8 新增）
 * 2. 用户消息锚点（新 user 消息 → 潜在新块）
 * 3. Agent 输出类型变化（text → tool_call → 新块）
 * 4. 块大小约束（超 maxChunkTokens 强制拆分）
 *
 * P8 决策：输出类型检测优先级 metadata > toolName > 正则
 */

import type {
  AgentMessageSnapshot,
  AgentOutputType,
  ChunkTitle,
  MemoryChunk,
} from '../types'
import { estimateTokens } from './tokenCounter'

export interface ChunkingConfig {
  minChunkTokens: number
  maxChunkTokens: number
}

/**
 * P8 优化：输出类型检测优先级
 * 1. 优先使用 metadata.outputType（若宿主提供）
 * 2. 其次使用 toolName
 * 3. 最后用正则规则（降级方案）
 */
export function detectOutputType(msg: AgentMessageSnapshot): AgentOutputType {
  // 1. 优先使用 metadata.outputType（若宿主提供）
  if (msg.metadata?.outputType) {
    return msg.metadata.outputType as AgentOutputType
  }
  // 2. 其次使用 toolName
  if (msg.toolName) return 'tool_call'
  // 3. 最后用正则规则（降级方案）
  const content = msg.content || ''
  if (/^```[\s\S]+```/m.test(content)) return 'code'
  if (msg.metadata?.entityOp) return 'entity_op'
  if (/分析|推理|因为|所以|结论|综上|因此/.test(content)) return 'analysis'
  if (/设计|故事|角色|场景|对话|创作|灵感/.test(content)) return 'creative'
  return 'text'
}

/**
 * 截断文本到指定长度
 */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen)
}

/**
 * 构建单个分块
 *
 * P3-5-1 优化：接收预计算的 tokenCount，避免重复遍历。
 */
function buildChunk(
  messages: AgentMessageSnapshot[],
  anchor: string,
  outputType: AgentOutputType,
  precomputedTokenCount?: number
): MemoryChunk {
  const chunkId = `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const tokenCount = precomputedTokenCount ?? messages.reduce((sum, m) => sum + estimateTokens(m.content || ''), 0)
  const title = generateChunkTitle(messages, outputType)

  return {
    chunkId,
    title,
    outputType,
    userMessageAnchor: anchor,
    tokenCount,
    messages: [...messages],
  }
}

/**
 * 根据消息内容生成分块标题
 */
function generateChunkTitle(messages: AgentMessageSnapshot[], outputType: AgentOutputType): string {
  const firstUser = messages.find(m => m.role === 'user')
  if (firstUser) {
    return truncate(firstUser.content, 50)
  }
  const firstAssistant = messages.find(m => m.role === 'assistant')
  if (firstAssistant) {
    return truncate(firstAssistant.content, 50)
  }
  return `${outputType} 块`
}

/**
 * 合并过小的分块
 */
function mergeSmallChunks(chunks: MemoryChunk[], minTokens: number): MemoryChunk[] {
  if (chunks.length <= 1) return chunks

  const merged: MemoryChunk[] = []
  let current = chunks[0]

  for (let i = 1; i < chunks.length; i++) {
    const next = chunks[i]
    if (current.tokenCount + next.tokenCount <= minTokens * 2) {
      // 合并
      current = {
        ...current,
        chunkId: current.chunkId,
        title: `${current.title} / ${next.title}`,
        tokenCount: current.tokenCount + next.tokenCount,
        messages: [...current.messages, ...next.messages],
      }
    } else {
      if (current.tokenCount >= minTokens || merged.length === 0) {
        merged.push(current)
      } else if (merged.length > 0) {
        // 当前块太小，合并到前一个
        const prev = merged[merged.length - 1]
        prev.messages = [...prev.messages, ...current.messages]
        prev.tokenCount += current.tokenCount
        prev.title = `${prev.title} / ${current.title}`
      }
      current = next
    }
  }

  // 处理最后一个块
  if (current.tokenCount >= minTokens || merged.length === 0) {
    merged.push(current)
  } else if (merged.length > 0) {
    const prev = merged[merged.length - 1]
    prev.messages = [...prev.messages, ...current.messages]
    prev.tokenCount += current.tokenCount
    prev.title = `${prev.title} / ${current.title}`
  }

  return merged
}

/**
 * 主题分块主函数
 *
 * P8 决策：新增工具调用链维度，工具调用链中不拆分
 * P3-5-1 优化：增量累加 tokenCount，避免每次循环重新计算（O(n²) → O(n)）
 */
export function chunkMessages(
  messages: AgentMessageSnapshot[],
  config: ChunkingConfig
): MemoryChunk[] {
  if (messages.length === 0) return []

  const chunks: MemoryChunk[] = []
  let currentChunk: AgentMessageSnapshot[] = []
  let currentType: AgentOutputType | null = null
  let currentAnchor: string = ''
  let inToolCallChain: boolean = false // P8 新增
  let currentChunkTokens = 0 // P3-5-1 新增：增量累加，避免 O(n²)

  for (const msg of messages) {
    // 识别输出类型（P8 优先级：metadata > toolName > 正则）
    const msgType = detectOutputType(msg)

    // 工具调用链处理（P8 新增）
    if (msg.role === 'assistant' && msg.toolName) {
      inToolCallChain = true
    }
    if (msg.role === 'tool') {
      // toolResult 属于当前链，不拆分
      currentChunk.push(msg)
      currentChunkTokens += estimateTokens(msg.content || '') // P3-5-1 增量累加
      continue
    }
    if (inToolCallChain && msg.role === 'assistant' && !msg.toolName) {
      // 工具调用链结束
      inToolCallChain = false
    }

    // 判断是否需要开新块（工具调用链中不拆分）
    const isNewUserMessage = msg.role === 'user'
    const isTypeChanged = msgType !== currentType
    // P3-5-1：使用增量累加的 currentChunkTokens，无需重新计算
    const isOversized = currentChunkTokens >= config.maxChunkTokens

    if (
      !inToolCallChain &&
      (isNewUserMessage || isTypeChanged || isOversized) &&
      currentChunk.length > 0
    ) {
      // P3-5-1：传入预计算的 tokenCount
      chunks.push(buildChunk(currentChunk, currentAnchor, currentType || 'text', currentChunkTokens))
      currentChunk = []
      currentChunkTokens = 0
    }

    if (currentChunk.length === 0 && msg.role === 'user') {
      currentAnchor = truncate(msg.content, 50)
    }
    if (currentChunk.length === 0) {
      currentType = msgType
    }

    currentChunk.push(msg)
    currentChunkTokens += estimateTokens(msg.content || '') // P3-5-1 增量累加
  }

  if (currentChunk.length > 0) {
    // P3-5-1：传入预计算的 tokenCount
    chunks.push(buildChunk(currentChunk, currentAnchor, currentType || 'text', currentChunkTokens))
  }

  return mergeSmallChunks(chunks, config.minChunkTokens)
}

/**
 * 从分块列表提取 ChunkTitle 数组（用于 Hook.chunkTitles）
 */
export function extractChunkTitles(chunks: MemoryChunk[]): ChunkTitle[] {
  return chunks.map(c => ({
    chunkId: c.chunkId,
    title: c.title,
    outputType: c.outputType,
    userMessageAnchor: c.userMessageAnchor,
    tokenCount: c.tokenCount,
  }))
}
