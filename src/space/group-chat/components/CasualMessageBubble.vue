<template>
  <div class="casual-msg" :class="{ 'is-user': msg.role === 'user', 'is-system': msg.role === 'system' }">
    <template v-if="msg.role === 'system'">
      <div class="system-text">{{ msg.content }}</div>
    </template>
    <template v-else-if="msg.role === 'user'">
      <div class="user-row">
        <div class="user-bubble-wrap">
          <div v-if="replyPreview" class="reply-preview" :style="{ borderLeftColor: replyPreview.color }">
            <span class="reply-name" :style="{ color: replyPreview.color }">{{ replyPreview.name }}</span>
            <span class="reply-text">{{ replyPreview.text }}</span>
          </div>
          <div v-if="msg.type === 'image' && msg.imageUrl" class="msg-image">
            <img :src="msg.imageUrl" :alt="msg.content" loading="lazy" />
          </div>
          <div v-else-if="msg.type === 'file' && msg.fileName" class="msg-file">
            <span class="file-icon">📎</span>
            <div class="file-info">
              <span class="file-name">{{ msg.fileName }}</span>
            </div>
          </div>
          <div v-else class="msg-text user-text" v-html="renderContent(msg.content)"></div>
          <span class="msg-time user-time">{{ formatTime(msg.timestamp) }}</span>
        </div>
        <div class="msg-avatar user-avatar">
          <span class="avatar-letter">你</span>
        </div>
      </div>
    </template>
    <template v-else>
      <div class="agent-row">
        <div class="msg-avatar" :style="{ background: msg.speakerColor || '#888' }">
          <span class="avatar-letter">{{ (msg.speakerName || '?')[0] }}</span>
        </div>
        <div class="agent-bubble-wrap">
          <span class="msg-name" :style="{ color: msg.speakerColor }">{{ msg.speakerName || '助手' }}</span>
          <div v-if="replyPreview" class="reply-preview" :style="{ borderLeftColor: replyPreview.color }">
            <span class="reply-name" :style="{ color: replyPreview.color }">{{ replyPreview.name }}</span>
            <span class="reply-text">{{ replyPreview.text }}</span>
          </div>
          <div v-if="msg.type === 'image' && msg.imageUrl" class="msg-image">
            <img :src="msg.imageUrl" :alt="msg.content" loading="lazy" />
          </div>
          <div v-else-if="msg.type === 'file' && msg.fileName" class="msg-file">
            <span class="file-icon">📎</span>
            <div class="file-info">
              <span class="file-name">{{ msg.fileName }}</span>
            </div>
          </div>
          <div v-else class="msg-text agent-text" v-html="renderContent(msg.content)"></div>
          <span class="msg-time agent-time">{{ formatTime(msg.timestamp) }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { GroupChatMessage } from '../types'

const props = defineProps<{
  msg: GroupChatMessage
  allMessages?: GroupChatMessage[]
}>()

const replyPreview = computed(() => {
  if (!props.msg.replyTo || !props.allMessages) return null
  const replied = props.allMessages.find(m => m.id === props.msg.replyTo)
  if (!replied) return null
  return {
    name: replied.speakerName || '用户',
    color: replied.speakerColor || '#888',
    text: replied.content.slice(0, 60) + (replied.content.length > 60 ? '...' : ''),
  }
})

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function renderContent(content: string): string {
  return content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/@(\S+)/g, '<span class="mention">@$1</span>')
    .replace(/\n/g, '<br>')
}
</script>

<style scoped>
.casual-msg { padding: 4px 16px; margin-bottom: 2px; }
.casual-msg.is-system { text-align: center; padding: 4px 16px; }
.system-text { font-size: 11px; color: var(--color-text-tertiary); }

.agent-row { display: flex; gap: 8px; align-items: flex-start; }
.agent-bubble-wrap { max-width: 75%; display: flex; flex-direction: column; }
.msg-name { font-size: 12px; font-weight: 600; margin-bottom: 2px; }
.agent-text { padding: 8px 12px; background: var(--color-surface-elevated); border-radius: 2px 12px 12px 12px; font-size: 13px; line-height: 1.5; word-break: break-word; box-shadow: 0 1px 2px rgba(0,0,0,0.06); }

.user-row { display: flex; gap: 8px; align-items: flex-start; justify-content: flex-end; }
.user-bubble-wrap { max-width: 75%; display: flex; flex-direction: column; align-items: flex-end; }
.user-avatar { background: linear-gradient(135deg, #10b981, #34d399) !important; }
.user-text { padding: 8px 12px; background: rgba(108,92,231,0.12); border-radius: 12px 2px 12px 12px; font-size: 13px; line-height: 1.5; word-break: break-word; box-shadow: 0 1px 2px rgba(0,0,0,0.06); }

.msg-avatar { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.avatar-letter { color: white; font-weight: 700; font-size: 11px; }
.msg-time { font-size: 10px; color: var(--color-text-tertiary); }
.user-time { margin-top: 2px; }
.agent-time { margin-top: 2px; }

.reply-preview { font-size: 11px; color: var(--color-text-tertiary); padding: 4px 6px; background: rgba(0,0,0,0.05); border-radius: 4px; border-left: 2px solid var(--color-border); margin-bottom: 4px; }
.reply-name { font-weight: 600; margin-right: 4px; }

.msg-image img { max-width: 240px; max-height: 180px; border-radius: 8px; cursor: pointer; }
.msg-file { display: flex; align-items: center; gap: 8px; padding: 8px; background: var(--color-surface); border-radius: 8px; }
.file-icon { font-size: 18px; }
.file-info { display: flex; flex-direction: column; }
.file-name { font-size: 12px; font-weight: 500; }

.mention { color: #3b82f6; cursor: pointer; font-weight: 500; }
</style>
