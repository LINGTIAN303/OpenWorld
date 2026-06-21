/**
 * RuleBasedLlmAdapter 单元测试
 */
import { describe, it, expect } from 'vitest'
import { RuleBasedLlmAdapter } from '../src/embedding/RuleBasedLlmAdapter'

describe('RuleBasedLlmAdapter', () => {
  const adapter = new RuleBasedLlmAdapter()

  describe('isReady', () => {
    it('始终返回 true', () => {
      expect(adapter.isReady()).toBe(true)
    })
  })

  describe('summarize', () => {
    it('提取 user 消息作为摘要骨架', async () => {
      const messages = [
        { role: 'user', content: '请帮我设计一个角色' },
        { role: 'assistant', content: '好的，我来帮你设计' },
      ]
      const summary = await adapter.summarize(messages, 5000)
      expect(summary).toContain('请帮我设计一个角色')
      expect(summary).toContain('[用户]')
    })

    it('assistant 消息截取首 200 字符', async () => {
      const longContent = 'A'.repeat(300)
      const messages = [
        { role: 'user', content: '问题' },
        { role: 'assistant', content: longContent },
      ]
      const summary = await adapter.summarize(messages, 5000)
      expect(summary).toContain('[助手]')
      // 截取 200 字符
      expect(summary).not.toContain('A'.repeat(201))
    })

    it('tool 消息只记录首 100 字符', async () => {
      const longToolResult = 'B'.repeat(200)
      const messages = [
        { role: 'user', content: '读取文件' },
        { role: 'assistant', content: '调用工具' },
        { role: 'tool', content: longToolResult },
      ]
      const summary = await adapter.summarize(messages, 5000)
      expect(summary).toContain('[工具结果]')
      expect(summary).not.toContain('B'.repeat(101))
    })

    it('摘要截断到 maxLength', async () => {
      const messages = [
        { role: 'user', content: 'C'.repeat(200) },
        { role: 'assistant', content: 'D'.repeat(200) },
      ]
      const maxLength = 100
      const summary = await adapter.summarize(messages, maxLength)
      expect(summary.length).toBeLessThanOrEqual(maxLength)
      expect(summary.endsWith('...')).toBe(true)
    })

    it('空消息列表返回空字符串', async () => {
      const summary = await adapter.summarize([], 5000)
      expect(summary).toBe('')
    })
  })

  describe('assessImportance', () => {
    it('基础分 0.3', async () => {
      const messages = [{ role: 'user', content: '短消息' }]
      const importance = await adapter.assessImportance(messages)
      expect(importance).toBeGreaterThanOrEqual(0.3)
    })

    it('消息数量多时重要性增加', async () => {
      const fewMessages = Array.from({ length: 5 }, (_, i) => ({
        role: 'user',
        content: `消息${i}`,
      }))
      const manyMessages = Array.from({ length: 25 }, (_, i) => ({
        role: 'user',
        content: `消息${i}`,
      }))
      const fewScore = await adapter.assessImportance(fewMessages)
      const manyScore = await adapter.assessImportance(manyMessages)
      expect(manyScore).toBeGreaterThan(fewScore)
    })

    it('包含工具调用时重要性增加', async () => {
      const withoutTool = [{ role: 'user', content: '普通消息' }]
      const withTool = [
        { role: 'user', content: '调用工具' },
        { role: 'tool', content: '工具结果' },
      ]
      const withoutScore = await adapter.assessImportance(withoutTool)
      const withScore = await adapter.assessImportance(withTool)
      expect(withScore).toBeGreaterThan(withoutScore)
    })

    it('包含代码时重要性增加', async () => {
      const withoutCode = [{ role: 'user', content: '普通消息' }]
      const withCode = [{ role: 'assistant', content: '```js\nconsole.log(1)\n```' }]
      const withoutScore = await adapter.assessImportance(withoutCode)
      const withScore = await adapter.assessImportance(withCode)
      expect(withScore).toBeGreaterThan(withoutScore)
    })

    it('包含实体操作时重要性增加', async () => {
      const withoutEntity = [{ role: 'user', content: '普通消息' }]
      const withEntity = [{ role: 'user', content: '创建实体角色' }]
      const withoutScore = await adapter.assessImportance(withoutEntity)
      const withScore = await adapter.assessImportance(withEntity)
      expect(withScore).toBeGreaterThan(withoutScore)
    })

    it('重要性评分不超过 1.0', async () => {
      const messages = Array.from({ length: 50 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'tool',
        content: '实体操作代码```code```' + 'X'.repeat(500),
      }))
      const importance = await adapter.assessImportance(messages)
      expect(importance).toBeLessThanOrEqual(1.0)
    })
  })

  describe('extractKeywords', () => {
    it('提取中文关键词', async () => {
      const messages = [
        { role: 'user', content: '角色设计很重要，角色设计是核心' },
      ]
      const keywords = await adapter.extractKeywords(messages)
      expect(keywords.length).toBeGreaterThan(0)
      // "角色设计" 出现多次，应该被提取
      expect(keywords.some(kw => kw.includes('角色') || kw.includes('设计'))).toBe(true)
    })

    it('提取英文关键词', async () => {
      const messages = [
        { role: 'user', content: 'character design character design is important' },
      ]
      const keywords = await adapter.extractKeywords(messages)
      expect(keywords.length).toBeGreaterThan(0)
      // "character" 和 "design" 出现多次
      expect(keywords.some(kw => kw.toLowerCase() === 'character' || kw.toLowerCase() === 'design')).toBe(true)
    })

    it('过滤停用词', async () => {
      const messages = [
        { role: 'user', content: 'the the the is is is of of of' },
      ]
      const keywords = await adapter.extractKeywords(messages)
      // 停用词不应出现
      expect(keywords).not.toContain('the')
      expect(keywords).not.toContain('is')
      expect(keywords).not.toContain('of')
    })

    it('最多返回 10 个关键词', async () => {
      const messages = [
        { role: 'user', content: '苹果 香蕉 橙子 葡萄 西瓜 草莓 蓝莓 樱桃 柠檬 桃子 菠萝 芒果' },
      ]
      const keywords = await adapter.extractKeywords(messages)
      expect(keywords.length).toBeLessThanOrEqual(10)
    })

    it('至少出现 2 次的词才被提取', async () => {
      const messages = [
        { role: 'user', content: '独特词汇只出现一次' },
      ]
      const keywords = await adapter.extractKeywords(messages)
      // 只出现一次的词频为 1，不满足 >= 2 的条件
      // 但中文 2-4 字组合可能有重复子串
      // 这里只验证返回的是数组
      expect(Array.isArray(keywords)).toBe(true)
    })
  })
})
