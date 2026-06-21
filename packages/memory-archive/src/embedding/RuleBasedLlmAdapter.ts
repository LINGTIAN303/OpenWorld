/**
 * 规则降级 LLM 适配器
 *
 * 当 LLM 不可用时（LlmAdapter.isReady() === false）的降级实现。
 * 使用规则提取摘要、关键词和重要性评分，不依赖外部 LLM。
 *
 * 摘要策略：
 * 1. 提取所有 user 消息作为摘要骨架
 * 2. 截取每个 assistant 消息的首 200 字符
 * 3. 拼接并截断到 maxLength
 *
 * 关键词策略：
 * 1. 统计词频（简单分词）
 * 2. 过滤停用词
 * 3. 取 Top 10
 *
 * 重要性策略：
 * 1. 根据消息数量和内容长度评估
 * 2. 包含工具调用、代码、实体操作的对话重要性更高
 */

import type { LlmAdapter } from '../adapters/LlmAdapter'
import type { TokenizerAdapter } from '../adapters/TokenizerAdapter'
import { SimpleTokenizerAdapter } from '../adapters/SimpleTokenizerAdapter'

// 简单中英文停用词
const STOP_WORDS = new Set([
  // 中文
  '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
  '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好',
  '自己', '这', '那', '它', '他', '她', '们', '什么', '怎么', '可以', '这个',
  // 英文
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'can', 'shall', 'to', 'of', 'in',
  'on', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into',
  'through', 'during', 'before', 'after', 'above', 'below', 'from', 'up',
  'down', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
  'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's',
  't', 'just', 'don', 'now', 'and', 'or', 'but', 'if', 'while', 'about',
])

export class RuleBasedLlmAdapter implements LlmAdapter {
  /** H2.2 分词器（宿主可注入 jieba 等，默认使用 SimpleTokenizerAdapter） */
  private tokenizer: TokenizerAdapter

  constructor(tokenizer?: TokenizerAdapter) {
    this.tokenizer = tokenizer ?? new SimpleTokenizerAdapter()
  }

  isReady(): boolean {
    return true // 规则方法始终可用
  }

  async summarize(
    messages: { role: string; content: string }[],
    maxLength: number
  ): Promise<string> {
    const parts: string[] = []

    for (const msg of messages) {
      if (msg.role === 'user') {
        // user 消息完整保留（截断到 200 字符）
        const truncated = msg.content.slice(0, 200)
        parts.push(`[用户] ${truncated}`)
      } else if (msg.role === 'assistant') {
        // assistant 消息取首 200 字符
        const truncated = msg.content.slice(0, 200)
        parts.push(`[助手] ${truncated}`)
      } else if (msg.role === 'tool') {
        // tool 消息只记录工具名和结果摘要
        parts.push(`[工具结果] ${msg.content.slice(0, 100)}`)
      }
    }

    let summary = parts.join('\n')

    // 截断到 maxLength
    if (summary.length > maxLength) {
      summary = summary.slice(0, maxLength - 3) + '...'
    }

    return summary
  }

  async assessImportance(messages: { role: string; content: string }[]): Promise<number> {
    let score = 0.3 // 基础分

    // 消息数量影响
    if (messages.length > 20) score += 0.2
    else if (messages.length > 10) score += 0.1

    // 内容长度影响
    const totalLength = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0)
    if (totalLength > 10000) score += 0.2
    else if (totalLength > 5000) score += 0.1

    // 包含工具调用
    const hasToolCall = messages.some(m => m.role === 'tool' || m.content?.includes('tool_call'))
    if (hasToolCall) score += 0.15

    // 包含代码
    const hasCode = messages.some(m => m.content?.includes('```'))
    if (hasCode) score += 0.1

    // 包含实体操作
    const hasEntityOp = messages.some(
      m => m.content?.includes('实体') || m.content?.includes('entity')
    )
    if (hasEntityOp) score += 0.1

    return Math.min(1.0, score)
  }

  async extractKeywords(messages: { role: string; content: string }[]): Promise<string[]> {
    const allText = messages.map(m => m.content || '').join(' ')

    // H2.2: 使用 tokenizer 分词（支持 jieba 等中文分词库）
    let tokens: string[]
    if (this.tokenizer.isReady() && this.tokenizer.extractKeywords) {
      // 优先使用 tokenizer 的 extractKeywords（jieba 等有 TF-IDF 算法）
      return this.tokenizer.extractKeywords(allText, 10)
    } else if (this.tokenizer.isReady()) {
      tokens = this.tokenizer.tokenize(allText)
    } else {
      // 降级：简单分词
      tokens = this.fallbackTokenize(allText)
    }

    // 词频统计
    const wordFreq = new Map<string, number>()
    for (const token of tokens) {
      if (!STOP_WORDS.has(token)) {
        wordFreq.set(token, (wordFreq.get(token) || 0) + 1)
      }
    }

    // 按频率排序，取 Top 10
    const sorted = Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .filter(([, freq]) => freq >= 2) // 至少出现 2 次
      .slice(0, 10)
      .map(([word]) => word)

    return sorted
  }

  /**
   * 降级分词（tokenizer 不可用时使用）
   */
  private fallbackTokenize(text: string): string[] {
    const tokens: string[] = []
    // 中文分词（简单按字符切分，2-4 字组合）
    const cjkChars = text.match(/[\u4e00-\u9fff]{2,6}/g) || []
    for (const word of cjkChars) {
      for (let len = 2; len <= Math.min(4, word.length); len++) {
        for (let i = 0; i <= word.length - len; i++) {
          tokens.push(word.slice(i, i + len))
        }
      }
    }
    // 英文分词（按空格和标点）
    const engWords = text.match(/[a-zA-Z]{3,}/g) || []
    for (const word of engWords) {
      tokens.push(word.toLowerCase())
    }
    return tokens
  }
}
