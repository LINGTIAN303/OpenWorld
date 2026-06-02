import type { AgentStateSnapshot, AgentMessage } from './session/types'
import type { PromptOptions, AgentEvent, AgentEventListener, AgentConfig, ToolDefinition, ToolParameter, IAgentBackend, UsageData, ThinkingLevel, ChatMode, A2UIMessage, A2UIComponent } from './bridge-types'
import { buildSkillIndexPrompt, buildOutputGuidePrompt } from './skills/registry'
import { activateSkills } from './skills/loader'
import { buildPluginCapabilityPrompt } from './skills/plugin-bridge'
import { PERSONA_PRESETS } from './context/injector'
import { DefaultToolBus } from './toolbus/toolbus'
import type { ToolBus } from './toolbus/toolbus'
import { MCPManager } from './mcp/mcp-manager'
import { recallMemory, formatMemoryForPrompt } from './tools/memory'
import { kbSearchKeyword, kbList } from './kb/kb-store'
import { semanticSearchKB, isEmbeddingReady as isKBEmbeddingReady } from './kb/kb-indexer'
import { extractFromConversation, extractShortMemory } from './kb/kb-extractor'
import { streamSimple } from '@earendil-works/pi-ai'

export type {
  PromptOptions,
  AgentEvent,
  AgentEventListener,
  AgentConfig,
  ToolDefinition,
  ToolParameter,
  IAgentBackend,
  UsageData,
  ThinkingLevel,
  A2UIMessage,
  A2UIComponent,
}

export class CoreBackend implements IAgentBackend {
  private agent: any = null
  private listeners: Set<AgentEventListener> = new Set()
  private _state: AgentStateSnapshot
  private config: AgentConfig
  private unsub: (() => void) | null = null
  private originalSystemPrompt: string = ''
  private activeSkillIds: Set<string> = new Set()
  private skillIndexPrompt: string = ''
  private pendingModel: any = null
  private toolBus: DefaultToolBus
  private mcpManager: MCPManager
  private _developerMode: boolean = false
  private _advancedMode: boolean = false
  private _temperature?: number
  private _maxTokens?: number
  private _currentChatMode: ChatMode = 'normal'
  private _lastUserText: string = ''
  private _lastAssistantText: string = ''

  constructor(config: AgentConfig) {
    this.config = config
    this.toolBus = new DefaultToolBus()
    for (const tool of config.tools) {
      this.toolBus.register(tool)
    }
    this.mcpManager = new MCPManager()
    this.mcpManager.setToolBus(this.toolBus)
    this.mcpManager.setOnToolsChanged(async () => {
      await this.reloadTools()
    })
    this._state = {
      sessionId: crypto.randomUUID(),
      model: null,
      thinkingLevel: 'medium',
      messages: [],
      isStreaming: false,
      pendingToolCalls: [],
    }
    this.config.toolContext.emitA2UI = (surfaceId: string, message: A2UIMessage) => {
      this.emit({ type: 'a2ui', surfaceId, message })
    }
  }

  async initialize(): Promise<void> {
    this.skillIndexPrompt = buildSkillIndexPrompt(this._developerMode, this._advancedMode)
    this._state.model = {
      provider: (this.config.providerConfig as any).provider ?? this.config.providerConfig.mode,
      modelId: this.config.providerConfig.modelId,
      displayName: this.config.providerConfig.modelId,
      contextWindow: (this.config.providerConfig as any).contextWindow,
    }
  }

  private convertParamsToJsonSchema(params: Record<string, any>): Record<string, any> {
    const properties: Record<string, any> = {}
    const required: string[] = []

    for (const [name, param] of Object.entries(params)) {
      const prop: Record<string, any> = { type: param.type, description: param.description }
      if (param.enum) prop.enum = param.enum
      if (param.type === 'array' && param.items) {
        prop.items = { type: param.items.type, description: param.items.description }
        if (param.items.enum) prop.items.enum = param.items.enum
      }
      properties[name] = prop
      if (param.required) required.push(name)
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    }
  }

  private static getOrigin(): string {
    return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'
  }

  private static PROVIDER_BASE_URLS: Record<string, string> = {
    anthropic: '/api/anthropic',
    openai: '/api/openai/v1',
    google: '/api/google',
    deepseek: '/api/deepseek',
    groq: '/api/groq/openai/v1',
    openrouter: '/api/openrouter/api/v1',
    zhipu: '/api/zhipu/api/paas/v4',
    qwen: '/api/qwen/compatible-mode/v1',
    minimax: '/api/minimax/v1',
    kimi: '/api/kimi/v1',
  }

  private static resolveProxyUrl(proxyPath: string): string {
    return `${CoreBackend.getOrigin()}${proxyPath}`
  }

  private static VISION_MODEL_PATTERNS: Record<string, (modelId: string) => boolean> = {
    anthropic: () => true,
    openai: () => true,
    google: () => true,
    deepseek: () => false,
    zhipu: (id) => /\d+v/i.test(id),
    qwen: (id) => id.includes('vl') || id.includes('VL') || id.includes('3.6-plus') || id.includes('3.6-flash') || id.includes('3.5-plus') || id.includes('3.5-flash'),
    minimax: (id) => id.includes('vl') || id.includes('VL'),
    kimi: (id) => id.startsWith('kimi-k2.5'),
    groq: (id) => id.includes('scout') && id.includes('vision'),
  }

  private checkVisionSupport(provider: string, modelId: string): boolean {
    const cfg = this.config.providerConfig as any
    if (cfg.supportsVision !== undefined) return !!cfg.supportsVision
    const checker = CoreBackend.VISION_MODEL_PATTERNS[provider]
    if (checker) return checker(modelId)
    return false
  }

  private async buildModel(): Promise<any> {
    const { getModel } = await import('@earendil-works/pi-ai')
    const cfg = this.config.providerConfig as any
    const isDomestic = ['deepseek', 'zhipu', 'qwen', 'minimax', 'kimi'].includes(cfg.provider)

    if (cfg.mode === 'cloud' && !isDomestic) {
      try {
        const model = getModel(cfg.provider, cfg.modelId)
        if (model) {
          const proxyBase = CoreBackend.PROVIDER_BASE_URLS[cfg.provider]
          if (proxyBase) model.baseUrl = CoreBackend.resolveProxyUrl(proxyBase)
          return model
        }
      } catch { /* fall through to custom */ }
    }

    if (cfg.mode === 'cloud') {
      return this.buildCustomModel(cfg.provider, cfg.modelId, undefined, cfg.apiKey)
    }

    if (cfg.mode === 'local') {
      return this.buildCustomModel(cfg.apiType, cfg.modelId, cfg.endpoint, undefined)
    }

    return this.buildCustomModel(cfg.apiType, cfg.modelId, cfg.baseUrl, cfg.apiKey)
  }

  private buildCustomModel(provider: string, modelId: string, baseUrl?: string, apiKey?: string): any {
    const isAnthropic = provider.includes('anthropic')
    const isGoogle = provider === 'google' || provider === 'google-vertex'
    let api = 'openai-completions'
    if (isAnthropic) api = 'anthropic-messages'
    else if (isGoogle) api = 'google-generative-ai'

    const providerBaseUrl = CoreBackend.PROVIDER_BASE_URLS[provider]
    let resolvedBaseUrl = baseUrl || (providerBaseUrl ? CoreBackend.resolveProxyUrl(providerBaseUrl) : '') || (provider === 'ollama' ? 'http://localhost:11434/v1' : '')

    const isCustomRemote = baseUrl && /^https?:\/\//.test(baseUrl)
    let customProxyHeaders: Record<string, string> | undefined
    if (isCustomRemote) {
      try {
        const url = new URL(baseUrl!)
        let pathName = url.pathname.replace(/\/+$/, '')
        if (!pathName) pathName = '/v1'
        const proxyPath = `/api/custom-proxy${pathName}`
        customProxyHeaders = { 'X-Target-Base-Url': `${url.protocol}//${url.host}` }
        resolvedBaseUrl = CoreBackend.resolveProxyUrl(proxyPath)
      } catch {}
    }

    const isDeepSeek = provider === 'deepseek' || (baseUrl || '').includes('deepseek.com')
    const isZhipu = provider === 'zhipu'
    const isQwen = provider === 'qwen'
    const isMinimax = provider === 'minimax'
    const isKimi = provider === 'kimi'

    let resolvedModelId = modelId
    if (isDeepSeek && resolvedModelId.includes('/')) {
      resolvedModelId = resolvedModelId.split('/').pop()!
    }

    const supportsVision = this.checkVisionSupport(provider, resolvedModelId)

    const model: any = {
      id: resolvedModelId,
      name: resolvedModelId,
      api,
      provider: isDeepSeek ? 'deepseek' : provider,
      baseUrl: resolvedBaseUrl,
      reasoning: false,
      input: supportsVision ? ['text', 'image'] : ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: (this.config.providerConfig as any).contextWindow || 1048576,
      maxTokens: (this.config.providerConfig as any).maxTokens || 65536,
    }

    if (isDeepSeek) {
      model.api = 'openai-completions'
      model.reasoning = true
      model.compat = {
        maxTokensField: 'max_tokens',
        supportsUsageInStreaming: false,
        supportsStore: false,
        supportsDeveloperRole: false,
        supportsReasoningEffort: false,
        supportsStrictMode: false,
        thinkingFormat: 'deepseek',
        requiresReasoningContentOnAssistantMessages: true,
      }
      model.thinkingLevelMap = { off: null, minimal: null, low: null, medium: null, high: 'high', xhigh: 'max' }
    } else if (isZhipu) {
      model.api = 'openai-completions'
      model.compat = {
        maxTokensField: 'max_tokens',
        supportsStrictMode: false,
        supportsUsageInStreaming: true,
      }
      const isThinking = resolvedModelId.startsWith('glm-5') || resolvedModelId.startsWith('glm-4.5')
      if (isThinking) {
        model.reasoning = true
        model.compat.thinkingFormat = 'reasoning_content'
      }
    } else if (isQwen) {
      model.api = 'openai-completions'
      model.compat = {
        maxTokensField: 'max_tokens',
        supportsStrictMode: false,
        supportsUsageInStreaming: true,
      }
      const isThinking = resolvedModelId.includes('qwen3')
      if (isThinking) {
        model.reasoning = true
        model.compat.thinkingFormat = 'reasoning_content'
      }
    } else if (isMinimax) {
      model.api = 'openai-completions'
      model.compat = {
        maxTokensField: 'max_tokens',
        supportsStrictMode: false,
        supportsUsageInStreaming: true,
      }
      const isThinking = resolvedModelId.startsWith('MiniMax-M2')
      if (isThinking) {
        model.reasoning = true
        model.compat.thinkingFormat = 'reasoning_content'
      }
    } else if (isKimi) {
      model.api = 'openai-completions'
      model.compat = {
        maxTokensField: 'max_tokens',
        supportsStrictMode: false,
        supportsUsageInStreaming: true,
      }
      const isThinking = resolvedModelId.startsWith('kimi-k2')
      if (isThinking) {
        model.reasoning = true
        model.compat.thinkingFormat = 'reasoning_content'
      }
    } else if (!isAnthropic && !isGoogle) {
      model.compat = { maxTokensField: 'max_tokens', supportsStrictMode: false, supportsUsageInStreaming: true }
    }

    if (apiKey) {
      model.headers = { 'Authorization': `Bearer ${apiKey}`, ...customProxyHeaders }
    } else if (customProxyHeaders) {
      model.headers = { ...customProxyHeaders }
    }

    return model
  }

  private agentInitPromise: Promise<any> | null = null

  private async ensureAgent(): Promise<any> {
    if (this.agent) return this.agent
    if (this.agentInitPromise) return this.agentInitPromise

    this.agentInitPromise = this._initAgent()
    try {
      return await this.agentInitPromise
    } finally {
      this.agentInitPromise = null
    }
  }

  private convertToolToPi(t: ToolDefinition): any {
    return {
      name: t.name,
      label: t.name,
      description: t.description,
      parameters: this.convertParamsToJsonSchema(t.parameters),
      execute: async (toolCallId: string, params: unknown, _signal?: AbortSignal, _onUpdate?: any) => {
        const args = params as Record<string, unknown>
        this.emit({
          type: 'tool_execution_start',
          toolCall: { id: toolCallId, name: t.name, args },
        })
        try {
          const res = await t.execute(args, this.config.toolContext)
          if (t.name.startsWith('output_') && this.config.toolContext.appendBlock) {
            console.log('[Agent] output tool executed:', t.name, 'result:', res)
          }
          this.emit({
            type: 'tool_execution_end',
            toolCallId,
            result: res,
            success: true,
          })
          return {
            content: [{ type: 'text' as const, text: res }],
            details: { success: true },
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          this.emit({
            type: 'tool_execution_end',
            toolCallId,
            result: msg,
            success: false,
          })
          return {
            content: [{ type: 'text' as const, text: msg }],
            details: { error: true },
            isError: true,
          }
        }
      },
    }
  }

  private async _initAgent(): Promise<any> {
    if (this.agent) return this.agent

    const { Agent } = await import('@earendil-works/pi-agent-core')
    let model = this.pendingModel || await this.buildModel()

    const piTools = this.toolBus.getAll().map(t => this.convertToolToPi(t))

    console.log('[Agent] Tools loaded:', piTools.length, '| output tools:', piTools.filter(t => t.name.startsWith('output_')).map(t => t.name))

    const apiKey = this.extractApiKeyFromModel(model) || (this.config.providerConfig as any).apiKey
    const savedTemp = (this.config.providerConfig as any).temperature
    const savedMaxTokens = (this.config.providerConfig as any).maxTokens
    if (savedTemp !== undefined) this._temperature = savedTemp
    if (savedMaxTokens !== undefined) this._maxTokens = savedMaxTokens

    console.log('[Agent] Model config:', {
      id: model.id,
      provider: model.provider,
      baseUrl: model.baseUrl,
      api: model.api,
      reasoning: model.reasoning,
      compat: model.compat,
      hasApiKey: !!apiKey,
      headers: model.headers ? Object.keys(model.headers).reduce((acc: any, k: string) => {
        acc[k] = k.toLowerCase().includes('auth') ? `${(model.headers[k] as string).slice(0, 15)}...` : model.headers[k]
        return acc
      }, {}) : undefined,
    })

    this.agent = new Agent({
      initialState: {
        systemPrompt: this.config.systemPrompt,
        model,
        tools: piTools,
        messages: [],
      },
      convertToLlm: (msgs: any[]) => msgs.filter((m: any) =>
        ['user', 'assistant', 'toolResult'].includes(m.role)
      ),
      streamFn: (model: any, context: any, options: any) => {
        if (!model || typeof model !== 'object') {
          console.error('[Agent] streamFn called with invalid model:', model)
          throw new Error(`streamFn: model is invalid (type=${typeof model})`)
        }
        if (!model.api || typeof model.api !== 'string') {
          console.error('[Agent] streamFn called with invalid model.api:', model.api, '(model.id=', model.id, ', model.provider=', model.provider, ')')
          throw new Error(`streamFn: model.api is invalid ("${model.api}"). Model id="${model.id}", provider="${model.provider}"`)
        }
        let ctx = context
        if (this._currentChatMode === 'normal') {
          ctx = { ...context, tools: [] }
        }
        const merged = { ...options }
        if (this._temperature !== undefined) merged.temperature = this._temperature
        if (this._maxTokens !== undefined) merged.maxTokens = this._maxTokens
        try {
          return streamSimple(model, ctx, merged)
        } catch (err) {
          console.error('[Agent] streamSimple threw:', err, '| model.api=', model.api, '| model.id=', model.id, '| model.provider=', model.provider)
          throw err
        }
      },
      getApiKey: apiKey ? async (_provider: string) => apiKey : undefined,
      onPayload: async (payload: any) => {
        const sensitiveKeys = ['apiKey', 'api_key', 'authorization']
        const safePayload = JSON.parse(JSON.stringify(payload || {}))
        for (const msg of safePayload.messages || []) {
          if (typeof msg.content === 'string') msg.content = `[${msg.content.length} chars]`
          else if (Array.isArray(msg.content)) msg.content = `[${msg.content.length} blocks]`
        }
        for (const key of sensitiveKeys) delete safePayload[key]
        console.log('[Agent] → Full payload to API:', JSON.stringify(safePayload, null, 2))
        return payload
      },
      beforeToolCall: async (ctx: any) => {
        if (this.config.beforeToolCall) {
          const result = await this.config.beforeToolCall({ toolCall: { name: ctx.toolName, args: ctx.args } })
          if (result?.block) return { block: true, reason: result.reason }
        }
        return undefined
      },
    })

    this.originalSystemPrompt = this.config.systemPrompt

    this.unsub = this.agent.subscribe((event: any, _signal: AbortSignal) => {
      this.handlePiEvent(event)
    })

    this.pendingModel = null

    return this.agent
  }

  private emit(event: AgentEvent): void {
    for (const listener of this.listeners) {
      listener(event)
    }
  }

  private handlePiEvent(event: any): void {
    const mapped = this.mapPiEvent(event)
    if (mapped) this.emit(mapped)
  }

  private mapPiEvent(event: any): AgentEvent | null {
    switch (event.type) {
      case 'agent_start':
        this._state.isStreaming = true
        return { type: 'agent_start', sessionId: this._state.sessionId, chatMode: this._currentChatMode }
      case 'agent_end':
        this._state.isStreaming = false
        const agentEndMessages = (event.messages || [])
          .filter((m: any) => m.role === 'assistant')
          .map((m: any) => this.piMsgToAgentMsg(m))
        if (agentEndMessages.length > 0) {
          const lastAssistant = agentEndMessages[agentEndMessages.length - 1]
          this._lastAssistantText = lastAssistant.content || ''
        }
        if (this._lastUserText && this._lastAssistantText && this._currentChatMode !== 'normal') {
          const userText = this._lastUserText
          const asstText = this._lastAssistantText
          Promise.all([
            extractFromConversation(userText, asstText).catch(() => {}),
            extractShortMemory(userText, asstText).catch(() => {}),
          ]).catch(() => {})
        }
        return {
          type: 'agent_end',
          sessionId: this._state.sessionId,
          messages: agentEndMessages,
        }
      case 'turn_end':
        if (event.message?.role !== 'assistant') return null
        return {
          type: 'turn_end',
          message: this.piMsgToAgentMsg(event.message),
        }
      case 'message_start':
        return { type: 'message_start', message: this.piMsgToAgentMsg(event.message) }
      case 'message_update':
        if (event.message?.role !== 'assistant') return null
        return {
          type: 'message_update',
          messageId: event.message?.id || '',
          content: this.extractText(event.message),
          thinking: this.extractThinking(event.message),
        }
      case 'message_end':
        if (event.message?.role !== 'assistant') return null
        const msgEndUsage = this.extractUsage(event.message)
        return {
          type: 'message_end',
          messageId: event.message?.id || '',
          content: this.extractText(event.message),
          thinking: this.extractThinking(event.message),
          usage: msgEndUsage,
        }
      case 'tool_execution_start':
        return {
          type: 'tool_execution_start',
          toolCall: { id: event.toolCallId, name: event.toolName, args: event.args },
        }
      case 'tool_execution_update':
        return {
          type: 'tool_execution_update',
          toolCallId: event.toolCallId,
          progress: 50,
        }
      case 'tool_execution_end':
        return {
          type: 'tool_execution_end',
          toolCallId: event.toolCallId,
          result: this.extractToolResult(event.result),
          success: !event.isError,
        }
      default:
        return null
    }
  }

  private piMsgToAgentMsg(msg: any): AgentMessage {
    return {
      id: crypto.randomUUID(),
      role: msg?.role ?? 'assistant',
      content: this.extractText(msg),
      thinking: this.extractThinking(msg),
      timestamp: Date.now(),
      metadata: { chatMode: this._currentChatMode },
    }
  }

  private extractText(msg: any): string {
    if (!msg) return ''
    if (typeof msg.content === 'string') return msg.content
    if (Array.isArray(msg.content)) {
      return msg.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('')
    }
    return ''
  }

  private extractThinking(msg: any): string {
    if (!msg) return ''
    if (Array.isArray(msg.content)) {
      return msg.content
        .filter((c: any) => c.type === 'thinking')
        .map((c: any) => c.thinking || c.text || '')
        .join('')
    }
    return ''
  }

  private extractToolResult(result: any): string {
    if (!result) return ''
    if (typeof result === 'string') return result
    if (result.content && Array.isArray(result.content)) {
      return result.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('')
    }
    return JSON.stringify(result)
  }

  private extractUsage(msg: any): UsageData | undefined {
    if (!msg?.usage) return undefined
    const u = msg.usage
    return {
      inputTokens: u.input || 0,
      outputTokens: u.output || 0,
      cacheReadTokens: u.cacheRead || 0,
      cacheWriteTokens: u.cacheWrite || 0,
      totalTokens: u.totalTokens || 0,
      cost: {
        input: u.cost?.input || 0,
        output: u.cost?.output || 0,
        cacheRead: u.cost?.cacheRead || 0,
        cacheWrite: u.cost?.cacheWrite || 0,
        total: u.cost?.total || 0,
      },
    }
  }

  get state(): AgentStateSnapshot {
    return this._state
  }

  get isStreaming(): boolean {
    return this._state.isStreaming
  }

  setVisibilityMode(developerMode: boolean, advancedMode: boolean): void {
    this._developerMode = developerMode
    this._advancedMode = advancedMode
    this.skillIndexPrompt = buildSkillIndexPrompt(developerMode, advancedMode)
  }

  async prompt(text: string, options?: PromptOptions): Promise<void> {
    const agent = await this.ensureAgent()

    this.activeSkillIds.clear()

    const chatMode = options?.chatMode || 'normal'
    this._currentChatMode = chatMode

    const thinkingLevelMap: Record<ChatMode, ThinkingLevel> = {
      normal: 'off',
      deep: 'high',
      explore: 'medium',
    }
    this.updateThinkingLevel(thinkingLevelMap[chatMode])

    const modeSkillMap: Record<string, string> = {
      deep: 'deep-thinking',
      explore: 'knowledge-explorer',
    }
    const modeSkillId = modeSkillMap[chatMode]
    if (modeSkillId) {
      this.activeSkillIds.add(modeSkillId)
    }

    let prompt = this.originalSystemPrompt

    if (chatMode === 'normal') {
      prompt += '\n\n[模式指令] 你处于快问快答模式。直接回答用户问题，不要调用任何工具，不要进行深度分析。简洁、直接地给出答案。如果用户的问题需要深度分析或工具调用，简要提示用户可切换到深度思考或知识探索模式。'
      if (options?.contextOverride) {
        prompt += `\n\n[上下文] ${options.contextOverride}`
      }
      if (options?.personaPreset && options.personaPreset !== 'default') {
        const persona = PERSONA_PRESETS[options.personaPreset]
        if (persona) {
          prompt += `\n\n## 人格设定\n${persona.instruction}`
        }
      }
    } else {
      prompt += '\n\n' + this.skillIndexPrompt

      if (options?.contextOverride) {
        prompt += `\n\n[上下文] ${options.contextOverride}`
      }

      const memoryLimit = chatMode === 'explore' ? 8 : 5
      const memoryEntries = await recallMemory(text, memoryLimit)
      const memoryBlock = formatMemoryForPrompt(memoryEntries)
      if (memoryBlock) {
        prompt += `\n\n${memoryBlock}`
      }

      try {
        const allEntries = await kbList()
        if (allEntries.length > 0) {
          const kbLimit = chatMode === 'explore' ? 8 : 3
          const kbThreshold = chatMode === 'explore' ? 0.2 : 0.3
          const kwResults = await kbSearchKeyword(text, undefined, kbLimit)
          const kbLines: string[] = []
          for (const e of kwResults) {
            const summary = e.summary ? ` — ${e.summary.slice(0, 80)}` : ''
            kbLines.push(`- [${e.scope}] ${e.path}${summary}`)
          }
          if (isKBEmbeddingReady()) {
            const semLimit = chatMode === 'explore' ? 8 : 3
            const semResults = await semanticSearchKB(text, semLimit, kbThreshold)
            for (const r of semResults) {
              const path = r.metadata?.path || ''
              const scope = r.metadata?.scope || 'project'
              const summary = r.metadata?.summary ? ` — ${r.metadata.summary.slice(0, 80)}` : ''
              if (!kbLines.some(l => l.includes(path))) {
                kbLines.push(`- [${scope}] ${path}${summary}`)
              }
            }
          }
          if (kbLines.length > 0) {
            prompt += `\n\n[知识库] 共 ${allEntries.length} 条知识，相关条目：\n${kbLines.join('\n')}`
          }
        }
      } catch {}

      if (options?.personaPreset && options.personaPreset !== 'default') {
        const persona = PERSONA_PRESETS[options.personaPreset]
        if (persona) {
          prompt += `\n\n## 人格设定\n${persona.instruction}`
        }
      }

      if (options?.skillNames && options.skillNames.length > 0) {
        for (const name of options.skillNames) {
          this.activeSkillIds.add(name)
        }
      }

      if (this.activeSkillIds.size > 0) {
        const skillBlock = await activateSkills([...this.activeSkillIds])
        if (skillBlock) {
          prompt += `\n\n${skillBlock}`
        }
        const outputGuide = buildOutputGuidePrompt([...this.activeSkillIds])
        if (outputGuide) {
          prompt += `\n\n${outputGuide}`
        }
        const pluginCap = buildPluginCapabilityPrompt([...this.activeSkillIds])
        if (pluginCap) {
          prompt += `\n\n${pluginCap}`
        }
      }
    }

    agent.state.systemPrompt = prompt

    this._lastUserText = text
    this._lastAssistantText = ''

    try {
      let promptText = text
      if (options?.files && options.files.length > 0) {
        const fileSections = options.files.map(f => `--- ${f.name} ---\n${f.content}\n---`).join('\n\n')
        promptText += `\n\n${fileSections}`
      }
      if (options?.images && options.images.length > 0) {
        await agent.prompt(promptText, options.images.map(img => ({
          type: 'image' as const,
          data: img.data,
          mimeType: img.mimeType,
        })))
      } else {
        await agent.prompt(promptText)
      }
    } catch (err: any) {
      this._state.isStreaming = false
      console.error('[Agent] prompt() failed:', err)
      const errorDetail = err?.error?.message || err?.message || String(err)
      const statusCode = err?.status || err?.error?.status || ''
      const errorBody = err?.error?.error?.message || err?.error?.body || ''
      const fullDetail = errorBody
        ? `[${statusCode}] ${errorBody}`
        : errorDetail
      this.emit({
        type: 'error',
        error: new Error(`API 请求失败: ${fullDetail}`),
      })
    }
  }

  async steer(text: string): Promise<void> {
    const agent = await this.ensureAgent()
    try {
      agent.steer({ role: 'user', content: text })
    } catch (err: any) {
      this._state.isStreaming = false
      this.emit({ type: 'error', error: new Error(`steer 失败: ${err?.message || String(err)}`) })
    }
  }

  async followUp(text: string): Promise<void> {
    const agent = await this.ensureAgent()
    try {
      agent.followUp({ role: 'user', content: text })
    } catch (err: any) {
      this._state.isStreaming = false
      this.emit({ type: 'error', error: new Error(`followUp 失败: ${err?.message || String(err)}`) })
    }
  }

  async abort(): Promise<void> {
    if (this.agent) this.agent.abort()
  }

  async updateModel(provider: string, modelId: string, baseUrl?: string, apiKey?: string, contextWindow?: number, maxTokens?: number, temperature?: number): Promise<void> {
    if (typeof provider !== 'string' || !provider) {
      console.error('[Agent] updateModel: provider is invalid:', typeof provider, provider)
      return
    }
    if (typeof modelId !== 'string' || !modelId) {
      console.error('[Agent] updateModel: modelId is invalid:', typeof modelId, modelId)
      return
    }
    console.log('[Agent] updateModel called:', { provider, modelId, baseUrl: baseUrl?.slice(0, 60), hasApiKey: !!apiKey, contextWindow, maxTokens, temperature })
    let model: any = null
    const isDomestic = ['deepseek', 'zhipu', 'qwen', 'minimax', 'kimi'].includes(provider)
    const isCustomApi = ['openai-compatible', 'anthropic-compatible'].includes(provider)
    if (!isDomestic && !isCustomApi && !baseUrl) {
      try {
        const { getModel } = await import('@earendil-works/pi-ai')
        model = getModel(provider, modelId)
        if (model) {
          const proxyBase = CoreBackend.PROVIDER_BASE_URLS[provider]
          if (proxyBase) model.baseUrl = CoreBackend.resolveProxyUrl(proxyBase)
        }
      } catch (err) {
        console.warn('[Agent] updateModel: getModel failed, falling back to custom:', err)
      }
    }
    if (!model) {
      model = this.buildCustomModel(provider, modelId, baseUrl, apiKey)
    }
    if (!model || !model.api) {
      console.error('[Agent] updateModel: built model has no api property:', model)
      return
    }
    console.log('[Agent] updateModel built:', { id: model.id, api: model.api, provider: model.provider, baseUrl: model.baseUrl, headers: model.headers ? Object.keys(model.headers) : [] })
    if (apiKey && !model.headers) {
      model.headers = { 'Authorization': `Bearer ${apiKey}` }
    } else if (apiKey && model.headers) {
      model.headers = { ...model.headers, 'Authorization': `Bearer ${apiKey}` }
    }
    if (contextWindow !== undefined) model.contextWindow = contextWindow
    if (maxTokens !== undefined) model.maxTokens = maxTokens
    if (temperature !== undefined) this._temperature = temperature
    if (maxTokens !== undefined) this._maxTokens = maxTokens
    if (this.agent) {
      this.agent.state.model = model
    } else {
      this.pendingModel = model
    }
    this._state.model = {
      provider,
      modelId,
      displayName: modelId,
      contextWindow: model.contextWindow,
    }
  }

  updateThinkingLevel(level: ThinkingLevel): void {
    if (this.agent) {
      this.agent.state.thinkingLevel = level
    }
    this._state.thinkingLevel = level
  }

  clearHistory(): void {
    if (this.agent) {
      this.agent.state.messages = []
    }
    this._state.messages = []
  }

  subscribe(listener: AgentEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  dispose(): void {
    if (this.unsub) this.unsub()
    this.mcpManager.dispose()
    this.listeners.clear()
    this.agent = null
    this.pendingModel = null
  }

  private extractApiKeyFromModel(model: any): string | undefined {
    if (!model?.headers) return undefined
    const auth = model.headers['Authorization'] || model.headers['authorization']
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      return auth.slice(7)
    }
    const xApiKey = model.headers['x-api-key']
    if (typeof xApiKey === 'string') {
      return xApiKey
    }
    return undefined
  }

  getToolBus(): ToolBus {
    return this.toolBus
  }

  getMCPManager(): MCPManager {
    return this.mcpManager
  }

  async reloadTools(): Promise<void> {
    if (!this.agent) return
    const piTools = this.toolBus.getAll().map(t => this.convertToolToPi(t))
    this.agent.state.tools = piTools
  }
}
