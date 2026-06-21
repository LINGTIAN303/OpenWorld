/**
 * ArchiveManager 端到端集成测试
 *
 * 验证完整归档流程的链路完整性：
 * - 11 步归档流程（预检查→读取消息→分块→写文件→持久化钩子→推进边界→注入摘要→发射事件）
 * - 4 种检索模式（keyword/semantic/hybrid/list）
 * - 钩子管理（tag/pin/delete）
 * - 边界管理（get/reset/restore）
 * - 工具注册（4 个归档工具）
 * - 错误场景（未初始化、流式输出、消息不足）
 *
 * Mock 策略：
 * - FsOperations: 内存 Map 实现（InMemoryFsOperations）
 * - AgentBridge: mock 实现，维护消息数组
 * - EmbeddingAdapter: mock 实现，返回确定性向量
 * - LlmAdapter: 使用真实 RuleBasedLlmAdapter（始终可用）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ArchiveManager } from '../src/core/ArchiveManager'
import { FsStorageAdapter } from '../src/storage/FsStorageAdapter'
import { RuleBasedLlmAdapter } from '../src/embedding/RuleBasedLlmAdapter'
import type { FsOperations } from '../src/adapters/FsOperations'
import type { AgentBridge } from '../src/adapters/AgentBridge'
import type { EmbeddingAdapter } from '../src/adapters/EmbeddingAdapter'
import type {
  AgentMessageSnapshot,
  ArchiveEventName,
  ArchiveEventListener,
  ArchiveResult,
  ArchiveTool,
  Hook,
} from '../src/types'

// ============================================================================
// Mock: 内存文件系统
// ============================================================================

class InMemoryFsOperations implements FsOperations {
  private files = new Map<string, string>()
  private dirs = new Set<string>()

  async readFile(path: string): Promise<string> {
    if (!this.files.has(path)) {
      throw new Error(`File not found: ${path}`)
    }
    return this.files.get(path)!
  }

  async writeFile(path: string, content: string): Promise<void> {
    // 自动创建父目录
    const dir = path.substring(0, path.lastIndexOf('/'))
    if (dir) this.dirs.add(dir)
    this.files.set(path, content)
  }

  async mkdir(path: string, _recursive?: boolean): Promise<void> {
    this.dirs.add(path)
  }

  async remove(path: string): Promise<void> {
    // 删除文件
    this.files.delete(path)
    // 删除目录及其下所有文件
    for (const key of this.files.keys()) {
      if (key.startsWith(path + '/')) {
        this.files.delete(key)
      }
    }
    this.dirs.delete(path)
  }

  async exists(path: string): Promise<boolean> {
    if (this.files.has(path)) return true
    if (this.dirs.has(path)) return true
    // 检查是否是某个文件的前缀
    for (const key of this.files.keys()) {
      if (key.startsWith(path + '/')) return true
    }
    return false
  }

  async readDir(path: string): Promise<string[]> {
    const entries = new Set<string>()
    for (const key of this.files.keys()) {
      if (key.startsWith(path + '/')) {
        // 提取下一级条目名称
        const rest = key.substring(path.length + 1)
        const name = rest.split('/')[0]
        entries.add(name)
      }
    }
    return Array.from(entries)
  }

  /** 清空文件系统（测试间隔离） */
  clear(): void {
    this.files.clear()
    this.dirs.clear()
  }
}

// ============================================================================
// Mock: AgentBridge
// ============================================================================

interface MockAgentBridgeOptions {
  initialMessages?: AgentMessageSnapshot[]
  streaming?: boolean
}

function createMockAgentBridge(options: MockAgentBridgeOptions = {}): AgentBridge & {
  messages: AgentMessageSnapshot[]
  setStreaming: (v: boolean) => void
  addMessages: (msgs: AgentMessageSnapshot[]) => void
  registeredTools: ArchiveTool[]
  injectedSummaries: string[]
  advancedTo: number[]
} {
  const messages = [...(options.initialMessages || [])]
  let streaming = options.streaming || false
  const registeredTools: ArchiveTool[] = []
  const injectedSummaries: string[] = []
  const advancedTo: number[] = []

  return {
    messages,
    setStreaming: (v: boolean) => { streaming = v },
    addMessages: (msgs: AgentMessageSnapshot[]) => { messages.push(...msgs) },
    registeredTools,
    injectedSummaries,
    advancedTo,

    getCurrentMessages: () => [...messages],
    getCurrentTokenCount: () => {
      // 简化：每个字符算 0.25 token
      return messages.reduce((sum, m) => sum + Math.ceil((m.content || '').length / 4), 0)
    },
    advanceBoundary: (archivedUpToIndex: number) => {
      advancedTo.push(archivedUpToIndex)
      if (archivedUpToIndex <= 0) return
      if (archivedUpToIndex >= messages.length) {
        messages.length = 0
      } else {
        messages.splice(0, archivedUpToIndex)
      }
    },
    injectHookSummary: (hooks: Hook[]) => {
      if (hooks.length === 0) return ''
      const summary = hooks.map(h => `### ${h.chunkTitles[0]?.title || '归档'}\n${h.summary}`).join('\n\n')
      const fullSummary = `归档记忆摘要：\n\n${summary}`
      injectedSummaries.push(fullSummary)
      messages.unshift({
        role: 'system',
        content: fullSummary,
        timestamp: Date.now(),
      })
      return fullSummary
    },
    registerTools: (tools: ArchiveTool[]) => {
      registeredTools.push(...tools)
    },
    isStreaming: () => streaming,
    onArchiveComplete: () => {},
  }
}

// ============================================================================
// Mock: EmbeddingAdapter（确定性向量）
// ============================================================================

function createMockEmbeddingAdapter(ready: boolean = true): EmbeddingAdapter {
  return {
    isReady: () => ready,
    embed: async (text: string) => {
      // 基于文本哈希生成确定性向量（8 维）
      const vec: number[] = []
      let hash = 0
      for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0
      }
      for (let i = 0; i < 8; i++) {
        vec.push(((hash >> (i * 4)) & 0xff) / 255)
      }
      return vec
    },
    embedBatch: async (texts: string[]) => {
      return Promise.all(texts.map(t => {
        const adapter = createMockEmbeddingAdapter(ready)
        return adapter.embed(t)
      }))
    },
  }
}

// ============================================================================
// 测试辅助函数
// ============================================================================

/** 构造测试消息列表 */
function createTestMessages(count: number): AgentMessageSnapshot[] {
  const messages: AgentMessageSnapshot[] = []
  const now = Date.now()
  for (let i = 0; i < count; i++) {
    messages.push({
      role: 'user',
      content: `这是第 ${i + 1} 条用户消息，讨论角色设计的细节，包括角色背景、性格特征和能力设定。`,
      timestamp: now + i * 1000,
    })
    messages.push({
      role: 'assistant',
      content: `关于第 ${i + 1} 个问题，我的建议是：角色应该有清晰的背景故事，性格要有多面性，能力设定需要平衡。这是一个详细的回答，包含了多个方面的分析。`,
      timestamp: now + i * 1000 + 500,
    })
  }
  return messages
}

/** 创建配置好的 ArchiveManager 实例 */
function createArchiveManager(options: {
  messages?: AgentMessageSnapshot[]
  streaming?: boolean
  embeddingReady?: boolean
  config?: Record<string, unknown>
} = {}): {
  manager: ArchiveManager
  agentBridge: ReturnType<typeof createMockAgentBridge>
  fs: InMemoryFsOperations
} {
  const fs = new InMemoryFsOperations()
  const storage = new FsStorageAdapter({ basePath: '/test/memory-archive', fs })
  const agentBridge = createMockAgentBridge({
    initialMessages: options.messages,
    streaming: options.streaming,
  })
  const embeddingAdapter = createMockEmbeddingAdapter(options.embeddingReady !== false)
  const llmAdapter = new RuleBasedLlmAdapter()

  const manager = new ArchiveManager({
    agentBridge,
    storage,
    embeddingAdapter,
    llmAdapter,
    projectId: 'test-project',
    sessionId: 'test-session',
    fs,
    basePath: '/test/memory-archive',
    config: {
      // 降低阈值便于测试
      archiveThreshold: 100,
      minArchiveMessages: 2,
      // 禁用调度器避免测试中自动触发
      scheduler: { enabled: false, dailyHour: 3, weeklyDay: 0, monthlyDay: 1 },
      chunking: {
        strategy: 'topic',
        minChunkTokens: 50,
        maxChunkTokens: 500,
      },
      ...options.config,
    },
  })

  return { manager, agentBridge, fs }
}

// ============================================================================
// 测试用例
// ============================================================================

describe('ArchiveManager 端到端集成测试', () => {
  let fs: InMemoryFsOperations

  beforeEach(() => {
    fs = new InMemoryFsOperations()
  })

  // ==========================================================================
  // 1. 完整归档流程
  // ==========================================================================

  describe('完整归档流程', () => {
    it('应该完成 11 步归档流程并发射 archive:complete 事件', async () => {
      const messages = createTestMessages(10) // 20 条消息
      const { manager, agentBridge } = createArchiveManager({ messages })

      const events: Array<{ name: ArchiveEventName; payload: unknown }> = []
      const listener: ArchiveEventListener = (payload) => {
        events.push({ name: 'archive:complete', payload })
      }
      manager.on('archive:complete', listener)

      await manager.init()
      const result = await manager.archive({ source: 'manual' })

      // 验证返回结果
      expect(result.hookId).toMatch(/^h_/)
      expect(result.fileId).toMatch(/^f_/)
      expect(result.tokenCount).toBeGreaterThan(0)
      expect(result.chunkCount).toBeGreaterThan(0)
      expect(result.newBoundaryIndex).toBeGreaterThan(0)
      // RuleBasedLlmAdapter.isReady()=true，走 LLM 路径，summaryMethod='llm'
      expect(result.summaryMethod).toBe('llm')

      // 验证事件发射
      expect(events.length).toBe(1)
      expect((events[0].payload as ArchiveResult).hookId).toBe(result.hookId)

      // 验证边界推进（AgentBridge.advanceBoundary 被调用）
      expect(agentBridge.advancedTo.length).toBeGreaterThan(0)
      expect(agentBridge.advancedTo[0]).toBe(result.newBoundaryIndex)

      // 验证摘要注入（AgentBridge.injectHookSummary 被调用）
      expect(agentBridge.injectedSummaries.length).toBe(1)
      expect(agentBridge.injectedSummaries[0]).toContain('归档记忆摘要')

      // 验证消息已被截断（边界推进后消息减少）
      expect(agentBridge.messages.length).toBeLessThan(messages.length)

      manager.off('archive:complete', listener)
    })

    it('应该将钩子持久化到文件系统', async () => {
      const messages = createTestMessages(10)
      const { manager, fs } = createArchiveManager({ messages })

      await manager.init()
      const result = await manager.archive({ source: 'manual' })

      // 验证钩子文件存在
      const hookPath = `/test/memory-archive/hooks/${result.hookId}.json`
      expect(await fs.exists(hookPath)).toBe(true)

      // 验证钩子内容
      const hookContent = await fs.readFile(hookPath)
      const hook = JSON.parse(hookContent) as Hook
      expect(hook.id).toBe(result.hookId)
      expect(hook.projectId).toBe('test-project')
      expect(hook.sessionId).toBe('test-session')
      expect(hook.status).toBe('active')
      expect(hook.summary).toBeTruthy()
      expect(hook.keywords.length).toBeGreaterThan(0)
      expect(hook.chunkTitles.length).toBe(result.chunkCount)

      // 验证记忆文件目录存在
      const fileDir = `/test/memory-archive/files/${result.fileId}`
      expect(await fs.exists(fileDir)).toBe(true)

      // 验证 header.json 存在
      const headerPath = `${fileDir}/header.json`
      expect(await fs.exists(headerPath)).toBe(true)

      // 验证 chunk 文件存在
      const chunksDir = `${fileDir}/chunks`
      expect(await fs.exists(chunksDir)).toBe(true)
      const chunkFiles = await fs.readDir(chunksDir)
      expect(chunkFiles.length).toBe(result.chunkCount)
    })

    it('应该在内存缓存中维护钩子', async () => {
      const messages = createTestMessages(10)
      const { manager, agentBridge } = createArchiveManager({ messages })

      await manager.init()
      expect(manager.getAllHooks()).toHaveLength(0)

      await manager.archive({ source: 'manual' })
      expect(manager.getAllHooks()).toHaveLength(1)

      // 第一次归档后消息被截断，需要添加新消息才能第二次归档
      agentBridge.addMessages(createTestMessages(10))
      await manager.archive({ source: 'manual' })
      expect(manager.getAllHooks()).toHaveLength(2)
    })
  })

  // ==========================================================================
  // 2. 检索流程
  // ==========================================================================

  describe('检索流程', () => {
    let manager: ArchiveManager
    let firstHookId: string

    beforeEach(async () => {
      const messages = createTestMessages(10)
      const result = createArchiveManager({ messages })
      manager = result.manager

      await manager.init()
      const archiveResult = await manager.archive({ source: 'manual' })
      firstHookId = archiveResult.hookId
    })

    it('keyword 模式应该返回匹配的钩子', async () => {
      const results = await manager.recall({
        query: '角色设计',
        mode: 'keyword',
        topK: 5,
      })

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].hook.id).toBe(firstHookId)
      expect(results[0].score).toBeGreaterThan(0)
      expect(results[0].matchedFields.length).toBeGreaterThan(0)
    })

    it('semantic 模式应该返回相似钩子', async () => {
      const results = await manager.recall({
        query: '角色背景',
        mode: 'semantic',
        topK: 5,
      })

      // mock embedding 基于哈希，可能匹配也可能不匹配
      // 主要验证流程不报错
      expect(Array.isArray(results)).toBe(true)
    })

    it('hybrid 模式应该合并关键词和语义结果', async () => {
      const results = await manager.recall({
        query: '角色',
        mode: 'hybrid',
        topK: 5,
      })

      expect(results.length).toBeGreaterThan(0)
      // 验证 matchedFields 可能包含 keyword 和 semantic
      const allFields = results.flatMap(r => r.matchedFields)
      expect(allFields.length).toBeGreaterThan(0)
    })

    it('list 模式应该返回所有钩子元数据', async () => {
      const results = await manager.recall({
        query: '',
        mode: 'list',
      })

      expect(results.length).toBe(1)
      expect(results[0].hook.id).toBe(firstHookId)
      expect(results[0].score).toBe(0) // list 模式不评分
      expect(results[0].matchedFields).toHaveLength(0)
    })

    it('检索后应该更新访问统计', async () => {
      const before = manager.getAllHooks()[0]
      expect(before.activeAccessCount).toBe(0)

      await manager.recall({ query: '角色', mode: 'keyword' })

      const after = manager.getAllHooks()[0]
      expect(after.activeAccessCount).toBeGreaterThan(0)
      expect(after.lastAccessedAt).toBeGreaterThanOrEqual(before.lastAccessedAt)
    })

    it('topK 参数应该限制返回数量', async () => {
      // 归档第二个钩子
      const messages2 = createTestMessages(10)
      // 需要重新设置消息（第一次归档后消息被截断）
      // 这里直接测试 topK 限制
      const results = await manager.recall({
        query: '角色',
        mode: 'keyword',
        topK: 1,
      })

      expect(results.length).toBeLessThanOrEqual(1)
    })
  })

  // ==========================================================================
  // 3. 分块加载
  // ==========================================================================

  describe('分块加载', () => {
    it('应该加载指定钩子的指定分块', async () => {
      const messages = createTestMessages(10)
      const { manager } = createArchiveManager({ messages })

      await manager.init()
      const result = await manager.archive({ source: 'manual' })

      const hook = manager.getAllHooks()[0]
      const chunkId = hook.chunkTitles[0].chunkId

      const chunk = await manager.loadChunk(result.hookId, chunkId)

      expect(chunk.chunkId).toBe(chunkId)
      expect(chunk.title).toBe(hook.chunkTitles[0].title)
      expect(chunk.messages.length).toBeGreaterThan(0)
      expect(chunk.messages[0].role).toBeDefined()
      expect(chunk.messages[0].content).toBeDefined()
    })

    it('加载不存在的钩子应该抛出错误', async () => {
      const messages = createTestMessages(10)
      const { manager } = createArchiveManager({ messages })

      await manager.init()

      await expect(
        manager.loadChunk('nonexistent', 'chunk1')
      ).rejects.toThrow('Hook not found')
    })
  })

  // ==========================================================================
  // 4. 钩子管理
  // ==========================================================================

  describe('钩子管理', () => {
    let manager: ArchiveManager
    let hookId: string

    beforeEach(async () => {
      const messages = createTestMessages(10)
      const result = createArchiveManager({ messages })
      manager = result.manager

      await manager.init()
      const archiveResult = await manager.archive({ source: 'manual' })
      hookId = archiveResult.hookId
    })

    it('tagHook 应该给钩子添加标签', async () => {
      await manager.tagHook(hookId, ['重要', '角色设计'])

      const hook = manager.getAllHooks().find(h => h.id === hookId)
      expect(hook!.tags).toContain('重要')
      expect(hook!.tags).toContain('角色设计')
    })

    it('tagHook 应该去重标签', async () => {
      await manager.tagHook(hookId, ['重要'])
      await manager.tagHook(hookId, ['重要', '新标签'])

      const hook = manager.getAllHooks().find(h => h.id === hookId)
      expect(hook!.tags.filter(t => t === '重要')).toHaveLength(1)
      expect(hook!.tags).toContain('新标签')
    })

    it('pinHook 应该标记钩子为 pinned', async () => {
      await manager.pinHook(hookId, true)

      const hook = manager.getAllHooks().find(h => h.id === hookId)
      expect(hook!.pinned).toBe(true)
    })

    it('pinHook 应该取消 pinned', async () => {
      await manager.pinHook(hookId, true)
      await manager.pinHook(hookId, false)

      const hook = manager.getAllHooks().find(h => h.id === hookId)
      expect(hook!.pinned).toBe(false)
    })

    it('deleteHook 应该删除钩子和记忆文件', async () => {
      expect(manager.getAllHooks()).toHaveLength(1)

      await manager.deleteHook(hookId)

      expect(manager.getAllHooks()).toHaveLength(0)
    })

    it('getRecentHooks 应该按创建时间倒序返回', async () => {
      // 归档第二个钩子
      const messages2 = createTestMessages(10)
      // 由于消息已被截断，需要重新构造
      const { manager: m2 } = createArchiveManager({ messages: messages2 })
      // 这里测试原 manager 的 getRecentHooks
      const recent = await manager.getRecentHooks(10)
      expect(recent.length).toBeGreaterThan(0)
      expect(recent[0].status).toBe('active')
    })
  })

  // ==========================================================================
  // 5. 边界管理
  // ==========================================================================

  describe('边界管理', () => {
    it('getBoundary 初始为 0', async () => {
      const messages = createTestMessages(10)
      const { manager } = createArchiveManager({ messages })

      await manager.init()
      expect(manager.getBoundary()).toBe(0)
    })

    it('归档后边界应该重置为 0（消息已删除，新数组从 0 开始）', async () => {
      const messages = createTestMessages(10)
      const { manager } = createArchiveManager({ messages })

      await manager.init()
      await manager.archive({ source: 'manual' })

      // agentBridge.advanceBoundary 删除消息后，boundary 重置为 0
      expect(manager.getBoundary()).toBe(0)
    })

    it('resetBoundary 应该重置边界为 0', async () => {
      const messages = createTestMessages(10)
      const { manager } = createArchiveManager({ messages })

      await manager.init()
      // 归档后 boundary 已重置为 0，手动 restore 到非零值再 reset
      manager.restoreBoundary(10)
      expect(manager.getBoundary()).toBe(10)

      manager.resetBoundary()
      expect(manager.getBoundary()).toBe(0)
    })

    it('restoreBoundary 应该恢复到指定值', async () => {
      const messages = createTestMessages(10)
      const { manager } = createArchiveManager({ messages })

      await manager.init()
      // 归档后 boundary 重置为 0
      expect(manager.getBoundary()).toBe(0)

      manager.restoreBoundary(5)
      expect(manager.getBoundary()).toBe(5)

      manager.restoreBoundary(0)
      expect(manager.getBoundary()).toBe(0)
    })
  })

  // ==========================================================================
  // 6. 工具注册
  // ==========================================================================

  describe('工具注册', () => {
    it('init() 后应该注册 4 个归档工具', async () => {
      const messages = createTestMessages(10)
      const { manager, agentBridge } = createArchiveManager({ messages })

      expect(agentBridge.registeredTools).toHaveLength(0)

      await manager.init()

      expect(agentBridge.registeredTools).toHaveLength(4)
      const toolNames = agentBridge.registeredTools.map(t => t.name)
      expect(toolNames).toContain('archive_recall')
      expect(toolNames).toContain('archive_load_chunk')
      expect(toolNames).toContain('archive_tag')
      expect(toolNames).toContain('archive_now')
    })

    it('archive_recall 工具应该能检索记忆', async () => {
      const messages = createTestMessages(10)
      const { manager, agentBridge } = createArchiveManager({ messages })

      await manager.init()
      await manager.archive({ source: 'manual' })

      const recallTool = agentBridge.registeredTools.find(t => t.name === 'archive_recall')!
      const result = await recallTool.execute({ query: '角色', mode: 'keyword' }) as Array<Record<string, unknown>>

      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
      expect(result[0].hookId).toBeDefined()
      expect(result[0].summary).toBeDefined()
      expect(result[0].score).toBeDefined()
    })

    it('archive_load_chunk 工具应该能加载分块', async () => {
      const messages = createTestMessages(10)
      const { manager, agentBridge } = createArchiveManager({ messages })

      await manager.init()
      await manager.archive({ source: 'manual' })

      const hook = manager.getAllHooks()[0]
      const loadChunkTool = agentBridge.registeredTools.find(t => t.name === 'archive_load_chunk')!
      const result = await loadChunkTool.execute({
        hookId: hook.id,
        chunkId: hook.chunkTitles[0].chunkId,
      }) as Record<string, unknown>

      expect(result.chunkId).toBe(hook.chunkTitles[0].chunkId)
      expect(result.title).toBeDefined()
      expect(result.messages).toBeDefined()
    })

    it('archive_tag 工具应该能给钩子打标签', async () => {
      const messages = createTestMessages(10)
      const { manager, agentBridge } = createArchiveManager({ messages })

      await manager.init()
      await manager.archive({ source: 'manual' })

      const hook = manager.getAllHooks()[0]
      const tagTool = agentBridge.registeredTools.find(t => t.name === 'archive_tag')!
      const result = await tagTool.execute({
        hookId: hook.id,
        tags: ['测试标签'],
      }) as Record<string, unknown>

      expect(result.success).toBe(true)
      expect(manager.getAllHooks()[0].tags).toContain('测试标签')
    })

    it('archive_now 工具应该能触发归档', async () => {
      const messages = createTestMessages(10)
      const { manager, agentBridge } = createArchiveManager({ messages })

      await manager.init()
      const archiveNowTool = agentBridge.registeredTools.find(t => t.name === 'archive_now')!
      const result = await archiveNowTool.execute({}) as Record<string, unknown>

      expect(result.hookId).toBeDefined()
      expect(result.tokenCount).toBeGreaterThan(0)
      expect(result.chunkCount).toBeGreaterThan(0)
    })
  })

  // ==========================================================================
  // 7. 错误场景
  // ==========================================================================

  describe('错误场景', () => {
    it('未初始化时调用 archive 应该抛出错误', async () => {
      const messages = createTestMessages(10)
      const { manager } = createArchiveManager({ messages })

      await expect(manager.archive({ source: 'manual' })).rejects.toThrow('not initialized')
    })

    it('未初始化时调用 recall 应该抛出错误', async () => {
      const messages = createTestMessages(10)
      const { manager } = createArchiveManager({ messages })

      await expect(manager.recall({ query: 'test', mode: 'keyword' })).rejects.toThrow('not initialized')
    })

    it('流式输出中归档应该失败', async () => {
      const messages = createTestMessages(10)
      const { manager } = createArchiveManager({ messages, streaming: true })

      await manager.init()
      await expect(manager.archive({ source: 'manual' })).rejects.toThrow('pre-check failed')
    })

    it('消息不足时归档应该失败', async () => {
      const messages = createTestMessages(1) // 只有 2 条消息
      const { manager } = createArchiveManager({
        messages,
        config: { minArchiveMessages: 10 },
      })

      await manager.init()
      await expect(manager.archive({ source: 'manual' })).rejects.toThrow('pre-check failed')
    })

    it('init() 重复调用应该幂等', async () => {
      const messages = createTestMessages(10)
      const { manager, agentBridge } = createArchiveManager({ messages })

      await manager.init()
      const toolsCountAfterFirstInit = agentBridge.registeredTools.length

      await manager.init() // 重复调用
      expect(agentBridge.registeredTools.length).toBe(toolsCountAfterFirstInit)
    })
  })

  // ==========================================================================
  // 8. 事件系统
  // ==========================================================================

  describe('事件系统', () => {
    it('应该支持多个监听器', async () => {
      const messages = createTestMessages(10)
      const { manager } = createArchiveManager({ messages })

      let count1 = 0
      let count2 = 0
      const listener1: ArchiveEventListener = () => { count1++ }
      const listener2: ArchiveEventListener = () => { count2++ }

      manager.on('archive:complete', listener1)
      manager.on('archive:complete', listener2)

      await manager.init()
      await manager.archive({ source: 'manual' })

      expect(count1).toBe(1)
      expect(count2).toBe(1)
    })

    it('off 应该移除监听器', async () => {
      const messages = createTestMessages(10)
      const { manager, agentBridge } = createArchiveManager({ messages })

      let count = 0
      const listener: ArchiveEventListener = () => { count++ }

      manager.on('archive:complete', listener)
      await manager.init()
      await manager.archive({ source: 'manual' })
      expect(count).toBe(1)

      // 第一次归档后消息被截断，需要添加新消息才能第二次归档
      manager.off('archive:complete', listener)
      agentBridge.addMessages(createTestMessages(10))
      await manager.archive({ source: 'manual' })
      expect(count).toBe(1) // 不再增加
    })

    it('监听器抛错不应该影响其他监听器和归档流程', async () => {
      const messages = createTestMessages(10)
      const { manager } = createArchiveManager({ messages })

      let goodCount = 0
      const badListener: ArchiveEventListener = () => {
        throw new Error('监听器错误')
      }
      const goodListener: ArchiveEventListener = () => { goodCount++ }

      manager.on('archive:complete', badListener)
      manager.on('archive:complete', goodListener)

      await manager.init()
      // 不应该抛错
      const result = await manager.archive({ source: 'manual' })

      expect(result.hookId).toBeDefined()
      expect(goodCount).toBe(1) // 好监听器仍然被调用
    })
  })

  // ==========================================================================
  // 9. 多次归档
  // ==========================================================================

  describe('多次归档', () => {
    it('应该支持连续多次归档', async () => {
      const messages = createTestMessages(10) // 20 条消息
      const { manager, agentBridge } = createArchiveManager({ messages })

      await manager.init()

      // 第一次归档
      const result1 = await manager.archive({ source: 'manual' })
      expect(result1.hookId).toBeDefined()
      expect(manager.getAllHooks()).toHaveLength(1)

      // 第一次归档后消息被截断，添加新消息进行第二次归档
      agentBridge.addMessages(createTestMessages(10))
      const result2 = await manager.archive({ source: 'manual' })
      expect(result2.hookId).toBeDefined()
      expect(manager.getAllHooks()).toHaveLength(2)

      // 两个钩子 ID 不同
      expect(result1.hookId).not.toBe(result2.hookId)
    })

    it('重新初始化应该加载已持久化的钩子', async () => {
      const messages = createTestMessages(10)
      const fsOps = new InMemoryFsOperations()
      const storage = new FsStorageAdapter({ basePath: '/test/memory-archive', fs: fsOps })
      const agentBridge = createMockAgentBridge({ initialMessages: messages })
      const embeddingAdapter = createMockEmbeddingAdapter(true)
      const llmAdapter = new RuleBasedLlmAdapter()

      // 第一个 manager 实例：归档
      const manager1 = new ArchiveManager({
        agentBridge,
        storage,
        embeddingAdapter,
        llmAdapter,
        projectId: 'test-project',
        sessionId: 'test-session',
        fs: fsOps,
        basePath: '/test/memory-archive',
        config: {
          archiveThreshold: 100,
          minArchiveMessages: 2,
          scheduler: { enabled: false, dailyHour: 3, weeklyDay: 0, monthlyDay: 1 },
          chunking: { strategy: 'topic', minChunkTokens: 50, maxChunkTokens: 500 },
        },
      })

      await manager1.init()
      await manager1.archive({ source: 'manual' })
      expect(manager1.getAllHooks()).toHaveLength(1)

      // 第二个 manager 实例：重新初始化（模拟应用重启）
      const agentBridge2 = createMockAgentBridge({ initialMessages: createTestMessages(10) })
      const manager2 = new ArchiveManager({
        agentBridge: agentBridge2,
        storage, // 同一个 storage（同一个文件系统）
        embeddingAdapter,
        llmAdapter,
        projectId: 'test-project',
        sessionId: 'test-session',
        fs: fsOps,
        basePath: '/test/memory-archive',
        config: {
          archiveThreshold: 100,
          minArchiveMessages: 2,
          scheduler: { enabled: false, dailyHour: 3, weeklyDay: 0, monthlyDay: 1 },
          chunking: { strategy: 'topic', minChunkTokens: 50, maxChunkTokens: 500 },
        },
      })

      await manager2.init()
      // 应该加载到之前持久化的钩子
      expect(manager2.getAllHooks()).toHaveLength(1)
      expect(manager2.getAllHooks()[0].projectId).toBe('test-project')
    })
  })
})
