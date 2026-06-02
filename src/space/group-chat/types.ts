import type { AgentMessage, ProviderConfig } from '@agent/index'

export interface GroupChatConfig {
  maxRounds: number
  maxTotalMessages: number
  maxDurationMs: number
  reviewInterval: number
  parallelCount: number
  autoDegradation: boolean
}

export const DEFAULT_GROUP_CHAT_CONFIG: GroupChatConfig = {
  maxRounds: 20,
  maxTotalMessages: 60,
  maxDurationMs: 600000,
  reviewInterval: 5,
  parallelCount: 1,
  autoDegradation: true,
}

export interface GroupChatBudget {
  maxCostUsd: number
  warnAtPercent: number
  perAgentBudget?: number
}

export const DEFAULT_GROUP_CHAT_BUDGET: GroupChatBudget = {
  maxCostUsd: 1.0,
  warnAtPercent: 80,
}

export interface GroupParticipant {
  id: string
  name: string
  avatar: string
  color: string
  role: string
  systemPrompt: string
  providerConfig?: ProviderConfig
  modelId?: string
  speakCount: number
  lastSpokeAt: number
}

export interface GroupChatCostEntry {
  inputTokens: number
  outputTokens: number
  costUsd: number
}

export interface GroupChatCostTracker {
  totalInputTokens: number
  totalOutputTokens: number
  totalCostUsd: number
  perAgentCost: Record<string, GroupChatCostEntry>
  remainingBudget: number
  budgetPercentUsed: number
}

export type GroupChatState = 'idle' | 'running' | 'paused' | 'completed' | 'terminated'

export type SpeakerSelectionMode = 'round-robin' | 'moderator' | 'auto-select'

export type HealthStatus = 'unknown' | 'healthy' | 'slow' | 'unreachable'

export interface ModelHealthResult {
  status: HealthStatus
  latency: number
  error?: string
  checkedAt: number
}

export interface DegradedAgentInfo {
  agentId: string
  agentName: string
  fromModelId: string
  fromModelName: string
  toModelId: string
  toModelName: string
  reason: string
  degradedAt: number
}

export interface StreamingAgentState {
  content: string
  thinking: string
}

export interface GroupSession {
  id: string
  name: string
  topic: string
  participants: GroupParticipant[]
  messages: AgentMessage[]
  config: GroupChatConfig
  budget: GroupChatBudget
  costTracker: GroupChatCostTracker
  state: GroupChatState
  createdAt: string
  updatedAt: string
  summary?: string
  currentRound: number
  startedAt: number | null
  pinned?: boolean
}

export interface GroupChatControls {
  pause(): void
  resume(): void
  terminate(): void
  injectMessage(text: string): void
  setNextSpeaker(agentId: string): void
}

export type ContextPressureLevel = 'none' | 'light' | 'moderate' | 'heavy' | 'critical'

export interface ContextStrategy {
  level: ContextPressureLevel
  maxMessages: number
  preserveFirstN: number
  summaryEnabled: boolean
  keyInfoExtraction: boolean
}

export interface TerminationCheckResult {
  shouldTerminate: boolean
  reason?: string
  confidence: number
}

export type GroupChatMode = 'meeting' | 'casual'

export type GroupRole = 'owner' | 'admin' | 'member'

export interface GroupMember extends GroupParticipant {
  groupRole: GroupRole
  joinedAt: number
  muted: boolean
  mutedUntil?: number
  lastActiveAt: number
  enabledTools: string[]
  enabledSkills: string[]
}

export type MessageType = 'text' | 'image' | 'file' | 'system' | 'action'

export interface GroupChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'toolResult'
  content: string
  thinking?: string
  timestamp: number
  speakerId?: string
  speakerName?: string
  speakerAvatar?: string
  speakerColor?: string
  type: MessageType
  replyTo?: string
  mentions?: string[]
  imageUrl?: string
  fileName?: string
  fileUrl?: string
}

export interface SpeakingDesire {
  agentId: string
  desireScore: number
  reason: string
}

export interface DesireConfig {
  threshold: number
  mentionBoost: number
  roleRelevanceWeight: number
  recentActivityDecay: number
}

export const DEFAULT_DESIRE_CONFIG: DesireConfig = {
  threshold: 0.4,
  mentionBoost: 0.5,
  roleRelevanceWeight: 0.3,
  recentActivityDecay: 0.1,
}

export interface GroupInfo {
  id: string
  name: string
  avatar: string
  announcement?: string
  mode: GroupChatMode
  createdAt: number
  updatedAt: number
}

export interface CasualGroupSession {
  info: GroupInfo
  members: GroupMember[]
  messages: GroupChatMessage[]
  desireConfig: DesireConfig
  meetingConfig?: GroupChatConfig
  meetingBudget?: GroupChatBudget
  costTracker: GroupChatCostTracker
}

export interface ChatAgent {
  id: string
  name: string
  avatar: string
  color: string
  role: string
  systemPrompt: string
  modelId?: string
  sourceType: 'entity' | 'custom'
  sourceEntityId?: string
  enabledTools: string[]
  enabledSkills: string[]
  createdAt: number
  updatedAt: number
}

export const AGENT_COLORS = [
  '#3b82f6', '#8b5cf6', '#ef4444', '#f59e0b',
  '#10b981', '#ec4899', '#06b6d4', '#f97316',
]

export function assignAgentColor(index: number): string {
  return AGENT_COLORS[index % AGENT_COLORS.length]
}
