<template>
  <div class="chat-messages" ref="messagesContainer">
    <div class="messages-scroll">
    <div v-if="messages.length === 0" class="chat-empty">
      <div class="empty-icon"><WsIcon name="profile" size="lg" /></div>
      <div class="empty-title">WorldSmith 助手</div>
      <div class="empty-hint">我可以帮你管理世界观实体和关系。试试输入 / 查看可用命令</div>
    </div>
    <A2UIRenderer
      v-if="hasA2UISurfaces"
      :surfaces="a2uiSurfaces"
      :resolve-binding="resolveDataBinding"
      @action="onA2UIAction"
    />
    <AgentMessageBubble
      v-for="item in displayItems"
      :key="item.type === 'divider' ? 'div-' + item.dividerText : item.msg!.id"
      :is-divider="item.type === 'divider'"
      :divider-text="item.dividerText"
      :msg="item.msg"
      :is-hovered="item.type === 'message' && hoveredMsgId === item.msg!.id"
      @hover="item.type === 'message' && (hoveredMsgId = $event)"
      @leave="hoveredMsgId = ''"
      @copy="item.type === 'message' && emit('copy', $event)"
      @retry="item.type === 'message' && emit('retry', $event)"
      @block-action="emit('block-action', $event)"
    />
    <div v-if="isStreaming && !lastAssistantHasContent && !lastAssistantHasThinking" class="chat-msg msg-assistant">
      <span class="msg-icon"><WsIcon name="profile" size="xs" /></span>
      <div class="msg-body">
        <span class="streaming-cursor" :class="`cursor-${enterAnimation}`">●</span>
      </div>
    </div>
    <div v-if="isStreaming && lastAssistantHasThinking && !lastAssistantHasContent" class="streaming-thinking-hint">
      <WsIcon name="manuscript" size="xs" /> 思考中<span class="thinking-dots">{{ dotText }}</span>
    </div>
    </div>
    <div v-if="userMessages.length" class="dot-nav">
      <div
        v-for="um in userMessages"
        :key="um.id"
        class="dot-item"
        role="button"
        tabindex="0"
        @mouseenter="hoveredDot = um.id"
        @mouseleave="hoveredDot = ''"
        @click="scrollToMessage(um.id)"
        @keydown.enter="scrollToMessage(um.id)"
      >
        <div class="dot-point" :class="{ active: visibleMsgIds.has(um.id) }"></div>
        <Transition name="ws-fade">
          <div v-if="hoveredDot === um.id" class="dot-tooltip">
            {{ truncateText(um.content, 50) }}
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import WsIcon from '../ui/WsIcon.vue'
import AgentMessageBubble from './AgentMessageBubble.vue'
import A2UIRenderer from './a2ui/A2UIRenderer.vue'
import { usePersonaFont } from '../space/composables/usePersonaFont'
const { enterAnimation } = usePersonaFont()

const props = defineProps<{
  messages: Array<{
    id: string
    role: 'user' | 'assistant'
    content: string
    thinking?: string
    images?: { mimeType: string; data: string }[]
    toolCalls?: { id: string; name: string; args: any; result?: string; status?: string }[]
    blocks?: import('@agent/index').MessageBlock[]
    timestamp: number
  }>
  isStreaming: boolean
  lastAssistantHasContent: boolean
  lastAssistantHasThinking: boolean
  a2uiSurfaces: Record<string, any>
  resolveDataBinding: (binding: string) => any
}>()

const emit = defineEmits<{
  'a2ui-action': [surfaceId: string, action: { name: string; data?: any }]
  'block-action': [event: { blockId: string; action: string; data?: Record<string, unknown> }]
  copy: [msg: any]
  retry: [msg: any]
}>()

const hoveredMsgId = ref('')
const dotText = ref('')
const messagesContainer = ref<HTMLDivElement>()
const hoveredDot = ref('')
const visibleMsgIds = ref<Set<string>>(new Set())

const userMessages = computed(() => props.messages.filter(m => m.role === 'user'))

function truncateText(text: string, maxLen: number): string {
  if (!text) return ''
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text
}

function scrollToMessage(id: string): void {
  const container = messagesContainer.value
  if (!container) return
  const el = container.querySelector(`[data-msg-id="${id}"]`) as HTMLElement | null
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

let scrollObserver: IntersectionObserver | null = null

function setupScrollObserver(): void {
  if (scrollObserver) scrollObserver.disconnect()
  const container = messagesContainer.value
  if (!container) return
  const scrollRoot = container.querySelector('.messages-scroll') as HTMLElement || container
  scrollObserver = new IntersectionObserver(
    (entries) => {
      const next = new Set(visibleMsgIds.value)
      for (const entry of entries) {
        const msgId = (entry.target as HTMLElement).dataset?.msgId
        if (msgId) {
          if (entry.isIntersecting) next.add(msgId)
          else next.delete(msgId)
        }
      }
      visibleMsgIds.value = next
    },
    { root: scrollRoot, threshold: 0.5 }
  )
  for (const el of scrollRoot.querySelectorAll('[data-msg-id]')) {
    scrollObserver.observe(el)
  }
}

watch(() => props.messages, () => {
  nextTick(() => {
    setupScrollObserver()
  })
}, { deep: true })

onMounted(() => {
  nextTick(setupScrollObserver)
})

onBeforeUnmount(() => {
  if (scrollObserver) scrollObserver.disconnect()
})

interface DisplayItem {
  type: 'message' | 'divider'
  msg?: any
  dividerText?: string
}

function formatDividerTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const isToday = d.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = d.toDateString() === yesterday.toDateString()
  if (isToday) return `今天 ${time}`
  if (isYesterday) return `昨天 ${time}`
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${time}`
}

const displayItems = computed(() => {
  const items: DisplayItem[] = []
  const THIRTY_MIN = 30 * 60 * 1000
  for (let i = 0; i < props.messages.length; i++) {
    const msg = props.messages[i]
    if (i === 0 || msg.timestamp - props.messages[i - 1].timestamp > THIRTY_MIN) {
      items.push({ type: 'divider', dividerText: formatDividerTime(msg.timestamp) })
    }
    items.push({ type: 'message', msg })
  }
  return items
})

const hasA2UISurfaces = computed(() => Object.keys(props.a2uiSurfaces).length > 0)

function scrollToBottom(): void {
  const c = messagesContainer.value
  if (c) {
    const scroll = c.querySelector('.messages-scroll') as HTMLElement | null
    if (scroll) scroll.scrollTop = scroll.scrollHeight
  }
}

let dotTimer: ReturnType<typeof setInterval> | null = null

function startDotAnimation(): void {
  stopDotAnimation()
  let count = 0
  dotTimer = setInterval(() => {
    count = (count + 1) % 4
    dotText.value = '.'.repeat(count)
  }, 400)
}

function stopDotAnimation(): void {
  if (dotTimer) { clearInterval(dotTimer); dotTimer = null }
  dotText.value = ''
}

let scrollTimer: ReturnType<typeof setTimeout> | null = null

watch(() => props.messages, () => {
  if (scrollTimer) clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => nextTick(scrollToBottom), 50)
}, { deep: true })

watch(() => props.a2uiSurfaces, () => {
  if (scrollTimer) clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => nextTick(scrollToBottom), 50)
}, { deep: true })

watch(() => props.isStreaming, (val) => {
  if (val) startDotAnimation()
  else stopDotAnimation()
})

function onA2UIAction(surfaceId: string, action: { name: string; data?: any }): void {
  emit('a2ui-action', surfaceId, action)
}

defineExpose({
  scrollToBottom,
  messagesContainer
})
</script>

<style scoped>
.chat-messages {
  flex: 1;
  overflow: hidden;
  padding: 0;
  display: flex;
  flex-direction: row;
  position: relative;
  min-height: 0;
}

.messages-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  scrollbar-width: none;
  min-height: 0;
}

.messages-scroll::-webkit-scrollbar {
  display: none;
}

.chat-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
}

.empty-icon { font-size: var(--icon-xl); margin-bottom: 12px }
.empty-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--agent-text, #e0e0e0);
  margin-bottom: 8px;
  font-family: var(--agent-font, sans-serif);
}
.empty-hint {
  font-size: var(--font-size-sm);
  color: var(--agent-text-secondary, #888);
  line-height: 1.5;
  font-family: var(--agent-font, sans-serif);
}

.chat-msg {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  max-width: 85%;
  animation: ws-msg-in 0.2s ease;
}

.msg-assistant { align-self: flex-start }

.msg-icon {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-size-sm);
  border-radius: 50%;
  background: var(--agent-hover-bg, rgba(255,255,255,0.06));
}

.msg-body {
  font-size: var(--font-size-base);
  line-height: 1.6;
  color: var(--agent-text, #e0e0e0);
  word-break: break-word;
  position: relative;
  font-family: var(--agent-font, sans-serif);
  background: transparent;
}

.streaming-cursor {
  animation: ws-blink 0.8s step-end infinite;
  color: var(--agent-primary, #6c5ce7);
  font-size: 10px;
}

.streaming-cursor.cursor-fadeIn { animation: ws-cursor-fade 1s ease-in-out infinite }
.streaming-cursor.cursor-slideIn { animation: ws-cursor-slide 1s ease-in-out infinite }
.streaming-cursor.cursor-typewriter { animation: ws-cursor-blink 0.8s step-end infinite }
.streaming-cursor.cursor-pulse { animation: ws-cursor-pulse 1.5s ease-in-out infinite }
.streaming-cursor.cursor-bounce { animation: ws-cursor-bounce 1s cubic-bezier(0.34, 1.56, 0.64, 1) infinite }
.streaming-cursor.cursor-wave { animation: ws-cursor-wave 1.2s ease-in-out infinite }

@keyframes ws-cursor-fade { 0%, 100% { opacity: 0.2 } 50% { opacity: 1 } }
@keyframes ws-cursor-slide { 0%, 100% { transform: translateY(0); opacity: 0.3 } 50% { transform: translateY(-3px); opacity: 1 } }
@keyframes ws-cursor-blink { 0%, 100% { opacity: 1 } 50% { opacity: 0 } }
@keyframes ws-cursor-pulse { 0%, 100% { transform: scale(1); opacity: 0.5 } 50% { transform: scale(1.3); opacity: 1 } }
@keyframes ws-cursor-bounce { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-4px) } }
@keyframes ws-cursor-wave { 0%, 100% { transform: translateX(0) } 25% { transform: translateX(2px) } 75% { transform: translateX(-2px) } }

.streaming-thinking-hint {
  font-size: var(--font-size-sm);
  color: var(--agent-text-secondary, #888);
  padding: 4px 0;
  font-family: var(--agent-font, sans-serif);
}

.thinking-dots {
  display: inline-block;
  min-width: 12px;
}

.dot-nav {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px 4px;
  flex-shrink: 0;
  overflow-y: auto;
  scrollbar-width: none;
  max-height: 60%;
  z-index: 5;
}

.dot-nav::-webkit-scrollbar {
  display: none;
}

.dot-item {
  position: relative;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.dot-point {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--agent-text-tertiary, #444);
  transition: background 0.15s, transform 0.15s;
}

.dot-point.active {
  background: var(--agent-primary, #6c5ce7);
  transform: scale(1.3);
}

.dot-item:hover .dot-point {
  background: var(--agent-text-secondary, #888);
  transform: scale(1.2);
}

.dot-tooltip {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  background: var(--agent-bg, rgba(26, 26, 46, 0.92));
  border: 1px solid var(--agent-border, rgba(58, 58, 106, 0.4));
  border-radius: 6px;
  padding: 4px 8px;
  font-size: var(--font-size-xs);
  color: var(--agent-text, #e0e0e0);
  white-space: nowrap;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  font-family: var(--agent-font, sans-serif);
}


</style>
