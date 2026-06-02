import type { IAgentBackend, AgentEvent, AgentMessage, ProviderConfig, IToolContext } from '@agent/index'
import { createWorldSmithAgent, loadApiKey } from '@agent/index'
import type { GroupMember, GroupChatMessage, GroupChatCostTracker, StreamingAgentState, ContextStrategy } from '../types'
import type { IGroupChatEngine } from './IGroupChatEngine'
import type { IChatStrategy, StrategyContext, EngineState } from './IChatStrategy'
import { CostTrackerImpl } from '../CostTracker'
import { ContextManagerImpl } from '../ContextManager'
import { FallbackChainImpl } from '../FallbackChain'
import { ModelHealthChecker } from '../ModelHealthChecker'
import { getModelInfo } from '../../../agent/modelRegistry'

const PROVIDER_PROXY_PATHS: Record<string, string> = {
  deepseek: '/api/deepseek',
  zhipu: '/api/zhipu/api/paas/v4',
  qwen: '/api/qwen/compatible-mode/v1',
  minimax: '/api/minimax/v1',
  kimi: '/api/kimi/v1',
  anthropic: '/api/anthropic',
  openai: '/api/openai/v1',
  google: '/api/google',
  groq: '/api/groq/openai/v1',
  openrouter: '/api/openrouter/api/v1',
}

export class GroupChatEngine implements IGroupChatEngine {
  private strategy: IChatStrategy
  private agents: Map<string, IAgentBackend> = new Map()
  private messages: GroupChatMessage[] = []
  private costTracker: CostTrackerImpl
  private contextManager: ContextManagerImpl
  private fallbackChain: FallbackChainImpl
  private agentModelMap: Record<string, string> = {}
  private participantApiKeys: Record<string, string> = {}

  constructor(strategy: IChatStrategy, budgetMaxCostUsd: number = 1.0, contextWindow: number = 32768) {
    this.strategy = strategy
    this.costTracker = new CostTrackerImpl({ maxCostUsd: budgetMaxCostUsd }, '')
    this.contextManager = new ContextManagerImpl(contextWindow)
    this.fallbackChain = new FallbackChainImpl()
  }

  async createAgents(participants: GroupMember[], providerConfig: ProviderConfig, toolContext: IToolContext): Promise<void> {
    this.agents.clear()
    this.participantApiKeys = {}
    this.agentModelMap = {}

    for (const p of participants) {
      const modelId = p.modelId || providerConfig.modelId || ''
      this.agentModelMap[p.id] = modelId
      if (!modelId) continue

      const info = getModelInfo(modelId)
      if (!info) {
        this.costTracker.registerAgentModel(p.id, modelId)
        this.contextManager.registerAgentModel(p.id, modelId)
        continue
      }

      const provider = info.provider
      const apiKey = await loadApiKey(provider as any).catch(() => null as string | null)
      if (apiKey) this.participantApiKeys[p.id] = apiKey

      if (!p.providerConfig) {
        const proxyPath = PROVIDER_PROXY_PATHS[provider]
        const resolvedBaseUrl = proxyPath ? `${window.location.origin}${proxyPath}` : undefined
        p.providerConfig = {
          mode: 'cloud',
          provider,
          modelId,
          apiKey: apiKey || ('apiKey' in providerConfig ? providerConfig.apiKey : undefined),
          baseUrl: resolvedBaseUrl,
          supportsVision: info.supportsVision,
          contextWindow: info.contextLength,
          maxTokens: info.maxOutputTokens,
        }
      }

      this.costTracker.registerAgentModel(p.id, modelId)
      this.contextManager.registerAgentModel(p.id, modelId)
    }

    for (const p of participants) {
      const agent = await createWorldSmithAgent({
        providerConfig: p.providerConfig || providerConfig,
        toolContext,
        projectName: 'WorldSmith-GroupChat',
      })

      const modelId = p.modelId || providerConfig.modelId || ''
      if (modelId) {
        const info = getModelInfo(modelId)
        const apiKey = this.participantApiKeys[p.id]
        if (info) {
          try {
            await agent.updateModel(
              info.provider,
              modelId,
              undefined,
              apiKey || undefined,
              info.contextLength,
              info.maxOutputTokens,
            )
          } catch (err) {
            console.warn(`[GroupChatEngine] Failed to set model for ${p.name}:`, err)
          }
        }
      }

      this.agents.set(p.id, agent)
    }
  }

  disposeAgents(): void {
    for (const agent of this.agents.values()) {
      agent.dispose()
    }
    this.agents.clear()
  }

  subscribeAgent(agentId: string, callback: (event: AgentEvent) => void): () => void {
    const agent = this.agents.get(agentId)
    if (!agent) return () => {}
    return agent.subscribe(callback)
  }

  getStreamingState(_agentId: string): StreamingAgentState | null {
    return null
  }

  recordUsage(agentId: string, usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }): void {
    this.costTracker.recordUsage(agentId, usage.inputTokens, usage.outputTokens, usage.cacheReadTokens, usage.cacheWriteTokens)
  }

  getCostSnapshot(): GroupChatCostTracker {
    return this.costTracker.getSnapshot()
  }

  getPreparedMessages(agentId: string): AgentMessage[] {
    const systemPromptTokens = 800
    const strategy = this.contextManager.getStrategy(this.messages, systemPromptTokens, 0)
    return this.contextManager.applyStrategy(this.messages, strategy)
  }

  getPreparedCasualMessages(agentId: string): GroupChatMessage[] {
    const systemPromptTokens = 800
    const strategy = this.contextManager.getStrategy(
      this.messages, systemPromptTokens, 0, { summaryEnabled: false },
    )
    const prepared = this.contextManager.applyStrategy(this.messages, strategy)
    return prepared.map(m => this.agentMessageToCasual(m))
  }

  private agentMessageToCasual(m: AgentMessage): GroupChatMessage {
    return {
      id: m.id,
      role: m.role as GroupChatMessage['role'],
      content: m.content ?? '',
      thinking: m.thinking,
      timestamp: m.timestamp,
      speakerId: m.speakerId,
      speakerName: m.speakerName,
      speakerAvatar: m.speakerAvatar,
      speakerColor: m.speakerColor,
      type: 'text',
    }
  }

  getContextStrategy(): ContextStrategy {
    return this.contextManager.getStrategy(this.messages, 800, 0)
  }

  async tryFallback(agentId: string): Promise<boolean> {
    const currentModelId = this.agentModelMap[agentId]
    const fallbackModelId = this.fallbackChain.getFallback(currentModelId, agentId)
    if (!fallbackModelId) return false

    const agent = this.agents.get(agentId)
    if (!agent) return false

    const provider = this.fallbackChain.getProviderForModel(currentModelId)
    if (!provider) return false

    const fallbackInfo = getModelInfo(fallbackModelId)
    try {
      await agent.updateModel(
        provider,
        fallbackModelId,
        undefined,
        this.participantApiKeys[agentId],
        fallbackInfo?.contextLength,
        fallbackInfo?.maxOutputTokens,
      )
      this.fallbackChain.recordDegradation(agentId)
      this.agentModelMap[agentId] = fallbackModelId
      this.costTracker.registerAgentModel(agentId, fallbackModelId)
      this.contextManager.registerAgentModel(agentId, fallbackModelId)
      return true
    } catch {
      return false
    }
  }

  async preflightHealthCheck(participants: GroupMember[], providerConfig: ProviderConfig): Promise<void> {
    const configs = participants.map(p => ({
      providerConfig: p.providerConfig || providerConfig,
      modelId: p.modelId || providerConfig.modelId || '',
      agentId: p.id,
    }))
    await ModelHealthChecker.checkMultiple(configs)
  }

  addMessage(msg: GroupChatMessage): void {
    this.messages.push(msg)
  }

  getMessages(): GroupChatMessage[] {
    return this.messages
  }

  setStrategy(strategy: IChatStrategy): void {
    this.strategy = strategy
  }

  getStrategy(): IChatStrategy {
    return this.strategy
  }

  getAgent(agentId: string): IAgentBackend | undefined {
    return this.agents.get(agentId)
  }

  buildStrategyContext(topic?: string, round: number = 0, userMessage?: GroupChatMessage, mentionedAgentIds: string[] = []): StrategyContext {
    return { topic, currentRound: round, userMessage, mentionedAgentIds }
  }

  getEngineState(round: number, startTime: number, maxCostUsd: number): EngineState {
    const snapshot = this.costTracker.getSnapshot()
    return {
      round,
      startTime,
      messageCount: this.messages.length,
      costUsd: snapshot.totalCostUsd,
      maxCostUsd,
    }
  }

  reset(): void {
    this.messages = []
    this.contextManager.reset()
    this.fallbackChain.reset()
  }
}
