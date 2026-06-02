import type { AgentStateSnapshot, AgentMessage, FileAttachment } from './session/types'
import type { IToolContext } from './toolbus/types'
import type { ProviderConfig } from './providers/config'

export interface ImageAttachment {
  data: string
  mimeType: string
}

export type ChatMode = 'normal' | 'deep' | 'explore'

export interface PromptOptions {
  skillNames?: string[]
  contextOverride?: string
  images?: ImageAttachment[]
  files?: FileAttachment[]
  personaPreset?: string
  chatMode?: ChatMode
}

export interface AgentEventListener {
  (event: AgentEvent): void
}

export interface UsageData {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  totalTokens: number
  cost: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
    total: number
  }
}

export type AgentEvent =
  | { type: 'agent_start'; sessionId: string; chatMode: ChatMode }
  | { type: 'agent_end'; sessionId: string; messages: AgentMessage[] }
  | { type: 'turn_end'; message: AgentMessage }
  | { type: 'message_start'; message: AgentMessage }
  | { type: 'message_update'; messageId: string; content: string; thinking: string }
  | { type: 'message_end'; messageId: string; content: string; thinking: string; usage?: UsageData }
  | { type: 'tool_execution_start'; toolCall: { id: string; name: string; args: Record<string, unknown> } }
  | { type: 'tool_execution_update'; toolCallId: string; progress: number }
  | { type: 'tool_execution_end'; toolCallId: string; result: string; success: boolean }
  | { type: 'usage'; usage: UsageData }
  | { type: 'a2ui'; surfaceId: string; message: A2UIMessage }
  | { type: 'block_append'; messageId: string; block: MessageBlock }
  | { type: 'error'; error: Error }

export interface A2UIComponent {
  id: string
  component: string
  children?: string[] | { componentId: string; path: string }
  [key: string]: unknown
}

export type A2UIMessage =
  | { version: 'v0.9'; createSurface: { surfaceId: string; catalogId: string; theme?: Record<string, unknown> } }
  | { version: 'v0.9'; updateComponents: { surfaceId: string; components: A2UIComponent[] } }
  | { version: 'v0.9'; updateDataModel: { surfaceId: string; path: string; value: unknown } }
  | { version: 'v0.9'; deleteSurface: { surfaceId: string } }

export type MessageBlock =
  | TableBlock
  | ChoiceBlock
  | CodeBlockData
  | EntityCardBlock
  | AlertBlock
  | StatBlock
  | ListBlock
  | ProgressBlock
  | ComparisonBlock
  | TimelineBlock
  | ImageBlock
  | AccordionBlock

export interface TableBlock {
  type: 'table'
  id: string
  title?: string
  columns: { key: string; label: string; align?: 'left' | 'center' | 'right' }[]
  rows: Record<string, unknown>[]
  collapsible: true
}

export interface ChoiceBlock {
  type: 'choice'
  id: string
  title?: string
  mode: 'single' | 'multi'
  options: { value: string; label: string; description?: string }[]
  collapsible: false
}

export interface CodeBlockData {
  type: 'code'
  id: string
  language: string
  code: string
  runnable?: boolean
  collapsible: true
}

export interface EntityCardBlock {
  type: 'entity-card'
  id: string
  entityId: string
  entityType: string
  name: string
  description?: string
  tags?: string[]
  properties?: Record<string, unknown>
  collapsible: true
}

export interface AlertBlock {
  type: 'alert'
  id: string
  level: 'info' | 'success' | 'warning' | 'error'
  title?: string
  message: string
  collapsible: false
}

export interface StatBlock {
  type: 'stat'
  id: string
  title?: string
  items: Array<{
    label: string
    value: string | number
    icon?: string
    trend?: 'up' | 'down' | 'flat'
  }>
  collapsible: true
}

export interface ListBlock {
  type: 'list'
  id: string
  title?: string
  items: Array<{
    icon?: string
    label: string
    description?: string
    value?: string
  }>
  collapsible: true
}

export interface ProgressBlock {
  type: 'progress'
  id: string
  label: string
  progress: number
  status: 'running' | 'completed' | 'failed'
  collapsible: false
}

export interface ComparisonBlock {
  type: 'comparison'
  id: string
  title?: string
  left: { label: string; items: Record<string, string> }
  right: { label: string; items: Record<string, string> }
  collapsible: true
}

export interface TimelineBlock {
  type: 'timeline'
  id: string
  title?: string
  events: Array<{
    time: string
    label: string
    description?: string
  }>
  collapsible: true
}

export interface ImageBlock {
  type: 'image'
  id: string
  src: string
  alt?: string
  caption?: string
  collapsible: true
}

export interface AccordionBlock {
  type: 'accordion'
  id: string
  title?: string
  sections: Array<{
    title: string
    content: string
  }>
  collapsible: true
}

export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

export interface IAgentBackend {
  prompt(text: string, options?: PromptOptions): Promise<void>
  steer(text: string): Promise<void>
  followUp(text: string): Promise<void>
  abort(): Promise<void>
  updateModel(provider: string, modelId: string, baseUrl?: string, apiKey?: string, contextWindow?: number, maxTokens?: number, temperature?: number): Promise<void>
  updateThinkingLevel(level: ThinkingLevel): void
  clearHistory(): void
  subscribe(listener: AgentEventListener): () => void
  dispose(): void
  readonly state: AgentStateSnapshot
  readonly isStreaming: boolean
}

export interface AgentConfig {
  providerConfig: ProviderConfig
  systemPrompt: string
  tools: ToolDefinition[]
  toolContext: IToolContext
  beforeToolCall?: (info: { toolCall: { name: string; args: Record<string, unknown> } }) => Promise<{ block: boolean; reason?: string } | void>
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, ToolParameter>
  execute: (args: Record<string, unknown>, ctx: IToolContext) => Promise<string>
}

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description: string
  required?: boolean
  enum?: string[]
  items?: ToolParameter
}
