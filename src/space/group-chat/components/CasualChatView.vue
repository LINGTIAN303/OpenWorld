<template>
  <div class="casual-chat-view">
    <div class="chat-header">
      <div class="header-left">
        <span class="group-avatar">{{ store.groupInfo?.avatar || '👥' }}</span>
        <span class="group-name">{{ store.groupInfo?.name || '群聊' }}</span>
        <span class="member-count">{{ onlineCount }}/{{ store.groupMembers.length }} 在线</span>
      </div>
      <div class="header-right">
        <button class="header-btn" @click="showInfoPanel = !showInfoPanel" title="群信息"><WsIcon name="info" size="xs" /></button>
      </div>
    </div>

    <div class="chat-messages" ref="messagesRef">
      <template v-for="msg in store.casualMessages" :key="msg.id">
        <CasualMessageBubble :msg="msg" :all-messages="store.casualMessages" />
      </template>

      <template v-for="agentId in activeStreamingIds" :key="`streaming-${agentId}`">
        <div class="streaming-msg">
          <div class="msg-header">
            <div class="msg-avatar" :style="{ background: getSpeakerColor(agentId) }">
              <span class="avatar-letter">{{ getSpeakerName(agentId)[0] || '?' }}</span>
            </div>
            <span class="msg-name" :style="{ color: getSpeakerColor(agentId) }">{{ getSpeakerName(agentId) }}</span>
          </div>
          <div class="msg-content">
            <div class="msg-text">
              <div v-html="renderStreamingContent(agentId)"></div>
              <span class="streaming-cursor">●</span>
            </div>
          </div>
        </div>
      </template>

      <div v-if="typingAgentNames.length > 0 && !store.isStreaming" class="typing-hint">
        <span class="typing-dot">●</span>
        {{ typingAgentNames.join('、') }} 正在输入...
      </div>
    </div>

    <CasualInputBar
      :reply-target="replyTarget"
      :mention-query="mentionQuery"
      :members="store.groupMembers"
      :sending="isSending"
      @send="onSend"
      @cancel-reply="replyTarget = null"
      @attach-image="onAttachImage"
      @attach-file="onAttachFile"
      @open-mention="onOpenMention"
      @close-mention="onCloseMention"
      @select-mention="onSelectMention"
    />

    <GroupInfoPanel v-if="showInfoPanel" @close="showInfoPanel = false" @dissolve="onDissolveGroup" />

    <input
      ref="imageInputRef"
      type="file"
      accept="image/*"
      style="display: none"
      @change="onImageSelected"
    />
    <input
      ref="fileInputRef"
      type="file"
      style="display: none"
      @change="onFileSelected"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { useGroupChatStore } from '../GroupChatStore'
import { useAgent } from '../../../agent/composables/useAgent'
import { GroupChatEngine } from '../engine/GroupChatEngine'
import { CasualStrategy } from '../engine/CasualStrategy'
import type { GroupChatMessage, GroupMember } from '../types'
import { saveCasualGroupSession, getCasualGroupSession, deleteCasualGroupSession } from '../GroupSessionManager'
import { useGroupStore } from '../management/GroupStore'
import CasualMessageBubble from './CasualMessageBubble.vue'
import CasualInputBar from './CasualInputBar.vue'
import GroupInfoPanel from './GroupInfoPanel.vue'
import WsIcon from '../../../ui/WsIcon.vue'

const store = useGroupChatStore()
const groupStore = useGroupStore()
const { ensureInitialized, getProviderConfig, getToolContext } = useAgent()
const messagesRef = ref<HTMLDivElement>()
const showInfoPanel = ref(false)
const replyTarget = ref<{ messageId: string; name: string; text: string } | null>(null)
const mentionQuery = ref<string | null>(null)
const imageInputRef = ref<HTMLInputElement>()
const fileInputRef = ref<HTMLInputElement>()
const pendingMentions = ref<string[]>([])

let engine: GroupChatEngine | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
const IDLE_TIMEOUT = 30_000
const MAX_PROACTIVE_PER_SESSION = 3
let proactiveCount = 0
let idleTimer: ReturnType<typeof setTimeout> | null = null
const isSending = ref(false)

watch(() => store.groupInfo?.id, (newId, oldId) => {
  if (newId !== oldId && oldId !== undefined) {
    store.setOfflineBatch(store.groupMembers.map(m => m.id))
    engine?.disposeAgents()
    engine = null
    proactiveCount = 0
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = null
  }
})

const activeStreamingIds = computed(() => Object.keys(store.streamingAgents))

const typingAgentNames = computed(() => {
  return Object.keys(store.typingAgents)
    .map(id => store.groupMembers.find(m => m.id === id)?.name)
    .filter(Boolean) as string[]
})

const onlineCount = computed(() => store.onlineAgentIds.size)

function getSpeakerName(agentId: string): string {
  return store.groupMembers.find(m => m.id === agentId)?.name ?? ''
}

function getSpeakerColor(agentId: string): string {
  return store.groupMembers.find(m => m.id === agentId)?.color ?? '#888'
}

function renderStreamingContent(agentId: string): string {
  const state = store.streamingAgents[agentId]
  if (!state) return ''
  return state.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
}

function buildConversationText(msgs: GroupChatMessage[]): string {
  return msgs.map(m => {
    let content = m.content
    if (m.replyTo) {
      const repliedMsg = msgs.find(r => r.id === m.replyTo)
      if (repliedMsg) {
        content = `[回复 ${repliedMsg.speakerName || '用户'}：${repliedMsg.content.slice(0, 50)}]\n${content}`
      }
    }
    if (m.role === 'system') return `[系统] ${content}`
    if (m.role === 'user') return `[用户] ${content}`
    if (m.speakerName) return `[${m.speakerName}] ${content}`
    return `[助手] ${content}`
  }).join('\n')
}

function updateGroupPreview(): void {
  if (store.groupInfo) {
    const lastMsg = store.casualMessages[store.casualMessages.length - 1]
    if (lastMsg) {
      const preview = lastMsg.content.length > 30
        ? lastMsg.content.slice(0, 30) + '...'
        : lastMsg.content
      groupStore.updateGroupPreview(store.groupInfo.id, preview, lastMsg.timestamp)
    }
  }
}

async function promptAgent(
  eng: GroupChatEngine,
  member: GroupMember,
  context: any,
): Promise<GroupChatMessage | null> {
  const agent = eng.getAgent(member.id)
  if (!agent) return null

  store.setTyping(member.id)

  const strategy = eng.getStrategy() as CasualStrategy
  const preparedMsgs = eng.getPreparedCasualMessages(member.id)
  const systemContent = strategy.buildSystemPrompt(member, context)
  const conversationText = buildConversationText(preparedMsgs)

  const promptText = conversationText
    ? `${conversationText}\n\n请根据以上群聊内容回复：`
    : '请开始群聊对话。'

  let currentContent = ''
  let currentThinking = ''
  let lastError: string | null = null
  let unsub: (() => void) | null = null

  try {
    unsub = agent.subscribe((event: any) => {
      switch (event.type) {
        case 'message_update':
          if (event.content !== undefined) currentContent = event.content
          if (event.thinking !== undefined) currentThinking = event.thinking
          store.clearTyping(member.id)
          store.setStreaming(member.id, currentContent, currentThinking)
          break
        case 'usage':
          if (event.usage) {
            eng.recordUsage(member.id, event.usage)
            store.updateCostTracker(eng.getCostSnapshot())
          }
          break
        case 'error':
          lastError = event.error?.message || String(event.error)
          console.error(`[CasualChat] Agent ${member.name} error:`, lastError)
          store.clearTyping(member.id)
          break
      }
    })

    agent.clearHistory()
    await agent.prompt(promptText, { contextOverride: systemContent })

    store.clearStreaming(member.id)

    if (lastError) {
      console.warn(`[CasualChat] Agent ${member.name} had error, skipping:`, lastError)
      return null
    }

    if (currentContent) {
      return {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: currentContent,
        thinking: currentThinking || undefined,
        type: 'text',
        timestamp: Date.now(),
        speakerId: member.id,
        speakerName: member.name,
        speakerAvatar: member.avatar,
        speakerColor: member.color,
      }
    }
    return null
  } catch {
    store.clearStreaming(member.id)
    store.clearTyping(member.id)
    return null
  } finally {
    unsub?.()
  }
}

async function conversationLoop(
  eng: GroupChatEngine,
  triggerMsg: GroupChatMessage,
  maxChainRounds: number = 5,
): Promise<void> {
  let currentTrigger = triggerMsg
  let chainRound = 0

  while (chainRound < maxChainRounds) {
    const strategy = eng.getStrategy() as CasualStrategy
    const context = eng.buildStrategyContext(
      store.groupInfo?.name,
      chainRound,
      currentTrigger,
      currentTrigger.mentions || [],
    )

    const speakers = strategy.selectSpeakers(
      store.casualMessages,
      store.groupMembers,
      context,
    )

    if (speakers.length === 0) break

    const filteredSpeakers = speakers.filter(
      s => s.id !== currentTrigger.speakerId
    )
    if (filteredSpeakers.length === 0) break

    store.setCurrentSpeakers(filteredSpeakers.map(s => s.id))

    for (const member of filteredSpeakers) {
      const updatedContext = eng.buildStrategyContext(
        store.groupInfo?.name,
        chainRound,
        currentTrigger,
        currentTrigger.mentions || [],
      )
      const agentMsg = await promptAgent(eng, member, updatedContext)
      if (agentMsg) {
        store.addCasualMessage(agentMsg)
        eng.addMessage(agentMsg)
        currentTrigger = agentMsg
      }
    }

    chainRound++
  }

  store.setCurrentSpeakers([])
  updateGroupPreview()
  scheduleSave()
}

function resetIdleTimer(eng: GroupChatEngine | null): void {
  if (idleTimer) clearTimeout(idleTimer)
  if (!eng || proactiveCount >= MAX_PROACTIVE_PER_SESSION) return

  idleTimer = setTimeout(async () => {
    await tryProactiveSpeak(eng)
  }, IDLE_TIMEOUT)
}

async function tryProactiveSpeak(eng: GroupChatEngine): Promise<void> {
  const strategy = eng.getStrategy() as CasualStrategy
  if (!strategy.generateThoughts || !strategy.shouldInitiate) return

  const thoughts = strategy.generateThoughts(
    store.casualMessages,
    store.groupMembers,
  )

  for (const thought of thoughts) {
    const shouldSpeak = strategy.shouldInitiate(thought, store.casualMessages)
    if (shouldSpeak) {
      const member = store.groupMembers.find(m => m.id === thought.agentId)
      if (!member || member.muted) continue

      proactiveCount++
      const lastMsg = store.casualMessages[store.casualMessages.length - 1]
      const context = eng.buildStrategyContext(
        store.groupInfo?.name, 0, lastMsg, [],
      )

      const agentMsg = await promptAgent(eng, member, context)
      if (agentMsg) {
        store.addCasualMessage(agentMsg)
        eng.addMessage(agentMsg)
        updateGroupPreview()
        scheduleSave()
      }
      break
    }
  }

  resetIdleTimer(eng)
}

async function ensureEngine(): Promise<GroupChatEngine | null> {
  if (engine) return engine

  const ok = await ensureInitialized()
  if (!ok) return null

  const providerConfig = getProviderConfig()
  const toolContext = getToolContext()
  if (!providerConfig || !toolContext) return null

  const strategy = new CasualStrategy()
  engine = new GroupChatEngine(strategy)

  if (store.groupMembers.length > 0) {
    await engine.createAgents(store.groupMembers, providerConfig, toolContext)
    store.setOnlineBatch(store.groupMembers.map(m => m.id))

    for (const m of store.groupMembers) {
      const keywords = m.systemPrompt
        ? m.systemPrompt.split(/[,，、\s]+/).filter(w => w.length > 1).slice(0, 10)
        : []
      strategy.registerRoleKeywords(m.id, keywords)
    }
  }

  return engine
}

async function onSend(text: string): Promise<void> {
  if (isSending.value) return
  isSending.value = true

  const userMsg: GroupChatMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    content: text,
    type: 'text',
    timestamp: Date.now(),
    mentions: pendingMentions.value.length > 0 ? [...pendingMentions.value] : undefined,
    replyTo: replyTarget.value?.messageId || undefined,
    speakerId: 'user',
    speakerName: '你',
  }
  store.addCasualMessage(userMsg)
  pendingMentions.value = []

  const eng = await ensureEngine()

  if (eng) {
    eng.addMessage(userMsg)
    await conversationLoop(eng, userMsg)
  }

  replyTarget.value = null
  resetIdleTimer(eng)
  scheduleSave()
  isSending.value = false
}

function onAttachImage(): void {
  imageInputRef.value?.click()
}

function onAttachFile(): void {
  fileInputRef.value?.click()
}

function onImageSelected(e: Event): void {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = async () => {
    if (isSending.value) return
    isSending.value = true

    const dataUrl = reader.result as string
    const msg: GroupChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: file.name,
      type: 'image',
      timestamp: Date.now(),
      imageUrl: dataUrl,
      speakerId: 'user',
      speakerName: '你',
    }
    store.addCasualMessage(msg)
    const eng = await ensureEngine()
    if (eng) {
      eng.addMessage(msg)
      await conversationLoop(eng, msg)
    }
    scheduleSave()
    isSending.value = false
  }
  reader.readAsDataURL(file)
  ;(e.target as HTMLInputElement).value = ''
}

async function onFileSelected(e: Event): Promise<void> {
  if (isSending.value) return
  isSending.value = true

  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) { isSending.value = false; return }

  const url = URL.createObjectURL(file)
  const msg: GroupChatMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    content: file.name,
    type: 'file',
    timestamp: Date.now(),
    fileName: file.name,
    fileUrl: url,
    speakerId: 'user',
    speakerName: '你',
  }
  store.addCasualMessage(msg)
  const eng = await ensureEngine()
  if (eng) {
    eng.addMessage(msg)
    await conversationLoop(eng, msg)
  }
  scheduleSave()
  ;(e.target as HTMLInputElement).value = ''
  isSending.value = false
}

function onOpenMention(): void {
  mentionQuery.value = ''
}

function onCloseMention(): void {
  mentionQuery.value = null
}

function onSelectMention(member: GroupMember): void {
  pendingMentions.value = [...pendingMentions.value, member.id]
  mentionQuery.value = null
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => saveCurrentSession(), 1000)
}

async function onDissolveGroup(): Promise<void> {
  if (!store.groupInfo) return
  const groupId = store.groupInfo.id
  store.setOfflineBatch(store.groupMembers.map(m => m.id))
  store.clearTyping()
  engine?.disposeAgents()
  engine = null
  store.reset()
  groupStore.removeGroup(groupId)
  await deleteCasualGroupSession(groupId)
  showInfoPanel.value = false
}

async function saveCurrentSession(): Promise<void> {
  if (!store.groupInfo) return
  await saveCasualGroupSession({
    info: { ...store.groupInfo, updatedAt: Date.now() },
    members: [...store.groupMembers],
    messages: [...store.casualMessages],
    desireConfig: { ...store.desireConfig },
    costTracker: { ...store.costTracker },
  })
}

async function loadSession(groupId: string): Promise<void> {
  const session = await getCasualGroupSession(groupId)
  if (!session) return
  store.setGroupInfo(session.info)
  store.setGroupMembers(session.members)
  store.setDesireConfig(session.desireConfig)
  for (const msg of session.messages) {
    store.addCasualMessage(msg)
  }
}

function scrollToBottom(): void {
  const el = messagesRef.value
  if (el) el.scrollTop = el.scrollHeight
}

watch(() => store.casualMessages.length, () => {
  nextTick(scrollToBottom)
})

watch(() => store.streamingAgents, () => {
  nextTick(scrollToBottom)
}, { deep: true })

onBeforeUnmount(() => {
  store.setOfflineBatch(store.groupMembers.map(m => m.id))
  store.clearTyping()
  engine?.disposeAgents()
  engine = null
  if (saveTimer) clearTimeout(saveTimer)
  if (idleTimer) clearTimeout(idleTimer)
  saveCurrentSession()
})
</script>

<style scoped>
.casual-chat-view { display: flex; flex-direction: column; height: 100%; }

.chat-header { padding: 8px 16px; border-bottom: 1px solid var(--color-border); display: flex; align-items: center; justify-content: space-between; }
.header-left { display: flex; align-items: center; gap: 8px; }
.group-avatar { font-size: 20px; }
.group-name { font-size: 14px; font-weight: 600; }
.member-count { font-size: 11px; color: var(--color-text-tertiary); }
.header-btn { width: 28px; height: 28px; border: none; background: transparent; border-radius: 6px; cursor: pointer; font-size: 14px; }
.header-btn:hover { background: var(--color-surface); }

.chat-messages { flex: 1; overflow-y: auto; padding: 8px 0; }

.streaming-msg { padding: 4px 16px; margin-bottom: 2px; }
.streaming-msg .msg-header { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
.streaming-msg .msg-avatar { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.streaming-msg .avatar-letter { color: white; font-weight: 700; font-size: 11px; }
.streaming-msg .msg-name { font-size: 12px; font-weight: 600; }
.streaming-msg .msg-content { margin-left: 36px; max-width: 75%; }
.streaming-msg .msg-text { padding: 8px 12px; background: var(--color-surface-elevated); border-radius: 2px 12px 12px 12px; font-size: 13px; line-height: 1.5; box-shadow: 0 1px 2px rgba(0,0,0,0.06); }
.streaming-cursor { color: var(--color-primary); animation: pulse 1s infinite; font-size: 10px; margin-left: 2px; }

.typing-hint { padding: 6px 16px; font-size: 11px; color: var(--color-text-tertiary); display: flex; align-items: center; gap: 4px; }
.typing-dot { color: var(--color-primary); animation: pulse 1.5s infinite; font-size: 8px; }

@keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
</style>
