import { ref, onBeforeUnmount } from 'vue'
import { eventBus, type EntityCreateEvent, type EntityUpdateEvent, type EntityDeleteEvent, type FieldChangeEvent, type RelationCreateEvent, type RelationDeleteEvent, type NameInputEvent, type TextInputEvent, type BatchEditEvent } from '../modules/runtime/events'
import { useEntityStore, useRelationStore } from '@worldsmith/entity-core'
import { useSettingsStore } from '../stores/settingsStore'
import { usePersonaStore } from '../stores/personaStore'
import { useUIStore } from '../stores/uiStore'
import { buildVideoModePrompt, type PersonaSnapshot, type VideoModePromptInput, type VideoModeContext } from '../agent/personaPrompt'
import type { ProviderConfig } from '@agent/index'
import { loadApiKey } from '@agent/index'
import { resolveEndpoint, extractTitle, buildLLMBody } from '../agent/composables/useTitleGen'
import {
  type TriggerContext,
  type PopupPosition,
  getSceneConfig,
  getScenePosition,
  identifySceneFromEntityCreate,
  identifySceneFromEntityUpdate,
  identifySceneFromEntityDelete,
  identifySceneFromFieldChange,
  identifySceneFromRelationCreate,
  identifySceneFromRelationDelete,
  identifySceneFromViewSwitch,
  identifySceneFromNameInput,
  identifySceneFromBatchEdit,
} from './videoModeScene'
import {
  type TriggerMethod,
  type LuckState,
  selectTriggerMethod,
  calculateProbability,
  createLuckState,
  updateLuck,
  getLuckLabel,
  PauseDetector,
  CharCountDetector,
  detectSentenceEnd,
} from './videoModeTrigger'

export interface VideoNotificationData {
  id: string
  entityId: string
  entityName: string
  entityType: string
  content: string
  isFarewell: boolean
  createdAt: number
  pinned: boolean
  sceneId?: string
  position?: PopupPosition
}

const notifications = ref<VideoNotificationData[]>([])
const activeEntityId = ref<string | null>(null)
const sessionMemory = new Map<string, string[]>()
const editStartTimes = new Map<string, number>()
const lastPopupTimes = new Map<string, number>()

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
const dismissTimers = new Map<string, ReturnType<typeof setTimeout>>()
const pauseDetectors = new Map<string, PauseDetector>()
const charCountDetectors = new Map<string, CharCountDetector>()
const inputThrottleTimers = new Map<string, number>()
const pendingCharCountContexts = new Map<string, TriggerContext>()

let currentRequestId = 0
let currentAbortController: AbortController | null = null
let consecutiveFailures = 0
const luckState = ref<LuckState>(createLuckState())

const MIN_CHANGE_LENGTH = 3
const LIFELIKE_TYPES = new Set(['character', 'species', 'organization'])
const MAX_SESSION_ENTITIES = 100

let initialized = false

function pickPersonaForEntity(entityId: string): PersonaSnapshot | null {
  const entityStore = useEntityStore()
  const settingsStore = useSettingsStore()
  const directPersona = buildPersonaSnapshot(entityId)
  if (!directPersona) return null

  if (!settingsStore.videoModeCrossPlugin) return directPersona

  if (LIFELIKE_TYPES.has(directPersona.entityType)) return directPersona

  const roll = Math.random() * 100
  if (roll >= settingsStore.videoModePersonaSwitchChance) return directPersona

  const allEntities = entityStore.entities
  const lifelike = allEntities.filter(e => LIFELIKE_TYPES.has(e.type) && e.id !== entityId)
  if (lifelike.length === 0) return directPersona

  const chosen = lifelike[Math.floor(Math.random() * lifelike.length)]
  const crossPersona = buildPersonaSnapshot(chosen.id)
  return crossPersona || directPersona
}

function buildPersonaSnapshot(entityId: string): PersonaSnapshot | null {
  const entityStore = useEntityStore()
  const relationStore = useRelationStore()
  const entityMap = new Map(entityStore.entities.map(e => [e.id, e]))
  const entity = entityMap.get(entityId)
  if (!entity) return null

  const allRelations = relationStore.relations
  const related = allRelations
    .filter(r => r.sourceId === entityId || r.targetId === entityId)
    .slice(0, 5)
    .map(r => {
      const otherId = r.sourceId === entityId ? r.targetId : r.sourceId
      const other = entityMap.get(otherId)
      return {
        name: other?.name || otherId.slice(0, 8),
        type: other?.type || 'unknown',
        relationType: r.type || '关联',
      }
    })

  return {
    entityId: entity.id,
    entityName: entity.name,
    entityType: entity.type,
    description: entity.description || '',
    properties: entity.properties || {},
    relatedEntities: related,
  }
}

async function callLLM(prompt: string): Promise<string | null> {
  const settingsStore = useSettingsStore()

  let cfg: ProviderConfig
  try {
    const mode = settingsStore.aiProviderMode as 'cloud' | 'local' | 'custom'
    if (mode === 'cloud') {
      const provider = settingsStore.aiCloudProvider as any
      const apiKey = await loadApiKey(provider)
      cfg = { mode: 'cloud', provider, modelId: settingsStore.aiCloudModel, apiKey }
    } else if (mode === 'local') {
      cfg = { mode: 'local', endpoint: settingsStore.aiLocalEndpoint, apiType: settingsStore.aiLocalType as any, modelId: settingsStore.aiLocalModel }
    } else {
      const apiKey = await loadApiKey('custom')
      cfg = { mode: 'custom', baseUrl: settingsStore.aiCustomBaseUrl, apiType: settingsStore.aiCustomType as any, modelId: settingsStore.aiCustomModel, apiKey }
    }
  } catch {
    return null
  }

  const { url, headers, model } = resolveEndpoint(cfg)

  const body = buildLLMBody(cfg, model, prompt, 120, 0.7)

  const requestId = ++currentRequestId
  const controller = new AbortController()
  currentAbortController = controller
  const timeout = setTimeout(() => controller.abort(), settingsStore.videoModeTimeout * 1000)

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!resp.ok) return null
    const json = await resp.json()
    return extractTitle(cfg, json)
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
    if (currentRequestId === requestId) {
      currentAbortController = null
    }
  }
}

function hasSignificantChange(
  oldProps: Record<string, unknown>,
  newProps: Record<string, unknown>,
  changedFields: string[],
): boolean {
  for (const field of changedFields) {
    if (field === 'updatedAt') continue
    if (field === 'name' || field === 'description') return true
    if (field === 'properties') {
      const allKeys = new Set([...Object.keys(oldProps), ...Object.keys(newProps)])
      for (const key of allKeys) {
        const ov = String(oldProps[key] ?? '')
        const nv = String(newProps[key] ?? '')
        if (ov === nv) continue
        if (ov === '' && nv.length > 0) return true
        if (nv === '' && ov.length > 0) return true
        if (Math.abs(nv.length - ov.length) >= MIN_CHANGE_LENGTH) return true
      }
      continue
    }
    const oldVal = String(oldProps[field] ?? '')
    const newVal = String(newProps[field] ?? '')
    if (Math.abs(newVal.length - oldVal.length) >= MIN_CHANGE_LENGTH) return true
    if (oldVal !== newVal && newVal.length > 0) return true
  }
  return false
}

function getSceneBaseProbability(sceneId: string): number {
  const settingsStore = useSettingsStore()
  const prob = settingsStore.videoModeSceneProbs[sceneId]
  if (prob !== undefined) return prob / 100
  const config = getSceneConfig(sceneId)
  return config ? config.baseProbability : 0.3
}

function buildVideoModeContext(entityId: string, ctx: TriggerContext): VideoModeContext {
  const uiStore = useUIStore()
  const entityStore = useEntityStore()
  const settingsStore = useSettingsStore()

  const editStartTime = editStartTimes.get(entityId)
  const editDuration = editStartTime ? (Date.now() - editStartTime) / 1000 : undefined
  const editCount = sessionMemory.get(entityId)?.length || 0

  const typeCounts = entityStore.typeCounts
  const luckLabel = settingsStore.videoModeLuckEnabled ? getLuckLabel(luckState.value.coefficient) : undefined

  return {
    currentView: ctx.currentView || uiStore.currentView,
    editDurationSeconds: editDuration,
    editCount: editCount > 0 ? editCount + 1 : undefined,
    projectStats: {
      characters: typeCounts.get('character') || 0,
      regions: typeCounts.get('region') || 0,
      events: typeCounts.get('event') || 0,
      total: entityStore.entities.length,
    },
    luckLabel,
  }
}

function runProbabilityGate(ctx: TriggerContext): boolean {
  const settingsStore = useSettingsStore()
  const sceneConfig = getSceneConfig(ctx.sceneId)
  if (!sceneConfig) return false

  const baseProb = getSceneBaseProbability(ctx.sceneId)
  const isImmediate = sceneConfig.recommendedMethod === 'immediate'

  const editDuration = ctx.editDuration ?? ((Date.now() - (editStartTimes.get(ctx.entityId) || Date.now())) / 1000)
  const memoryCount = sessionMemory.get(ctx.entityId)?.length || 0
  const lastPopup = lastPopupTimes.get(ctx.entityId) || 0
  const secondsSinceLastPopup = (Date.now() - lastPopup) / 1000

  const luckCoeff = settingsStore.videoModeLuckEnabled ? luckState.value.coefficient : 1.0

  const result = calculateProbability(
    baseProb,
    editDuration,
    memoryCount,
    secondsSinceLastPopup,
    luckCoeff,
    isImmediate,
  )

  return result.shouldTrigger
}

function applyTriggerMethod(method: TriggerMethod, ctx: TriggerContext, callback: () => void): void {
  const settingsStore = useSettingsStore()

  switch (method) {
    case 'immediate':
      callback()
      break

    case 'pause': {
      const entityId = ctx.entityId
      const existing = pauseDetectors.get(entityId)
      if (existing) existing.cancel()
      const detector = new PauseDetector(settingsStore.videoModePauseThreshold * 1000, () => {
        pauseDetectors.delete(entityId)
        callback()
      })
      pauseDetectors.set(entityId, detector)
      detector.reset()
      break
    }

    case 'sentence':
      callback()
      break

    case 'charCount': {
      const entityId = ctx.entityId
      pendingCharCountContexts.set(entityId, ctx)
      let detector = charCountDetectors.get(entityId)
      if (!detector) {
        detector = new CharCountDetector(settingsStore.videoModeCharThreshold, () => {
          const pendingCtx = pendingCharCountContexts.get(entityId)
          if (pendingCtx) triggerVideoModeFromContext(pendingCtx)
        })
        charCountDetectors.set(entityId, detector)
      }
      break
    }
  }
}

function feedSentenceDetection(entityId: string, text: string, field: string) {
  if (!detectSentenceEnd(text)) return
  const sceneId = field === 'description' ? 'field_long' : 'field_short'
  triggerVideoModeFromContext({
    sceneId,
    entityId,
    changeType: 'field_change',
    changedFields: [field],
  })
}

function feedCharCount(entityId: string, text: string) {
  const detector = charCountDetectors.get(entityId)
  if (detector) detector.feed(text)
}

async function triggerVideoModeFromContext(ctx: TriggerContext) {
  const settingsStore = useSettingsStore()
  if (!settingsStore.videoModeEnabled) return
  if (consecutiveFailures >= settingsStore.videoModeMaxFailures) return

  if (!runProbabilityGate(ctx)) return

  let entityId = ctx.entityId
  if (!entityId) {
    if (ctx.changeType === 'view_switch') {
      entityId = activeEntityId.value || useEntityStore().entities[0]?.id || ''
    }
    if (!entityId) return
  }

  const persona = pickPersonaForEntity(entityId)
  if (!persona) return

  if (ctx.changeType === 'update' && ctx.changedFields && ctx.oldValues && ctx.newValues) {
    if (!hasSignificantChange(ctx.oldValues, ctx.newValues, ctx.changedFields)) return
  }

  if (currentAbortController) {
    currentAbortController.abort()
    currentAbortController = null
  }

  const memory = sessionMemory.get(entityId) || []

  const vmContext = buildVideoModeContext(entityId, ctx)

  const input: VideoModePromptInput = {
    persona,
    changeType: ctx.changeType === 'create' || ctx.changeType === 'delete'
      ? ctx.changeType
      : 'update',
    sceneId: ctx.sceneId,
    changedFields: ctx.changedFields,
    oldValues: ctx.oldValues,
    newValues: ctx.newValues,
    sessionMemory: memory,
    context: vmContext,
  }

  const prompt = buildVideoModePrompt(input)
  const content = await callLLM(prompt)

  if (!content) {
    consecutiveFailures++
    if (consecutiveFailures >= settingsStore.videoModeMaxFailures) {
      console.warn('[VideoMode] 连续失败', settingsStore.videoModeMaxFailures, '次，自动暂停')
    }
    return
  }

  consecutiveFailures = 0

  const settingsStore2 = useSettingsStore()
  luckState.value = updateLuck(luckState.value, settingsStore2.videoModeLuckResetMinutes, settingsStore2.videoModeLuckResetOps)

  if (ctx.changeType !== 'delete') {
    const currentMemory = sessionMemory.get(entityId) || []
    currentMemory.push(content)
    if (currentMemory.length > 10) currentMemory.splice(0, currentMemory.length - 10)
    sessionMemory.set(entityId, currentMemory)
    if (sessionMemory.size > MAX_SESSION_ENTITIES) {
      const oldestKey = sessionMemory.keys().next().value
      if (oldestKey) sessionMemory.delete(oldestKey)
    }
  }

  lastPopupTimes.set(entityId, Date.now())

  const position = settingsStore.videoModePositionContext && ctx.sceneId
    ? getScenePosition(ctx.sceneId)
    : undefined

  const notification: VideoNotificationData = {
    id: crypto.randomUUID(),
    entityId,
    entityName: persona.entityName,
    entityType: persona.entityType,
    content,
    isFarewell: ctx.changeType === 'delete',
    createdAt: Date.now(),
    pinned: false,
    sceneId: ctx.sceneId,
    position,
  }

  notifications.value = [...notifications.value, notification]

  if (!settingsStore.videoModeClickPin || !notification.pinned) {
    const duration = settingsStore.videoModeDuration * 1000
    const timer = setTimeout(() => {
      dismissTimers.delete(notification.id)
      dismissNotification(notification.id)
    }, duration)
    dismissTimers.set(notification.id, timer)
  }
}

function dismissNotification(id: string) {
  const timer = dismissTimers.get(id)
  if (timer) {
    clearTimeout(timer)
    dismissTimers.delete(id)
  }
  notifications.value = notifications.value.filter(n => n.id !== id)
}

function pinNotification(id: string) {
  const idx = notifications.value.findIndex(n => n.id === id)
  if (idx === -1) return
  notifications.value = notifications.value.map(n =>
    n.id === id ? { ...n, pinned: true } : n
  )
  const timer = dismissTimers.get(id)
  if (timer) {
    clearTimeout(timer)
    dismissTimers.delete(id)
  }
}

function unpinNotification(id: string) {
  const idx = notifications.value.findIndex(n => n.id === id)
  if (idx === -1) return
  const notification = notifications.value[idx]
  if (!notification.pinned) return
  notifications.value = notifications.value.map(n =>
    n.id === id ? { ...n, pinned: false } : n
  )
  const settingsStore = useSettingsStore()
  const duration = settingsStore.videoModeDuration * 1000
  const timer = setTimeout(() => {
    dismissTimers.delete(id)
    dismissNotification(id)
  }, duration)
  dismissTimers.set(id, timer)
}

function clearDebounce(entityId: string) {
  const timer = debounceTimers.get(entityId)
  if (timer) {
    clearTimeout(timer)
    debounceTimers.delete(entityId)
  }
}

function processScene(ctx: TriggerContext) {
  const sceneConfig = getSceneConfig(ctx.sceneId)
  if (!sceneConfig) return

  if (ctx.entityId) {
    if (!editStartTimes.has(ctx.entityId)) {
      editStartTimes.set(ctx.entityId, Date.now())
    }
  }

  const method = selectTriggerMethod(sceneConfig)
  applyTriggerMethod(method, ctx, () => triggerVideoModeFromContext(ctx))
}

function onEntityCreate(event: EntityCreateEvent) {
  const ctx = identifySceneFromEntityCreate(event)
  if (!ctx) return
  const entityId = event.entityId
  clearDebounce(entityId)
  editStartTimes.set(entityId, Date.now())
  const settingsStore = useSettingsStore()
  const timer = setTimeout(() => {
    debounceTimers.delete(entityId)
    activeEntityId.value = entityId
    processScene(ctx)
  }, settingsStore.videoModeDebounce * 1000)
  debounceTimers.set(entityId, timer)
}

function onEntityUpdate(event: EntityUpdateEvent) {
  const ctx = identifySceneFromEntityUpdate(event)
  if (!ctx) return
  const entityId = event.entityId
  clearDebounce(entityId)
  const settingsStore = useSettingsStore()
  const timer = setTimeout(() => {
    debounceTimers.delete(entityId)
    activeEntityId.value = entityId
    processScene(ctx)
  }, settingsStore.videoModeDebounce * 1000)
  debounceTimers.set(entityId, timer)
}

function onEntityDelete(event: EntityDeleteEvent) {
  const ctx = identifySceneFromEntityDelete(event)
  if (!ctx) return
  const entityId = event.entityId
  clearDebounce(entityId)
  if (sessionMemory.has(entityId) || activeEntityId.value === entityId) {
    processScene(ctx)
  }
  activeEntityId.value = null
  sessionMemory.delete(entityId)
  editStartTimes.delete(entityId)
  lastPopupTimes.delete(entityId)
  pauseDetectors.get(entityId)?.cancel()
  pauseDetectors.delete(entityId)
  charCountDetectors.delete(entityId)
  inputThrottleTimers.delete(entityId)
  pendingCharCountContexts.delete(entityId)
}

function onFieldChange(event: FieldChangeEvent) {
  const ctx = identifySceneFromFieldChange(event)
  if (!ctx) return
  activeEntityId.value = ctx.entityId
  processScene(ctx)
}

function onRelationCreate(event: RelationCreateEvent) {
  const ctx = identifySceneFromRelationCreate(event)
  if (!ctx) return
  processScene(ctx)
}

function onRelationDelete(event: RelationDeleteEvent) {
  const ctx = identifySceneFromRelationDelete(event)
  if (!ctx) return
  processScene(ctx)
}

function onNameInput(event: NameInputEvent) {
  const entityId = event.entityId
  const now = Date.now()
  const lastTime = inputThrottleTimers.get(entityId) || 0
  if (now - lastTime < 2000) return
  inputThrottleTimers.set(entityId, now)
  const ctx = identifySceneFromNameInput(entityId)
  activeEntityId.value = entityId
  processScene(ctx)
}

function onTextInput(event: TextInputEvent) {
  activeEntityId.value = event.entityId
  const settingsStore = useSettingsStore()
  if (settingsStore.videoModeSentenceTrigger) {
    feedSentenceDetection(event.entityId, event.text, event.field)
  }
  feedCharCount(event.entityId, event.text)
}

function onBatchEdit(event: BatchEditEvent) {
  const ctx = identifySceneFromBatchEdit(event.entityIds)
  if (ctx) processScene(ctx)
}

export function useVideoMode() {
  const personaStore = usePersonaStore()

  if (!initialized) {
    initialized = true
    eventBus.on('entity:create', onEntityCreate)
    eventBus.on('entity:update', onEntityUpdate)
    eventBus.on('entity:delete', onEntityDelete)
    eventBus.on('field:change', onFieldChange)
    eventBus.on('relation:create', onRelationCreate)
    eventBus.on('relation:delete', onRelationDelete)
    eventBus.on('name:input', onNameInput)
    eventBus.on('text:input', onTextInput)
    eventBus.on('batch:edit', onBatchEdit)
  }

  onBeforeUnmount(() => {
    initialized = false
    eventBus.off('entity:create', onEntityCreate)
    eventBus.off('entity:update', onEntityUpdate)
    eventBus.off('entity:delete', onEntityDelete)
    eventBus.off('field:change', onFieldChange)
    eventBus.off('relation:create', onRelationCreate)
    eventBus.off('relation:delete', onRelationDelete)
    eventBus.off('name:input', onNameInput)
    eventBus.off('text:input', onTextInput)
    eventBus.off('batch:edit', onBatchEdit)
    for (const timer of debounceTimers.values()) clearTimeout(timer)
    debounceTimers.clear()
    for (const timer of dismissTimers.values()) clearTimeout(timer)
    dismissTimers.clear()
    for (const detector of pauseDetectors.values()) detector.cancel()
    pauseDetectors.clear()
    charCountDetectors.clear()
    inputThrottleTimers.clear()
    pendingCharCountContexts.clear()
    if (currentAbortController) currentAbortController.abort()
  })

  function resetFailureCount() {
    consecutiveFailures = 0
  }

  function notifyViewSwitch(viewName: string) {
    const ctx = identifySceneFromViewSwitch(viewName)
    processScene(ctx)
  }

  function notifyNameInput(entityId: string) {
    const ctx = identifySceneFromNameInput(entityId)
    processScene(ctx)
  }

  function notifyBatchEdit(entityIds: string[]) {
    const ctx = identifySceneFromBatchEdit(entityIds)
    if (ctx) processScene(ctx)
  }

  function notifyInputText(entityId: string, text: string) {
    const settingsStore = useSettingsStore()
    if (settingsStore.videoModeSentenceTrigger) {
      feedSentenceDetection(entityId, text, 'description')
    }
    feedCharCount(entityId, text)
  }

  return {
    notifications,
    activeEntityId,
    luckState,
    sessionMemory,
    dismissNotification,
    pinNotification,
    unpinNotification,
    resetFailureCount,
    notifyViewSwitch,
    notifyNameInput,
    notifyBatchEdit,
    notifyInputText,
    savedPersonas: personaStore.savedPersonas,
    savePersona: personaStore.addPersona,
    removePersona: personaStore.removePersona,
  }
}
