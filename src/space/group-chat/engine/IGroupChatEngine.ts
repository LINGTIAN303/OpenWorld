import type { AgentEvent, AgentMessage, ProviderConfig, IToolContext } from '@agent/index'
import type { GroupMember, GroupChatMessage, GroupChatCostTracker, StreamingAgentState, ContextStrategy } from '../types'
import type { IChatStrategy } from './IChatStrategy'

export interface IGroupChatEngine {
  createAgents(participants: GroupMember[], providerConfig: ProviderConfig, toolContext: IToolContext): Promise<void>
  disposeAgents(): void
  subscribeAgent(agentId: string, callback: (event: AgentEvent) => void): () => void
  getStreamingState(agentId: string): StreamingAgentState | null
  recordUsage(agentId: string, usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }): void
  getCostSnapshot(): GroupChatCostTracker
  getPreparedMessages(agentId: string): AgentMessage[]
  getPreparedCasualMessages(agentId: string): GroupChatMessage[]
  getContextStrategy(): ContextStrategy
  tryFallback(agentId: string): Promise<boolean>
  preflightHealthCheck(participants: GroupMember[], providerConfig: ProviderConfig): Promise<void>
  addMessage(msg: GroupChatMessage): void
  getMessages(): GroupChatMessage[]
  setStrategy(strategy: IChatStrategy): void
  getStrategy(): IChatStrategy
}
