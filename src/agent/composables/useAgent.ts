import { ref, readonly, computed } from 'vue'
import type { IAgentBackend, AgentEvent, AgentMessage, ImageAttachment, FileAttachment, UsageData, ThinkingLevel, ChatMode, A2UIMessage, SessionUsage } from '@agent/index'
export type { ChatMode }
import { createWorldSmithAgent, loadApiKey } from '@agent/index'
import type { ProviderConfig, CloudProvider } from '@agent/index'
import { useEntityStore, useRelationStore, useFileStore } from '@worldsmith/entity-core'
import { useSettingsStore } from '../../stores/settingsStore'
import { calculateCost, getModelInfo } from '../../agent/modelRegistry'
import { buildContextInjection, invalidateContextCache } from '@agent/context/builder'
import { saveSession, createSession, getSession, listSessions } from '@agent/index'
import { useAgentEvents } from './useAgentEvents'
import { generateTitle } from './useTitleGen'
import { useAgentCommands, bindAgentActions } from './useAgentCommands'
import { useConfirm } from '@worldsmith/ui-kit'
import { TerminalLogBridge } from '../TerminalLogBridge'
import { useTerminal } from './useTerminal'
import { useActivityLog } from '../../space/composables/useActivityLog'
import { useSpaceStore } from '../../space/stores/space-store'

const backend = ref<IAgentBackend | null>(null)
const isVisible = ref(false)
const isInitialized = ref(false)
const messages = ref<AgentMessage[]>([])
const isStreaming = ref(false)
const currentSessionId = ref<string | null>(null)
const initError = ref<string | null>(null)
const isPinned = ref(true)
const activeChatMode = ref<ChatMode>('normal')
const lockedChatMode = ref<ChatMode | null>(null)
const toolCallNameMap = new Map<string, string>()
const totalUsage = ref<{
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  totalCost: number
  savedByCache: number
  requestCount: number
}>({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalCost: 0,
  savedByCache: 0,
  requestCount: 0,
})

const lastRequestUsage = ref<{
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}>({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
})

const EMPTY_USAGE: SessionUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalCost: 0,
  savedByCache: 0,
  requestCount: 0,
}

const CUMULATIVE_STORAGE_KEY = 'worldsmith_cumulative_usage'

function loadCumulativeUsage(): SessionUsage {
  try {
    const raw = localStorage.getItem(CUMULATIVE_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        inputTokens: parsed.inputTokens || 0,
        outputTokens: parsed.outputTokens || 0,
        cacheReadTokens: parsed.cacheReadTokens || 0,
        cacheWriteTokens: parsed.cacheWriteTokens || 0,
        totalCost: parsed.totalCost || 0,
        savedByCache: parsed.savedByCache || 0,
        requestCount: parsed.requestCount || 0,
      }
    }
  } catch {}
  return { ...EMPTY_USAGE }
}

function saveCumulativeUsage(usage: SessionUsage): void {
  try {
    localStorage.setItem(CUMULATIVE_STORAGE_KEY, JSON.stringify(usage))
  } catch {}
}

const cumulativeUsage = ref<SessionUsage>(loadCumulativeUsage())

const cacheHitRate = readonly(computed(() => {
  const totalInput = totalUsage.value.inputTokens + totalUsage.value.cacheReadTokens + totalUsage.value.cacheWriteTokens
  if (totalInput === 0) return 0
  return Math.round((totalUsage.value.cacheReadTokens / totalInput) * 100)
}))
let toolContext: any = null
let searchConfigCache: { engine?: string; apiKey?: string } = {}
let providerConfig: ProviderConfig | null = null
let contentBase = ''
let hasAssistantInCurrentRun = false

interface A2UISurface {
  surfaceId: string
  catalogId: string
  theme?: Record<string, unknown>
  components: Record<string, any>
  rootIds: string[]
  dataModel: Record<string, unknown>
}

const a2uiSurfaces = ref<Record<string, A2UISurface>>({})

function findRootIds(components: Record<string, any>): string[] {
  if (components['root']) return ['root']
  const childIds = new Set<string>()
  for (const comp of Object.values(components)) {
    const ch = comp.children
    if (Array.isArray(ch)) {
      for (const id of ch) childIds.add(id)
    }
  }
  const roots: string[] = []
  for (const id of Object.keys(components)) {
    if (!childIds.has(id)) roots.push(id)
  }
  return roots
}

function handleA2UIEvent(surfaceId: string, message: A2UIMessage): void {
  if ('createSurface' in message) {
    a2uiSurfaces.value = {
      ...a2uiSurfaces.value,
      [surfaceId]: {
        surfaceId,
        catalogId: message.createSurface.catalogId,
        theme: message.createSurface.theme,
        components: {},
        rootIds: [],
        dataModel: {},
      },
    }
  } else if ('updateComponents' in message) {
    const surface = a2uiSurfaces.value[surfaceId]
    if (!surface) return
    const newComponents = { ...surface.components }
    for (const comp of message.updateComponents.components) {
      newComponents[comp.id] = { ...comp }
    }
    const newRootIds = findRootIds(newComponents)
    a2uiSurfaces.value = {
      ...a2uiSurfaces.value,
      [surfaceId]: { ...surface, components: newComponents, rootIds: newRootIds },
    }
  } else if ('updateDataModel' in message) {
    const surface = a2uiSurfaces.value[surfaceId]
    if (!surface) return
    const newDataModel = JSON.parse(JSON.stringify(surface.dataModel))
    setNestedValue(newDataModel, message.updateDataModel.path, message.updateDataModel.value)
    a2uiSurfaces.value = {
      ...a2uiSurfaces.value,
      [surfaceId]: { ...surface, dataModel: newDataModel },
    }
  } else if ('deleteSurface' in message) {
    const newSurfaces = { ...a2uiSurfaces.value }
    delete newSurfaces[surfaceId]
    a2uiSurfaces.value = newSurfaces
  }
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('/').filter(Boolean)
  if (parts.length === 0) {
    if (typeof value === 'object' && value !== null) Object.assign(obj, value as Record<string, unknown>)
    return
  }
  let current: any = obj
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in current)) current[parts[i]] = {}
    current = current[parts[i]]
  }
  current[parts[parts.length - 1]] = value
}

function resolveDataBinding(binding: any, dataModel: Record<string, unknown>): any {
  if (binding && typeof binding === 'object' && 'path' in binding) {
    const parts = (binding.path as string).split('/').filter(Boolean)
    let current: any = dataModel
    for (const part of parts) {
      if (current == null || typeof current !== 'object') return undefined
      current = current[part]
    }
    return current
  }
  return binding
}

async function refreshSearchConfig(): Promise<void> {
  try {
    const raw = localStorage.getItem('agent_search_config')
    const cfg = raw ? JSON.parse(raw) : {}
    const engine = cfg.engine || 'tavily'
    const apiKey = await loadApiKey('search_' + engine)
    searchConfigCache = { engine, apiKey: apiKey || '' }
  } catch {
    searchConfigCache = {}
  }
}

function applySavedAgentSettings(): void {
    if (!providerConfig) return
    try {
      const raw = localStorage.getItem('agent_settings')
      if (raw) {
        const s = JSON.parse(raw)
        if (s.temperature !== undefined) (providerConfig as any).temperature = s.temperature / 100
        if (s.maxTokens !== undefined) (providerConfig as any).maxTokens = s.maxTokens
      }
    } catch {}
  }

  const DANGEROUS_TOOLS = ['entity_delete', 'relation_delete', 'file_write', 'file_delete', 'code_execute', 'fs_delete']
  const MEDIUM_TOOLS = ['fs_write', 'fs_move', 'pkg_install', 'git_commit', 'git_branch', 'web_fetch_cli']

const { handleEvent: handlePreviewEvent } = useAgentEvents()

export function useAgent() {
  const entityStore = useEntityStore()
  const relationStore = useRelationStore()
  const settingsStore = useSettingsStore()
  const fileStore = useFileStore()

  const { openSettings: _cmdOpenSettings } = useAgentCommands()
  bindAgentActions(sendMessage, _cmdOpenSettings)

  const { terminalVisible, ptyId, ptyReady, spawnPty, writeToPty, resizePty, killPty, showTerminal, hideTerminal } = useTerminal()
  const logBridge = new TerminalLogBridge()

  async function buildProviderConfig(): Promise<ProviderConfig> {
    const mode = settingsStore.aiProviderMode as 'cloud' | 'local' | 'custom'

    if (mode === 'cloud') {
      const provider = settingsStore.aiCloudProvider as CloudProvider
      const apiKey = await loadApiKey(provider)
      const info = getModelInfo(settingsStore.aiCloudModel)
      return {
        mode: 'cloud',
        provider,
        modelId: settingsStore.aiCloudModel,
        apiKey,
        supportsVision: info?.supportsVision ?? false,
        contextWindow: info?.contextLength,
        maxTokens: info?.maxOutputTokens,
      } as any
    }

    if (mode === 'local') {
      return {
        mode: 'local',
        endpoint: settingsStore.aiLocalEndpoint,
        apiType: settingsStore.aiLocalType as any,
        modelId: settingsStore.aiLocalModel,
      }
    }

    const apiKey = await loadApiKey(settingsStore.getCustomKeyStoreId(settingsStore.aiCustomBaseUrl))
    const cfg: ProviderConfig = {
      mode: 'custom',
      baseUrl: settingsStore.aiCustomBaseUrl,
      apiType: settingsStore.aiCustomType as any,
      modelId: settingsStore.aiCustomModel,
      apiKey,
    }
    if (providerConfig && 'contextWindow' in providerConfig) {
      (cfg as any).contextWindow = (providerConfig as any).contextWindow
    }
    if (providerConfig && 'maxTokens' in providerConfig) {
      (cfg as any).maxTokens = (providerConfig as any).maxTokens
    }
    return cfg
  }

  const { confirm } = useConfirm()

  async function ensureInitialized(): Promise<boolean> {
    if (isInitialized.value && backend.value) return true

    initError.value = null
    await refreshSearchConfig()

    try {
      providerConfig = await buildProviderConfig()
      applySavedAgentSettings()

      toolContext = {
        stores: {
          entity: entityStore,
          relation: relationStore,
          file: fileStore,
          settings: {
            getProviderConfig: () => providerConfig,
            getSearchConfig: () => searchConfigCache,
          },
          ui: {
            confirm: async (title: string, message: string) => {
              return confirm({ type: 'warning', title, description: message })
            },
          },
        },
        projectInfo: {
          name: 'WorldSmith',
          entityTypes: entityStore.types.map(t => t.type),
          relationTypes: [],
        },
        platform: 'web' as const,
        appendBlock: (block: import('@agent/index').MessageBlock) => {
          const last = findLastAssistant()
          if (last) {
            console.log('[Agent] appendBlock:', block.type, block.id, '→ msg:', last.id)
            last.blocks = [...(last.blocks || []), block]
          } else {
            console.warn('[Agent] appendBlock: no assistant message found')
          }
        },
      }

      const agent = await createWorldSmithAgent({
        providerConfig,
        toolContext,
        projectName: 'WorldSmith',
        beforeToolCall: async ({ toolCall }) => {
          if (toolCall.name === 'execute_command') {
            const cmd = String(toolCall.args?.command || '')
            const DANGEROUS_COMMAND_PATTERNS: RegExp[] = [
              /rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+|.*--no-preserve-root)/,
              /sudo\s+/,
              /format\s+[a-zA-Z]:/i,
              /dd\s+if=/,
              /:\(\)\{\s*:\|:\&\s*\}\s*;/,
              /shutdown|reboot/i,
              /chmod\s+(-R\s+)?777/,
              /curl\s+.*\|\s*(ba)?sh/,
            ]
            const isDangerous = DANGEROUS_COMMAND_PATTERNS.some(p => p.test(cmd))
            if (isDangerous || settingsStore.aiDangerConfirm) {
              const confirmed = await confirm({
                type: 'warning',
                title: 'AI 请求执行终端命令',
                description: `工具: execute_command\n命令: ${cmd}\n\n是否允许？`,
              })
              if (!confirmed) return { block: true, reason: '用户拒绝执行终端命令' }
            }
            return void 0
          }
          if (!settingsStore.aiDangerConfirm) return void 0
          if (DANGEROUS_TOOLS.includes(toolCall.name)) {
            const confirmed = await confirm({
              type: 'warning',
              title: 'AI 请求执行危险操作',
              description: `工具: ${toolCall.name}\n参数: ${JSON.stringify(toolCall.args)}\n\n是否允许？`,
            })
            if (!confirmed) return { block: true, reason: '用户拒绝' }
          }
          if (MEDIUM_TOOLS.includes(toolCall.name)) {
            const confirmed = await confirm({
              type: 'warning',
              title: 'AI 请求执行操作',
              description: `工具: ${toolCall.name}\n参数: ${JSON.stringify(toolCall.args)}\n\n是否允许？`,
            })
            if (!confirmed) return { block: true, reason: '用户拒绝' }
          }
          return void 0
        },
      })

      agent.subscribe((event: AgentEvent) => {
        handleAgentEvent(event)
      })

      backend.value = agent
      isInitialized.value = true

      if (!currentSessionId.value) {
        const existing = await listSessions()
        if (existing.length > 0) {
          currentSessionId.value = existing[0].id
        } else {
          const session = await createSession(providerConfig.mode, providerConfig.modelId)
          currentSessionId.value = session.id
        }
      }

      registerDefaultCommands()
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      initError.value = msg
      console.error('[Agent Init Error]', msg)
      return false
    }
  }

  function registerDefaultCommands(): void {
    const { register: registerCmd } = useAgentCommands()

    registerCmd({
      id: 'cmd.worldbuilding',
      label: '世界观构建',
      icon: 'globe',
      description: '协助构建世界观',
      category: 'skill',
      handler: () => sendMessageWithSkill('/skill:worldbuilding', ['worldbuilding']),
    })
    registerCmd({
      id: 'cmd.roleplay',
      label: '角色推演',
      icon: 'sparkles',
      description: '基于角色属性推演行为',
      category: 'skill',
      handler: () => sendMessageWithSkill('/skill:roleplay', ['roleplay']),
    })
    registerCmd({
      id: 'cmd.generate',
      label: '内容生成',
      icon: '✨',
      description: '批量生成实体和内容',
      category: 'skill',
      handler: () => sendMessageWithSkill('/skill:content-craft', ['content-craft']),
    })
    registerCmd({
      id: 'cmd.analysis',
      label: '算法分析',
      icon: '🔬',
      description: '运行图/几何/地形算法',
      category: 'skill',
      handler: () => sendMessageWithSkill('/skill:analysis-engine', ['analysis-engine']),
    })
    registerCmd({
      id: 'cmd.retrofit',
      label: '安全改造',
      icon: '🔧',
      description: '修改项目结构和Schema',
      category: 'skill',
      handler: () => sendMessageWithSkill('/skill:retrofit-architect', ['retrofit-architect']),
    })
    registerCmd({
      id: 'cmd.webscout',
      label: '联网搜索',
      icon: '🌐',
      description: '搜索互联网获取信息',
      category: 'skill',
      handler: () => sendMessageWithSkill('/skill:web-scout', ['web-scout']),
    })
    registerCmd({
      id: 'cmd.output',
      label: '输出编排',
      icon: 'target',
      description: '智能选择输出形式',
      category: 'skill',
      handler: () => sendMessageWithSkill('/skill:output-orchestrator', ['output-orchestrator']),
    })
    registerCmd({
      id: 'cmd.search',
      label: '搜索项目',
      icon: 'search',
      description: '搜索项目内容',
      category: 'action',
      handler: () => sendMessage('请搜索项目中的相关内容'),
    })
    registerCmd({
      id: 'cmd.report',
      label: '每日报告',
      icon: 'chart',
      description: '生成项目状态报告',
      category: 'action',
      handler: () => sendMessage('请生成今日项目状态报告'),
    })
    registerCmd({
      id: 'cmd.consistency',
      label: '一致性检查',
      icon: 'search',
      description: '检查数据一致性',
      category: 'action',
      handler: () => sendMessage('请检查项目数据一致性'),
    })
  }

  const { addLog } = useActivityLog()

  function handleAgentEvent(event: AgentEvent): void {
    handlePreviewEvent(event)

    switch (event.type) {
      case 'agent_start':
        isStreaming.value = true
        contentBase = ''
        hasAssistantInCurrentRun = false
        if (event.chatMode && lockedChatMode.value === null) activeChatMode.value = event.chatMode
        addLog('info', `开始响应（模式: ${{normal:'快问快答',deep:'深度思考',explore:'知识探索'}[event.chatMode] || event.chatMode}）`)
        break
      case 'agent_end':
        isStreaming.value = false
        hasAssistantInCurrentRun = false
        if (event.messages?.length) {
          const existing = findLastAssistant()
          if (!existing) {
            const lastMsg = event.messages[event.messages.length - 1]
            if (lastMsg && lastMsg.role === 'assistant' && (lastMsg.content || lastMsg.thinking)) {
              messages.value.push(lastMsg)
            }
          }
        }
        autoSaveSession()
        generateTitleIfNeeded()
        break
      case 'turn_end':
        break
      case 'message_start':
        if (event.message && event.message.role !== 'user') {
          if (!event.message.metadata) event.message.metadata = {}
          if (!event.message.metadata.chatMode) event.message.metadata.chatMode = activeChatMode.value
          if (hasAssistantInCurrentRun) {
            const last = findLastAssistant()
            if (last) {
              contentBase = last.content ? last.content + '\n' : ''
            }
          } else {
            messages.value.push(event.message)
            hasAssistantInCurrentRun = true
          }
        }
        break
      case 'message_update':
        const last = findLastAssistant()
        if (last) {
          if (event.content) last.content = contentBase + event.content
          if (event.thinking) last.thinking = event.thinking
        }
        break
      case 'message_end':
        const endMsg = findLastAssistant()
        if (endMsg) {
          if (event.content) endMsg.content = contentBase + event.content
          if (event.thinking) endMsg.thinking = event.thinking
          contentBase = endMsg.content ? endMsg.content + '\n' : ''
        }
        if (event.usage) {
          accumulateUsage(event.usage)
        }
        break
      case 'tool_execution_start':
        const tcTarget = findLastAssistant()
        if (tcTarget) {
          const existing = tcTarget.toolCalls || []
          const dupIdx = existing.findIndex(t => t.id === event.toolCall.id)
          if (dupIdx !== -1) {
            const updated = [...existing]
            updated[dupIdx] = { ...updated[dupIdx], status: 'running', startedAt: Date.now() }
            tcTarget.toolCalls = updated
          } else {
            tcTarget.toolCalls = [...existing, {
              id: event.toolCall.id,
              name: event.toolCall.name,
              args: event.toolCall.args as Record<string, unknown>,
              status: 'running',
              startedAt: Date.now(),
            }]
          }
        }
        addLog('tool', `调用工具: ${event.toolCall.name}`, JSON.stringify(event.toolCall.args))
        toolCallNameMap.set(event.toolCall.id, event.toolCall.name)
        break
      case 'tool_execution_end':
        const tcEndTarget = findLastAssistant()
        if (tcEndTarget?.toolCalls) {
          const idx = tcEndTarget.toolCalls.findIndex(t => t.id === event.toolCallId)
          if (idx !== -1) {
            const updated = [...tcEndTarget.toolCalls]
            updated[idx] = {
              ...updated[idx],
              status: event.success ? 'completed' : 'failed',
              result: event.result,
              endedAt: Date.now(),
            }
            tcEndTarget.toolCalls = updated
          }
        }
        if (!event.success) {
          addLog('error', `工具失败: ${event.toolCallId}`)
        }
        const tcName = toolCallNameMap.get(event.toolCallId)
        toolCallNameMap.delete(event.toolCallId)
        if (event.success && tcName === 'persona_update') {
          try {
            const result = JSON.parse(event.result || '{}')
            if (result.success) {
              const spaceStore = useSpaceStore()
              const patch: { name?: string; avatar?: string } = {}
              if (result.name) patch.name = result.name
              if (result.avatar) patch.avatar = result.avatar
              if (patch.name || patch.avatar) {
                spaceStore.updatePersona(patch)
                addLog('info', `人格更新: ${result.updates?.join(', ') || '已更新'}`)
              }
            }
          } catch {}
        }
        break
      case 'usage':
        accumulateUsage(event.usage)
        break
      case 'a2ui':
        handleA2UIEvent(event.surfaceId, event.message)
        break
      case 'block_append':
        const blockTarget = findLastAssistant()
        if (blockTarget) {
          console.log('[Agent] block_append event:', event.block.type, event.block.id)
          blockTarget.blocks = [...(blockTarget.blocks || []), event.block]
        } else {
          console.warn('[Agent] block_append event: no assistant message found')
        }
        break
      case 'error':
        console.error('[Agent Error]', event.error)
        isStreaming.value = false
        messages.value.push({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `错误: ${event.error?.message || String(event.error)}`,
          timestamp: Date.now(),
        })
        addLog('error', `错误: ${event.error?.message || String(event.error)}`)
        break
    }

    logBridge.handleEvent(event as any)
  }

  function findLastAssistant(): AgentMessage | undefined {
    for (let i = messages.value.length - 1; i >= 0; i--) {
      if (messages.value[i].role === 'assistant') return messages.value[i]
    }
    return undefined
  }

  function accumulateUsage(usage: UsageData): void {
    totalUsage.value.inputTokens += usage.inputTokens || 0
    totalUsage.value.outputTokens += usage.outputTokens || 0
    totalUsage.value.cacheReadTokens += usage.cacheReadTokens || 0
    totalUsage.value.cacheWriteTokens += usage.cacheWriteTokens || 0
    totalUsage.value.requestCount += 1

    lastRequestUsage.value = {
      inputTokens: usage.inputTokens || 0,
      outputTokens: usage.outputTokens || 0,
      cacheReadTokens: usage.cacheReadTokens || 0,
      cacheWriteTokens: usage.cacheWriteTokens || 0,
    }

    if (providerConfig) {
      const modelId = (providerConfig as any).modelId || ''
      const breakdown = calculateCost(
        modelId,
        usage.inputTokens || 0,
        usage.outputTokens || 0,
        usage.cacheReadTokens || 0,
        usage.cacheWriteTokens || 0,
      )
      totalUsage.value.totalCost += breakdown.total
      totalUsage.value.savedByCache += breakdown.savedByCache
    }

    cumulativeUsage.value.inputTokens += usage.inputTokens || 0
    cumulativeUsage.value.outputTokens += usage.outputTokens || 0
    cumulativeUsage.value.cacheReadTokens += usage.cacheReadTokens || 0
    cumulativeUsage.value.cacheWriteTokens += usage.cacheWriteTokens || 0
    cumulativeUsage.value.requestCount += 1
    if (providerConfig) {
      const modelId = (providerConfig as any).modelId || ''
      const breakdown = calculateCost(
        modelId,
        usage.inputTokens || 0,
        usage.outputTokens || 0,
        usage.cacheReadTokens || 0,
        usage.cacheWriteTokens || 0,
      )
      cumulativeUsage.value.totalCost += breakdown.total
      cumulativeUsage.value.savedByCache += breakdown.savedByCache
    }
    saveCumulativeUsage(cumulativeUsage.value)
  }

  function updateThinkingLevel(level: ThinkingLevel): void {
    if (backend.value) {
      backend.value.updateThinkingLevel(level)
    }
  }

  async function sendMessage(text: string, images?: ImageAttachment[], files?: FileAttachment[], chatMode?: ChatMode): Promise<void> {
    const skillMatch = text.match(/^\/skill:(\S+)/)
    const skillNames = skillMatch ? [skillMatch[1]] : undefined
    const displayText = skillMatch ? `请使用 ${skillMatch[1]} 技能` : text
    await sendMessageInternal(displayText, skillNames, images, files, chatMode)
  }

  async function sendMessageWithSkill(text: string, skillNames: string[]): Promise<void> {
    const skillMatch = text.match(/^\/skill:(\S+)/)
    const displayText = skillMatch ? `请使用 ${skillMatch[1]} 技能` : text
    await sendMessageInternal(displayText, skillNames)
  }

  async function sendMessageInternal(text: string, skillNames?: string[], images?: ImageAttachment[], files?: FileAttachment[], chatMode?: ChatMode): Promise<void> {
    const ok = await ensureInitialized()
    if (!ok || !backend.value) {
      messages.value.push({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: initError.value
          ? `初始化失败: ${initError.value}\n\n请检查设置中的 AI 助手配置。`
          : 'AI 助手未就绪',
        timestamp: Date.now(),
      })
      return
    }

    const effectiveMode = chatMode ?? activeChatMode.value
    if (lockedChatMode.value === null) {
      lockedChatMode.value = effectiveMode
      activeChatMode.value = effectiveMode
    }

    messages.value.push({
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      images: images && images.length > 0 ? images : undefined,
      files: files && files.length > 0 ? files : undefined,
      timestamp: Date.now(),
    })

    invalidateContextCache()
    const contextInjection = toolContext ? await buildContextInjection(toolContext) : ''
    let personaPreset: string | undefined
    try {
      const raw = localStorage.getItem('agent_settings')
      if (raw) { const s = JSON.parse(raw); if (s.personaPreset) personaPreset = s.personaPreset }
    } catch {}
    await backend.value.prompt(text, { contextOverride: contextInjection, images, files, skillNames, personaPreset, chatMode: lockedChatMode.value })
  }

  async function abort(): Promise<void> {
    if (backend.value) await backend.value.abort()
  }

  async function steer(text: string): Promise<void> {
    if (backend.value) await backend.value.steer(text)
  }

  async function sendBlockAction(steerText: string, displayText: string): Promise<void> {
    if (isStreaming.value) {
      if (backend.value) await backend.value.steer(steerText)
    } else {
      const ok = await ensureInitialized()
      if (!ok || !backend.value) return
      if (lockedChatMode.value === null) {
        lockedChatMode.value = activeChatMode.value
      }
      messages.value.push({
        id: crypto.randomUUID(),
        role: 'user',
        content: displayText,
        timestamp: Date.now(),
      })
      invalidateContextCache()
      const contextInjection = toolContext ? await buildContextInjection(toolContext) : ''
      await backend.value.prompt(steerText, { contextOverride: contextInjection, chatMode: lockedChatMode.value })
    }
  }

  function toggleVisibility(): void {
    isVisible.value = !isVisible.value
  }

  function show(): void {
    isVisible.value = true
  }

  function hide(): void {
    isVisible.value = false
  }

  async function autoSaveSession(): Promise<void> {
    if (!currentSessionId.value) return
    const session = await getSession(currentSessionId.value)
    if (session) {
      session.messages = JSON.parse(JSON.stringify(messages.value))
      session.metadata.usage = { ...totalUsage.value }
      session.metadata.totalTokens = totalUsage.value.inputTokens + totalUsage.value.cacheReadTokens + totalUsage.value.cacheWriteTokens + totalUsage.value.outputTokens
      session.metadata.totalCost = totalUsage.value.totalCost
      session.metadata.toolCallCount = totalUsage.value.requestCount
      await saveSession(session)
    }
  }

  async function generateTitleIfNeeded(): Promise<void> {
    if (!currentSessionId.value || !providerConfig) return
    const session = await getSession(currentSessionId.value)
    if (!session || session.name !== '新会话') return
    const userMsgs = messages.value.filter(m => m.role === 'user')
    const assistantMsgs = messages.value.filter(m => m.role === 'assistant')
    if (userMsgs.length === 0 || assistantMsgs.length === 0) return
    const firstUser = userMsgs[0].content
    const firstAssistant = assistantMsgs[0].content
    try {
      const title = await generateTitle(providerConfig, firstUser, firstAssistant)
      if (title) {
        session.name = title
        await saveSession(session)
        window.dispatchEvent(new CustomEvent('ws-session-title-updated'))
      }
    } catch {}
  }

  async function newSession(): Promise<void> {
    await autoSaveSession()
    if (backend.value) {
      backend.value.dispose()
      backend.value = null
    }
    isInitialized.value = false
    messages.value = []
    a2uiSurfaces.value = {}
    activeChatMode.value = 'normal'
    lockedChatMode.value = null
    totalUsage.value = { ...EMPTY_USAGE }
    lastRequestUsage.value = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    }
    try {
      const providerConfig = await buildProviderConfig()
      const session = await createSession(providerConfig.mode, providerConfig.modelId)
      currentSessionId.value = session.id
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      initError.value = `创建会话失败: ${msg}`
      console.error('[Agent] newSession error:', msg)
    }
  }

  async function switchSession(sessionId: string): Promise<void> {
    if (sessionId === currentSessionId.value) return
    await autoSaveSession()
    const session = await getSession(sessionId)
    if (!session) return
    if (backend.value) {
      backend.value.dispose()
      backend.value = null
    }
    isInitialized.value = false
    messages.value = session.messages || []
    a2uiSurfaces.value = {}
    activeChatMode.value = 'normal'
    lockedChatMode.value = null
    totalUsage.value = session.metadata.usage
      ? { ...session.metadata.usage }
      : { ...EMPTY_USAGE }
    lastRequestUsage.value = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    }
    currentSessionId.value = session.id
  }

  function clearInitError(): void {
    initError.value = null
  }

  function dispose(): void {
    if (backend.value) {
      backend.value.dispose()
      backend.value = null
    }
    isInitialized.value = false
    messages.value = []
    currentSessionId.value = null
    killPty()
  }

  function getMCPManager(): import('@agent/mcp/mcp-manager').MCPManager | null {
    return (backend.value as any)?.getMCPManager?.() ?? null
  }

  async function addMCPConnection(config: import('@agent/index').MCPConnectionConfig): Promise<void> {
    const mgr = getMCPManager()
    if (!mgr) return
    await mgr.addConnection(config)
  }

  async function removeMCPConnection(serverId: string): Promise<void> {
    const mgr = getMCPManager()
    if (!mgr) return
    await mgr.removeConnection(serverId)
  }

  function getMCPConnections(): import('@agent/index').MCPConnectionState[] {
    return getMCPManager()?.getConnectionStates() ?? []
  }

  return {
    isVisible: readonly(isVisible),
    isInitialized: readonly(isInitialized),
    messages: readonly(messages),
    isStreaming: readonly(isStreaming),
    currentSessionId: readonly(currentSessionId),
    initError: readonly(initError),
    isPinned,
    activeChatMode: readonly(activeChatMode),
    lockedChatMode: readonly(lockedChatMode),
    setChatMode: (mode: ChatMode) => { if (lockedChatMode.value === null) activeChatMode.value = mode },
    totalUsage: readonly(totalUsage),
    lastRequestUsage: readonly(lastRequestUsage),
    cumulativeUsage: readonly(cumulativeUsage),
    cacheHitRate,
    a2uiSurfaces: readonly(a2uiSurfaces),
    resolveDataBinding,
    updateThinkingLevel,
    refreshSearchConfig,
    getMCPManager,
    addMCPConnection,
    removeMCPConnection,
    getMCPConnections,
    updateModel: async (provider: string, modelId: string, baseUrl?: string, apiKey?: string, temperature?: number, maxTokens?: number, contextWindow?: number, _maxOut?: number) => {
      try {
        if (backend.value) {
          await backend.value.updateModel(provider, modelId, baseUrl, apiKey, contextWindow, maxTokens, temperature !== undefined ? temperature / 100 : undefined)
        }
      } catch (err: any) {
        console.error('[useAgent] updateModel backend call failed:', err?.message || String(err), { provider, modelId })
      }
      try {
        if (providerConfig) {
          if (providerConfig.mode === 'cloud') {
            const cloudCfg = providerConfig as { provider: string; modelId: string; apiKey?: string }
            cloudCfg.provider = provider
            cloudCfg.modelId = modelId
            if (apiKey !== undefined) cloudCfg.apiKey = apiKey
          }
          const cfg = providerConfig as unknown as Record<string, unknown>
          if (temperature !== undefined) {
            cfg.temperature = temperature / 100
          }
          if (maxTokens !== undefined) {
            cfg.maxTokens = maxTokens
          }
          if (contextWindow !== undefined) {
            cfg.contextWindow = contextWindow
          }
        }
      } catch (err: any) {
        console.error('[useAgent] updateModel providerConfig sync failed:', err?.message || String(err), { provider, modelId })
      }
    },
    ensureInitialized,
    sendMessage,
    steer,
    sendBlockAction,
    abort,
    newSession,
    switchSession,
    clearInitError,
    toggleVisibility,
    show,
    hide,
    dispose,
    terminalVisible,
    ptyId,
    ptyReady,
    logBridge,
    openTerminal: async () => {
      showTerminal()
      if (!ptyReady.value) {
        try {
          await spawnPty()
        } catch (err) {
          hideTerminal()
          const { toastWarn } = await import('../../composables/useToast')
          toastWarn(err instanceof Error ? err.message : '终端功能不可用')
        }
      }
    },
    closeTerminal: hideTerminal,
    writePtyInput: writeToPty,
    resizePty,
    createSubBackend: async (skillIds: string[], visionProviderConfig?: any) => {
      if (!providerConfig || !toolContext) {
        throw new Error('主 Agent 未初始化')
      }
      const { getToolsForSkills } = await import('@agent/index')
      const tools = getToolsForSkills(skillIds)
      return createWorldSmithAgent({
        providerConfig: visionProviderConfig || providerConfig,
        toolContext,
        tools,
        projectName: 'WorldSmith-SubAgent',
      })
    },
    getProviderConfig: () => providerConfig,
    getToolContext: () => toolContext,
  }
}
