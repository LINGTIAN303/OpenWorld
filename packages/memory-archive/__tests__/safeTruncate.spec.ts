/**
 * safeTruncate 单元测试（P11 安全截断）
 */
import { describe, it, expect } from 'vitest'
import { findSafeTruncatePoint, validateTruncatedMessages } from '../src/utils/safeTruncate'
import type { AgentMessageSnapshot } from '../src/types'

function makeMsg(
  role: AgentMessageSnapshot['role'],
  content: string,
  extra?: Partial<AgentMessageSnapshot>
): AgentMessageSnapshot {
  return { role, content, timestamp: Date.now(), ...extra }
}

describe('findSafeTruncatePoint', () => {
  it('targetIndex <= 0 返回 0', () => {
    const msgs = [makeMsg('user', '你好')]
    expect(findSafeTruncatePoint(msgs, 0)).toBe(0)
  })

  it('targetIndex >= length 返回 length', () => {
    const msgs = [makeMsg('user', '你好')]
    expect(findSafeTruncatePoint(msgs, 5)).toBe(1)
  })

  it('在 user 消息处安全截断', () => {
    const msgs = [
      makeMsg('user', '第一个问题'),
      makeMsg('assistant', '第一个回答'),
      makeMsg('user', '第二个问题'),
      makeMsg('assistant', '第二个回答'),
    ]
    // targetIndex=2（第二个 user 消息），是安全截断点
    expect(findSafeTruncatePoint(msgs, 2)).toBe(2)
  })

  it('不在 user 消息处时向前查找', () => {
    const msgs = [
      makeMsg('user', '第一个问题'),
      makeMsg('assistant', '第一个回答'),
      makeMsg('user', '第二个问题'),
      makeMsg('assistant', '第二个回答'),
    ]
    // targetIndex=3（assistant 消息），向前查找找到 index=2（user 消息）
    expect(findSafeTruncatePoint(msgs, 3)).toBe(2)
  })

  it('前一条是 tool 消息时不在此处截断', () => {
    const msgs = [
      makeMsg('user', '问题'),
      makeMsg('assistant', '调用工具', { toolName: 'read_file', toolCallId: 'tc1' }),
      makeMsg('tool', '工具结果'),
      makeMsg('user', '下一个问题'),
    ]
    // targetIndex=3（user 消息），但前一条是 tool 消息，不是安全截断点
    // 向前查找：i=2(tool)不是 user，i=1(assistant)不是 user，i=0 不在循环范围
    // 找不到安全截断点，返回原长度（不截断）
    const result = findSafeTruncatePoint(msgs, 3)
    expect(result).toBe(msgs.length)
  })

  it('前一条是带 toolName 的 assistant 时不在此处截断', () => {
    const msgs = [
      makeMsg('user', '问题'),
      makeMsg('assistant', '调用工具', { toolName: 'read_file', toolCallId: 'tc1' }),
      makeMsg('user', '下一个问题'),
    ]
    // targetIndex=2（user 消息），但前一条是带 toolName 的 assistant，不是安全截断点
    // 向前查找：i=1(assistant)不是 user，i=0 不在循环范围
    // 找不到安全截断点，返回原长度（不截断）
    const result = findSafeTruncatePoint(msgs, 2)
    expect(result).toBe(msgs.length)
  })

  it('找不到安全截断点时返回原长度（不截断）', () => {
    const msgs = [
      makeMsg('assistant', '没有 user 消息的对话'),
      makeMsg('assistant', '另一条 assistant 消息'),
    ]
    // 没有任何 user 消息，找不到安全截断点
    expect(findSafeTruncatePoint(msgs, 1)).toBe(msgs.length)
  })
})

describe('validateTruncatedMessages', () => {
  it('正常消息列表验证通过', () => {
    const msgs = [
      makeMsg('user', '问题'),
      makeMsg('assistant', '回答'),
    ]
    const result = validateTruncatedMessages(msgs)
    expect(result.valid).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('检测到孤立的 tool 消息（首条是 tool）', () => {
    const msgs = [
      makeMsg('tool', '工具结果'),
      makeMsg('user', '问题'),
    ]
    const result = validateTruncatedMessages(msgs)
    expect(result.valid).toBe(false)
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('检测到末尾未完成的工具调用链', () => {
    const msgs = [
      makeMsg('user', '问题'),
      makeMsg('assistant', '调用工具', { toolName: 'read_file', toolCallId: 'tc1' }),
    ]
    const result = validateTruncatedMessages(msgs)
    expect(result.valid).toBe(false)
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('完整的工具调用链验证通过', () => {
    const msgs = [
      makeMsg('user', '请读取文件'),
      makeMsg('assistant', '调用工具', { toolName: 'read_file', toolCallId: 'tc1' }),
      makeMsg('tool', '文件内容'),
      makeMsg('assistant', '这是文件内容'),
    ]
    const result = validateTruncatedMessages(msgs)
    expect(result.valid).toBe(true)
  })

  it('空消息列表验证通过', () => {
    const result = validateTruncatedMessages([])
    expect(result.valid).toBe(true)
  })
})
