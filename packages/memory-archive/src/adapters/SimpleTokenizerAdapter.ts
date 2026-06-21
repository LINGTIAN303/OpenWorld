/**
 * 简单分词器（框架内置降级实现）
 *
 * 不依赖任何外部分词库，提供基础的分词能力：
 * - 中文：按 2-4 字组合切分（滑动窗口）
 * - 英文：按空格和标点切分
 *
 * 宿主可注入 jieba 等专业分词库的 TokenizerAdapter 实现以替换此实现。
 */

import type { TokenizerAdapter } from './TokenizerAdapter'

/** 停用词表 */
const STOP_WORDS = new Set([
  // 中文停用词
  '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '上', '也', '很',
  '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '那', '这个',
  '那个', '什么', '怎么', '为什么', '可以', '能够', '应该', '需要', '已经', '还是', '或者',
  // 英文停用词
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'can', 'shall', 'to', 'of', 'in',
  'on', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into',
  'through', 'during', 'before', 'after', 'above', 'below', 'from', 'up',
  'down', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
  'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'and',
  'but', 'if', 'or', 'because', 'as', 'until', 'while', 'of', 'this', 'that',
])

export class SimpleTokenizerAdapter implements TokenizerAdapter {
  isReady(): boolean {
    return true
  }

  tokenize(text: string): string[] {
    if (!text) return []
    const tokens: string[] = []

    // 中文分词（2-4 字滑动窗口）
    const cjkMatches = text.match(/[\u4e00-\u9fff]+/g) || []
    for (const cjkSegment of cjkMatches) {
      // 取 2-4 字的子串
      for (let len = 2; len <= Math.min(4, cjkSegment.length); len++) {
        for (let i = 0; i <= cjkSegment.length - len; i++) {
          const sub = cjkSegment.slice(i, i + len)
          if (!STOP_WORDS.has(sub)) {
            tokens.push(sub)
          }
        }
      }
      // 单字也保留（用于短查询匹配）
      if (cjkSegment.length === 1 && !STOP_WORDS.has(cjkSegment)) {
        tokens.push(cjkSegment)
      }
    }

    // 英文分词（按空格和标点）
    const engWords = text.match(/[a-zA-Z]{2,}/g) || []
    for (const word of engWords) {
      const lower = word.toLowerCase()
      if (!STOP_WORDS.has(lower)) {
        tokens.push(lower)
      }
    }

    return tokens
  }

  extractKeywords(text: string, maxCount: number = 10): string[] {
    const tokens = this.tokenize(text)
    const wordFreq = new Map<string, number>()
    for (const token of tokens) {
      wordFreq.set(token, (wordFreq.get(token) || 0) + 1)
    }
    return Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .filter(([, freq]) => freq >= 2)
      .slice(0, maxCount)
      .map(([word]) => word)
  }
}
