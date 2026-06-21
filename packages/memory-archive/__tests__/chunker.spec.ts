/**
 * chunker 单元测试（P8 主题分块算法）
 */
import { describe, it, expect } from 'vitest'
import {
  detectOutputType,
  chunkMessages,
  extractChunkTitles,
  type ChunkingConfig,
} from '../src/utils/chunker'
import type { AgentMessageSnapshot } from '../src/types'

const DEFAULT_CONFIG: ChunkingConfig = {
  minChunkTokens: 100,
  maxChunkTokens: 500,
}

function makeMsg(
  role: AgentMessageSnapshot['role'],
  content: string,
  extra?: Partial<AgentMessageSnapshot>
): AgentMessageSnapshot {
  return { role, content, timestamp: Date.now(), ...extra }
}

describe('detectOutputType', () => {
  it('metadata.outputType 优先级最高', () => {
    const msg = makeMsg('assistant', '```code```', {
      metadata: { outputType: 'creative' },
    })
    expect(detectOutputType(msg)).toBe('creative')
  })

  it('有 toolName 时返回 tool_call', () => {
    const msg = makeMsg('assistant', '调用工具', { toolName: 'read_file' })
    expect(detectOutputType(msg)).toBe('tool_call')
  })

  it('代码块返回 code', () => {
    const msg = makeMsg('assistant', '```js\nconsole.log(1)\n```')
    expect(detectOutputType(msg)).toBe('code')
  })

  it('metadata.entityOp 返回 entity_op', () => {
    const msg = makeMsg('assistant', '创建实体', { metadata: { entityOp: true } })
    expect(detectOutputType(msg)).toBe('entity_op')
  })

  it('分析类关键词返回 analysis', () => {
    const msg = makeMsg('assistant', '因为所以结论是...')
    expect(detectOutputType(msg)).toBe('analysis')
  })

  it('创意类关键词返回 creative', () => {
    const msg = makeMsg('assistant', '设计一个角色场景')
    expect(detectOutputType(msg)).toBe('creative')
  })

  it('默认返回 text', () => {
    const msg = makeMsg('assistant', '普通回复')
    expect(detectOutputType(msg)).toBe('text')
  })
})

describe('chunkMessages', () => {
  it('空消息列表返回空数组', () => {
    expect(chunkMessages([], DEFAULT_CONFIG)).toEqual([])
  })

  it('单条消息返回单个分块', () => {
    const msgs = [makeMsg('user', '你好')]
    const chunks = chunkMessages(msgs, DEFAULT_CONFIG)
    expect(chunks).toHaveLength(1)
    expect(chunks[0].messages).toHaveLength(1)
  })

  it('新 user 消息触发新分块', () => {
    // 使用足够长的内容确保每个块超过 minChunkTokens=100
    const longContent = '这是一段足够长的用户消息内容用于测试主题分块算法，需要确保 token 数超过最小分块阈值。'.repeat(5)
    const longReply = '这是助手的回复内容，同样需要足够长以确保 token 数超过最小分块阈值，包含足够的信息量。'.repeat(5)
    const msgs = [
      makeMsg('user', longContent),
      makeMsg('assistant', longReply),
      makeMsg('user', longContent + '第二个问题'),
      makeMsg('assistant', longReply + '第二个回答'),
    ]
    const chunks = chunkMessages(msgs, DEFAULT_CONFIG)
    expect(chunks.length).toBeGreaterThanOrEqual(2)
  })

  it('工具调用链不拆分（P8 决策）', () => {
    const longContent = 'A'.repeat(600) // 超过 maxChunkTokens
    const msgs = [
      makeMsg('user', '请读取文件'),
      makeMsg('assistant', '调用工具', { toolName: 'read_file', toolCallId: 'tc1' }),
      makeMsg('tool', '文件内容' + longContent),
      makeMsg('assistant', '这是文件内容分析'),
    ]
    const chunks = chunkMessages(msgs, { minChunkTokens: 10, maxChunkTokens: 200 })
    // 工具调用链（assistant+toolName → tool）不应被拆分
    const toolChunk = chunks.find(c =>
      c.messages.some(m => m.role === 'tool')
    )
    expect(toolChunk).toBeDefined()
    // tool 消息和它的 assistant 调用者应在同一块
    if (toolChunk) {
      const toolIdx = toolChunk.messages.findIndex(m => m.role === 'tool')
      const callerIdx = toolChunk.messages.findIndex(m => m.toolName)
      expect(toolIdx).toBeGreaterThan(-1)
      expect(callerIdx).toBeGreaterThan(-1)
      expect(callerIdx).toBeLessThan(toolIdx)
    }
  })

  it('超过 maxChunkTokens 强制拆分', () => {
    // 使用足够长的内容确保 token 数超过 maxChunkTokens=500
    // gpt-tokenizer 对重复字符编码效率高，需要更长的内容
    const longContent = '这是一个用于测试强制拆分的超长文本内容。'.repeat(200)
    const msgs = [
      makeMsg('user', longContent),
      makeMsg('assistant', longContent),
    ]
    const chunks = chunkMessages(msgs, DEFAULT_CONFIG)
    // 应该被拆分
    expect(chunks.length).toBeGreaterThanOrEqual(2)
  })

  it('分块包含正确的字段', () => {
    const msgs = [makeMsg('user', '测试内容')]
    const chunks = chunkMessages(msgs, DEFAULT_CONFIG)
    const chunk = chunks[0]
    expect(chunk.chunkId).toBeDefined()
    expect(chunk.title).toBeDefined()
    expect(chunk.outputType).toBeDefined()
    expect(chunk.userMessageAnchor).toBeDefined()
    expect(chunk.tokenCount).toBeGreaterThan(0)
    expect(chunk.messages).toHaveLength(1)
  })

  it('userMessageAnchor 取自首条 user 消息（截断到 50 字符）', () => {
    const longUserMsg = '这是一段很长的用户消息内容'.repeat(10)
    const msgs = [makeMsg('user', longUserMsg)]
    const chunks = chunkMessages(msgs, DEFAULT_CONFIG)
    expect(chunks[0].userMessageAnchor.length).toBeLessThanOrEqual(50)
  })
})

describe('extractChunkTitles', () => {
  it('正确提取 ChunkTitle 数组', () => {
    const msgs = [makeMsg('user', '测试')]
    const chunks = chunkMessages(msgs, DEFAULT_CONFIG)
    const titles = extractChunkTitles(chunks)
    expect(titles).toHaveLength(chunks.length)
    titles.forEach((t, i) => {
      expect(t.chunkId).toBe(chunks[i].chunkId)
      expect(t.title).toBe(chunks[i].title)
      expect(t.outputType).toBe(chunks[i].outputType)
      expect(t.userMessageAnchor).toBe(chunks[i].userMessageAnchor)
      expect(t.tokenCount).toBe(chunks[i].tokenCount)
    })
  })

  it('空分块列表返回空数组', () => {
    expect(extractChunkTitles([])).toEqual([])
  })
})
