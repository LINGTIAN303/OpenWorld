<template>
  <div class="session-sidebar">
    <div class="sidebar-header">
      <h3 class="sidebar-title">群聊</h3>
      <button class="new-session-btn" @click="onNewSession" title="新建群聊">+</button>
      <button class="sidebar-close-btn" @click="emit('close')" title="关闭">✕</button>
    </div>

    <div class="sidebar-search">
      <input
        v-model="searchQuery"
        class="search-input"
        placeholder="搜索群聊..."
      />
    </div>

    <div class="sidebar-body">
      <div v-if="loading" class="sidebar-empty">加载中...</div>
      <div v-else-if="filteredSessions.length === 0" class="sidebar-empty">
        {{ searchQuery ? '未找到匹配的群聊' : '暂无群聊' }}
      </div>

      <div v-if="pinnedSessions.length > 0" class="session-group">
        <div class="group-label">已固定</div>
        <div
          v-for="s in pinnedSessions"
          :key="s.id"
          class="session-item"
          :class="{ active: s.id === currentId }"
          @click="onSelect(s.id)"
          @contextmenu.prevent="onContextMenu($event, s)"
        >
          <div class="session-name">{{ s.name }}</div>
          <div class="session-meta">
            <span class="session-state">{{ stateLabel(s.state) }}</span>
            <span class="session-count">{{ s.participants.length }}人 · {{ s.messages.length }}条</span>
          </div>
        </div>
      </div>

      <div v-if="recentSessions.length > 0" class="session-group">
        <div class="group-label">{{ pinnedSessions.length > 0 ? '近期' : '' }}</div>
        <div
          v-for="s in recentSessions"
          :key="s.id"
          class="session-item"
          :class="{ active: s.id === currentId }"
          @click="onSelect(s.id)"
          @contextmenu.prevent="onContextMenu($event, s)"
        >
          <div class="session-name">{{ s.name }}</div>
          <div class="session-meta">
            <span class="session-state">{{ stateLabel(s.state) }}</span>
            <span class="session-count">{{ s.participants.length }}人 · {{ s.messages.length }}条</span>
          </div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="contextMenu.visible"
        class="session-ctx-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @click="contextMenu.visible = false"
      >
        <button v-if="!contextMenu.pinned" class="ctx-item" @click="onPin">固定</button>
        <button v-else class="ctx-item" @click="onUnpin">取消固定</button>
        <button class="ctx-item ctx-danger" @click="onDelete">删除</button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import {
  listGroupSessions,
  getGroupSession,
  deleteGroupSession,
  pinGroupSession,
  unpinGroupSession,
} from '../GroupSessionManager'
import type { GroupSession, GroupChatState } from '../types'
import { useGroupChatStore } from '../GroupChatStore'

const emit = defineEmits<{ close: [] }>()

const store = useGroupChatStore()

const loading = ref(true)
const sessions = ref<GroupSession[]>([])
const searchQuery = ref('')

const currentId = computed(() => store.currentSessionId)

const contextMenu = ref<{ visible: boolean; x: number; y: number; sessionId: string; pinned: boolean }>({
  visible: false, x: 0, y: 0, sessionId: '', pinned: false,
})

const filteredSessions = computed(() => {
  if (!searchQuery.value) return sessions.value
  const q = searchQuery.value.toLowerCase()
  return sessions.value.filter(s => s.name.toLowerCase().includes(q))
})

const pinnedSessions = computed(() => filteredSessions.value.filter(s => s.pinned))
const recentSessions = computed(() => filteredSessions.value.filter(s => !s.pinned))

function stateLabel(state: GroupChatState): string {
  switch (state) {
    case 'running': return '进行中'
    case 'paused': return '暂停'
    case 'completed': return '已完成'
    case 'terminated': return '已终止'
    case 'idle': return ''
    default: return ''
  }
}

async function refresh() {
  try {
    sessions.value = await listGroupSessions()
  } catch {}
  loading.value = false
}

function onNewSession() {
  store.reset()
}

async function onSelect(id: string) {
  const session = await getGroupSession(id)
  if (session) {
    store.loadSession(session)
    await refresh()
  }
}

function onContextMenu(e: MouseEvent, s: GroupSession) {
  const menuW = 160
  const menuH = 80
  const x = e.clientX + menuW > window.innerWidth ? e.clientX - menuW : e.clientX
  const y = e.clientY + menuH > window.innerHeight ? e.clientY - menuH : e.clientY
  contextMenu.value = {
    visible: true,
    x,
    y,
    sessionId: s.id,
    pinned: !!s.pinned,
  }
}

async function onPin() {
  await pinGroupSession(contextMenu.value.sessionId)
  await refresh()
}

async function onUnpin() {
  await unpinGroupSession(contextMenu.value.sessionId)
  await refresh()
}

async function onDelete() {
  const id = contextMenu.value.sessionId
  if (id === currentId.value) {
    store.reset()
  }
  await deleteGroupSession(id)
  await refresh()
}

function onClickOutside() {
  contextMenu.value.visible = false
}

onMounted(() => {
  refresh()
  document.addEventListener('click', onClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside)
})

watch(currentId, () => {
  refresh()
})
</script>

<style scoped>
.session-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: rgba(10, 10, 20, 0.08);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-right: 1px solid var(--color-border);
}

.sidebar-header {
  display: flex;
  align-items: center;
  padding: 12px 14px;
  border-bottom: 1px solid var(--color-border);
  gap: 8px;
}

.sidebar-title {
  font-size: var(--font-size-sm);
  font-weight: 600;
  margin: 0;
  flex: 1;
}

.new-session-btn {
  width: 28px;
  height: 28px;
  border: 1px dashed var(--color-border);
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  font-size: var(--font-size-lg);
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.new-session-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-muted);
}

.sidebar-close-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
}
.sidebar-close-btn:hover {
  background: var(--color-surface-elevated);
  color: var(--color-text);
}

.sidebar-search {
  padding: 8px 14px;
}

.search-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: var(--font-size-xs);
  background: var(--color-surface-elevated);
  color: var(--color-text);
}
.search-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.sidebar-body {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px;
}

.sidebar-empty {
  text-align: center;
  color: var(--color-text-tertiary);
  padding: 24px;
  font-size: var(--font-size-xs);
}

.session-group {
  margin-bottom: 8px;
}

.group-label {
  font-size: var(--font-size-2xs);
  font-weight: 600;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 6px 8px 4px;
}

.session-item {
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 2px;
  transition: background 0.15s;
}
.session-item:hover {
  background: var(--color-surface-elevated);
}
.session-item.active {
  background: var(--color-primary-muted);
}

.session-name {
  font-size: var(--font-size-xs);
  font-weight: 500;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-meta {
  display: flex;
  gap: 8px;
  margin-top: 3px;
  font-size: var(--font-size-2xs);
  color: var(--color-text-tertiary);
}

.session-count {
  margin-left: auto;
}

.session-state {
}
</style>

<style>
.session-ctx-menu {
  position: fixed;
  z-index: 9999;
  min-width: 140px;
  background: var(--color-surface-elevated);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  padding: 4px;
}

.session-ctx-menu .ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 12px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  font-size: var(--font-size-xs);
  color: var(--color-text);
  transition: background 0.1s;
}
.session-ctx-menu .ctx-item:hover {
  background: var(--color-surface);
}
.session-ctx-menu .ctx-danger {
  color: var(--color-danger, #e53e3e);
}
.session-ctx-menu .ctx-danger:hover {
  background: var(--color-danger, #e53e3e);
  color: #fff;
}
</style>
