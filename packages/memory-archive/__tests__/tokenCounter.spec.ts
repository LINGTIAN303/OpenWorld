/**
 * tokenCounter 单元测试
 */
import { describe, it, expect } from 'vitest'
import { estimateTokens, countMessageTokens, countMessagesTokens } from '../src/utils/tokenCounter'
import type { AgentMessageSnapshot } from '../src/types'

describe('estimateTokens', () => {
  it('空字符串返回 0', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('英文文本返回合理 token 数', () => {
    const text = 'Hello world'
    const tokens = estimateTokens(text)
    // "Hello world" 大约 2-3 个 token
    expect(tokens).toBeGreaterThan(0)
    expect(tokens).toBeLessThan(10)
  })

  it('中文文本返回合理 token 数', () => {
    const text = '你好世界'
    const tokens = estimateTokens(text)
    expect(tokens).toBeGreaterThan(0)
    // 4 个中文字符通常 4-8 个 token
    expect(tokens).toBeLessThan(20)
  })

  it('长文本 token 数大于短文本', () => {
    const short = 'Hello'
    const long = 'Hello world, this is a longer sentence for testing.'
    expect(estimateTokens(long)).toBeGreaterThan(estimateTokens(short))
  })
})

describe('countMessageTokens', () => {
  it('包含角色开销约 4 token', () => {
    const msg: AgentMessageSnapshot = {
      role: 'user',
      content: '',
      timestamp: Date.now(),
    }
    // 空内容，只有角色开销
    expect(countMessageTokens(msg)).toBe(4)
  })

  it('带 toolName 的消息包含工具名 token + 2', () => {
    const msg: AgentMessageSnapshot = {
      role: 'assistant',
      content: '执行工具',
      toolName: 'read_file',
      timestamp: Date.now(),
    }
    const tokens = countMessageTokens(msg)
    // 4 (角色) + content tokens + toolName tokens + 2
    expect(tokens).toBeGreaterThan(4 + estimateTokens('执行工具'))
  })

  it('无 toolName 的消息不包含工具名开销', () => {
    const msg: AgentMessageSnapshot = {
      role: 'user',
      content: '测试内容',
      timestamp: Date.now(),
    }
    const tokens = countMessageTokens(msg)
    expect(tokens).toBe(4 + estimateTokens('测试内容'))
  })
})

describe('countMessagesTokens', () => {
  it('空消息列表返回 0', () => {
    expect(countMessagesTokens([])).toBe(0)
  })

  it('多条消息包含分隔符开销（每条 3 token）', () => {
    const messages: AgentMessageSnapshot[] = [
      { role: 'user', content: '你好', timestamp: Date.now() },
      { role: 'assistant', content: '你好！', timestamp: Date.now() },
    ]
    const total = countMessagesTokens(messages)
    const sumOfIndividual = messages.reduce((s, m) => s + countMessageTokens(m), 0)
    // 总数 = 各消息 token 之和 + 消息数 * 3
    expect(total).toBe(sumOfIndividual + messages.length * 3)
  })

  it('消息越多总 token 越大', () => {
    const oneMsg: AgentMessageSnapshot[] = [
      { role: 'user', content: '测试', timestamp: Date.now() },
    ]
    const threeMsgs: AgentMessageSnapshot[] = [
      { role: 'user', content: '测试', timestamp: Date.now() },
      { role: 'assistant', content: '回复', timestamp: Date.now() },
      { role: 'user', content: '再问', timestamp: Date.now() },
    ]
    expect(countMessagesTokens(threeMsgs)).toBeGreaterThan(countMessagesTokens(oneMsg))
  })
})
