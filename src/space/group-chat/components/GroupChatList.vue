<template>
  <div class="group-chat-list">
    <div class="list-header">
      <input class="search-input" v-model="searchQuery" placeholder="搜索群聊..." />
      <button class="new-btn" @click="showCreateDialog = true">＋ 新群</button>
    </div>

    <div class="mode-tabs">
      <button class="mode-tab" :class="{ active: modeFilter === 'all' }" @click="modeFilter = 'all'">全部</button>
      <button class="mode-tab" :class="{ active: modeFilter === 'casual' }" @click="modeFilter = 'casual'"><WsIcon name="coffee" size="xs" /></button>
      <button class="mode-tab" :class="{ active: modeFilter === 'meeting' }" @click="modeFilter = 'meeting'"><WsIcon name="clipboard-list" size="xs" /></button>
    </div>

    <div class="list-body">
      <div
        v-for="group in filteredGroups"
        :key="group.id"
        class="group-item"
        :class="{ active: group.id === activeGroupId }"
        @click="onSelect(group)"
        @contextmenu.prevent="openGroupContextMenu($event, group.id)"
      >
        <div class="group-avatar">{{ group.avatar }}</div>
        <div class="group-info">
          <div class="group-top">
            <span class="group-name">{{ group.name }}</span>
            <span class="group-time">{{ formatTime(group.lastMessageAt) }}</span>
          </div>
          <div class="group-bottom">
            <span class="group-mode"><WsIcon :name="group.mode === 'casual' ? 'coffee' : 'clipboard-list'" size="xs" /></span>
            <span class="group-preview">{{ group.lastMessage }}</span>
            <span v-if="group.unreadCount > 0" class="unread-badge">{{ group.unreadCount }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="groupContextMenu.visible" class="context-menu" :style="groupContextMenuStyle" @click.stop>
      <div class="context-menu-item" @click="onTogglePinGroup(groupContextMenu.groupId!)">
        {{ groupContextMenu.pinned ? '取消置顶' : '置顶' }}
      </div>
      <div class="context-menu-item danger" @click="onDeleteGroup(groupContextMenu.groupId!)">删除</div>
    </div>

    <CollapsibleSection title="Agent" :badge="String(agentRegistry.agents.length)" :default-open="true">
      <template #header-actions>
        <button class="agent-add-btn" @click="showCreateAgentDialog = true">＋</button>
      </template>
      <div class="agent-list-inner">
        <div
          v-for="agent in agentRegistry.agents"
          :key="agent.id"
          class="agent-item"
          @click="onEditAgent(agent)"
          @contextmenu.prevent="onAgentContextMenu(agent.id)"
        >
          <div class="agent-avatar" :style="{ background: agent.color }">{{ agent.avatar }}</div>
          <div class="agent-info">
            <span class="agent-name">{{ agent.name }}</span>
            <span class="agent-role">{{ agent.role }}</span>
          </div>
          <span class="agent-source"><WsIcon :name="agent.sourceType === 'entity' ? 'landmark' : 'pencil'" size="xs" /></span>
        </div>
        <div v-if="agentRegistry.agents.length === 0" class="agent-empty">暂无 Agent，点击 + 创建</div>
      </div>
    </CollapsibleSection>

    <CreateGroupDialog
      v-if="showCreateDialog"
      :available-agents="availableAgents"
      @close="showCreateDialog = false"
      @created="onGroupCreated"
    />

    <CreateAgentDialog
      v-if="showCreateAgentDialog"
      @close="showCreateAgentDialog = false"
      @created="onAgentCreated"
      @updated="onAgentUpdated"
    />

    <CreateAgentDialog
      v-if="showEditAgentDialog && editingAgent"
      :agent="editingAgent"
      @close="showEditAgentDialog = false; editingAgent = null"
      @updated="onAgentUpdated"
    />

    <div v-if="deleteConfirmId" class="delete-confirm-overlay" @click.self="deleteConfirmId = null">
      <div class="delete-confirm-dialog">
        <div class="delete-confirm-text">确定删除此 Agent？已有群中的成员不受影响。</div>
        <div class="delete-confirm-actions">
          <button class="delete-cancel-btn" @click="deleteConfirmId = null">取消</button>
          <button class="delete-confirm-btn" @click="confirmDeleteAgent">删除</button>
        </div>
      </div>
    </div>

    <div v-if="deleteConfirmGroupId" class="delete-confirm-overlay" @click.self="deleteConfirmGroupId = null">
      <div class="delete-confirm-dialog">
        <div class="delete-confirm-text">确定删除此群聊及其所有消息？此操作无法撤销。</div>
        <div class="delete-confirm-actions">
          <button class="delete-cancel-btn" @click="deleteConfirmGroupId = null">取消</button>
          <button class="delete-confirm-btn" @click="confirmDeleteGroup">删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useGroupStore } from '../management/GroupStore'
import { useGroupChatStore } from '../GroupChatStore'
import { useAgentRegistryStore } from '../management/AgentRegistryStore'
import { useSpaceStore } from '../../stores/space-store'
import { getAllGroupSessions, getGroupSession, getCasualGroupSession, deleteGroupSession, deleteCasualGroupSession } from '../GroupSessionManager'
import type { GroupChatMode, ChatAgent } from '../types'
import CreateGroupDialog, { type AgentItem, type CreateGroupData } from './CreateGroupDialog.vue'
import CreateAgentDialog from './CreateAgentDialog.vue'
import CollapsibleSection from './CollapsibleSection.vue'
import WsIcon from '../../../ui/WsIcon.vue'

defineProps<{}>()

const emit = defineEmits<{
  'select-group': [payload: { id: string; mode: GroupChatMode }]
  'create-group': [data: CreateGroupData]
}>()

const groupStore = useGroupStore()
const groupChatStore = useGroupChatStore()
const spaceStore = useSpaceStore()
const agentRegistry = useAgentRegistryStore()
const searchQuery = ref('')
const modeFilter = ref<'all' | 'casual' | 'meeting'>('all')
const showCreateDialog = ref(false)
const showCreateAgentDialog = ref(false)
const showEditAgentDialog = ref(false)
const editingAgent = ref<ChatAgent | null>(null)
const deleteConfirmId = ref<string | null>(null)
const deleteConfirmGroupId = ref<string | null>(null)

interface GroupContextMenu {
  visible: boolean
  groupId: string | null
  pinned: boolean
  x: number
  y: number
}
const groupContextMenu = ref<GroupContextMenu>({
  visible: false,
  groupId: null,
  pinned: false,
  x: 0,
  y: 0,
})
const groupContextMenuStyle = computed(() => ({
  position: 'fixed' as const,
  left: `${groupContextMenu.value.x}px`,
  top: `${groupContextMenu.value.y}px`,
  zIndex: 10000,
}))

function openGroupContextMenu(event: MouseEvent, groupId: string): void {
  const group = groupStore.groups.find(g => g.id === groupId)
  if (!group) return
  const menuWidth = 140
  const menuHeight = 80
  const maxX = window.innerWidth - menuWidth
  const maxY = window.innerHeight - menuHeight
  groupContextMenu.value = {
    visible: true,
    groupId,
    pinned: group.pinned,
    x: Math.min(event.clientX, maxX),
    y: Math.min(event.clientY, maxY),
  }
}
function closeGroupContextMenu(): void {
  groupContextMenu.value.visible = false
  groupContextMenu.value.groupId = null
}
function onTogglePinGroup(groupId: string): void {
  const group = groupStore.groups.find(g => g.id === groupId)
  if (!group) return
  if (group.pinned) {
    groupStore.unpinGroup(groupId)
  } else {
    groupStore.pinGroup(groupId)
  }
  closeGroupContextMenu()
}
function onDeleteGroup(groupId: string): void {
  closeGroupContextMenu()
  deleteConfirmGroupId.value = groupId
}
async function confirmDeleteGroup(): Promise<void> {
  if (!deleteConfirmGroupId.value) return
  const id = deleteConfirmGroupId.value
  const group = groupStore.groups.find(g => g.id === id)
  const mode = group?.mode
  deleteConfirmGroupId.value = null
  if (mode === 'casual') {
    await deleteCasualGroupSession(id)
  } else {
    await deleteGroupSession(id)
  }
  if (groupStore.activeGroupId === id) {
    groupChatStore.reset()
  }
  groupStore.removeGroup(id)
}

const availableAgents = computed<AgentItem[]>(() => {
  return agentRegistry.agents.map(a => ({
    id: a.id,
    name: a.name,
    role: a.role,
    color: a.color,
    avatar: a.avatar,
    systemPrompt: a.systemPrompt,
    modelId: a.modelId,
    enabledTools: a.enabledTools,
    enabledSkills: a.enabledSkills,
  }))
})

const activeGroupId = computed(() => groupStore.activeGroupId)
const filteredGroups = computed(() => {
  let list = groupStore.sortedGroups
  if (modeFilter.value !== 'all') {
    list = list.filter(g => g.mode === modeFilter.value)
  }
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(g => g.name.toLowerCase().includes(q))
  }
  return list
})

async function loadGroups(): Promise<void> {
  const sessions = await getAllGroupSessions()
  groupStore.groups = sessions
  await agentRegistry.loadFromDB()
}

async function onSelect(group: { id: string; mode: GroupChatMode }): Promise<void> {
  groupChatStore.reset()
  groupStore.setActiveGroup(group.id)
  spaceStore.setMode('group')
  spaceStore.setGroupChatMode(group.mode)
  groupChatStore.setGroupMode(group.mode)

  if (group.mode === 'casual') {
    const session = await getCasualGroupSession(group.id)
    if (session) {
      groupChatStore.setGroupInfo(session.info)
      groupChatStore.setGroupMembers(session.members)
      for (const msg of session.messages) {
        groupChatStore.addCasualMessage(msg)
      }
    }
  } else {
    const session = await getGroupSession(group.id)
    if (session) {
      groupChatStore.loadSession(session)
    }
  }

  emit('select-group', { id: group.id, mode: group.mode })
}

function onGroupCreated(data: CreateGroupData): void {
  showCreateDialog.value = false
  emit('create-group', data)
}

async function onAgentCreated(agent: ChatAgent): Promise<void> {
  await agentRegistry.persistAgent(agent)
  showCreateAgentDialog.value = false
}

async function onAgentUpdated(agent: ChatAgent): Promise<void> {
  agentRegistry.updateAgent(agent.id, agent)
  await agentRegistry.persistAgent(agent)
  showEditAgentDialog.value = false
  editingAgent.value = null
}

function onEditAgent(agent: ChatAgent): void {
  editingAgent.value = { ...agent }
  showEditAgentDialog.value = true
}

function onAgentContextMenu(agentId: string): void {
  deleteConfirmId.value = agentId
}

async function confirmDeleteAgent(): Promise<void> {
  if (deleteConfirmId.value) {
    await agentRegistry.deleteAgentAndPersist(deleteConfirmId.value)
    deleteConfirmId.value = null
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }
  return `${d.getMonth() + 1}/${d.getDate()}`
}

watch(() => groupStore.groups.length, async () => {
  await agentRegistry.loadFromDB()
})

onMounted(() => {
  loadGroups()
  document.addEventListener('click', onDocumentClick)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
})
function onDocumentClick(event: MouseEvent): void {
  if (!groupContextMenu.value.visible) return
  const target = event.target as HTMLElement | null
  if (target && target.closest('.context-menu')) return
  closeGroupContextMenu()
}
</script>

<style scoped>
.group-chat-list { display: flex; flex-direction: column; height: 100%; }
.list-header { padding: 8px; display: flex; gap: 6px; }
.search-input { flex: 1; padding: 6px 10px; border: 1px solid var(--color-border); border-radius: 8px; font-size: 12px; background: var(--color-surface); outline: none; }
.search-input:focus { border-color: var(--color-primary); }
.new-btn { padding: 6px 10px; border: none; background: var(--color-primary); color: white; border-radius: 8px; cursor: pointer; font-size: 11px; font-weight: 600; white-space: nowrap; }

.mode-tabs { display: flex; gap: 2px; padding: 0 8px 6px; }
.mode-tab { flex: 1; padding: 4px; border: 1px solid var(--color-border); border-radius: 6px; background: var(--color-surface); cursor: pointer; font-size: 11px; text-align: center; transition: all 0.15s; }
.mode-tab.active { background: rgba(108,92,231,0.1); border-color: var(--color-primary); font-weight: 600; }

.list-body { flex: 1; overflow-y: auto; min-height: 0; }
.group-item { display: flex; align-items: center; gap: 8px; padding: 8px 12px; cursor: pointer; border-left: 3px solid transparent; }
.group-item:hover { background: var(--color-surface); }
.group-item.active { background: rgba(108,92,231,0.08); border-left-color: var(--color-primary); }
.group-avatar { width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #6c5ce7, #a29bfe); display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0; }
.group-info { flex: 1; min-width: 0; }
.group-top { display: flex; justify-content: space-between; align-items: center; }
.group-name { font-size: 13px; font-weight: 600; }
.group-time { font-size: 10px; color: var(--color-text-tertiary); }
.group-bottom { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--color-text-tertiary); }
.group-preview { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.unread-badge { min-width: 16px; height: 16px; border-radius: 8px; background: #ef4444; color: white; font-size: 9px; display: flex; align-items: center; justify-content: center; font-weight: 700; padding: 0 4px; }

.agent-add-btn { background: none; border: none; color: var(--color-primary); cursor: pointer; font-size: 14px; font-weight: 700; padding: 0 4px; }
.agent-add-btn:hover { opacity: 0.7; }

.agent-list-inner { display: flex; flex-direction: column; }
.agent-item { display: flex; align-items: center; gap: 8px; padding: 6px 0; cursor: pointer; border-radius: 6px; }
.agent-item:hover { background: var(--color-surface); }
.agent-avatar { width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: 700; font-size: 11px; flex-shrink: 0; }
.agent-info { flex: 1; min-width: 0; }
.agent-name { font-size: 12px; font-weight: 600; }
.agent-role { font-size: 10px; color: var(--color-text-tertiary); margin-left: 4px; }
.agent-source { font-size: 10px; }
.agent-empty { padding: 8px; font-size: 11px; color: var(--color-text-tertiary); text-align: center; }

.delete-confirm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 9998; display: flex; align-items: center; justify-content: center; }
.delete-confirm-dialog { background: var(--color-surface-elevated); border: 1px solid var(--color-border); border-radius: 12px; padding: 20px; min-width: 260px; box-shadow: 0 8px 24px rgba(0,0,0,0.2); }
.delete-confirm-text { font-size: 13px; margin-bottom: 16px; line-height: 1.5; }
.delete-confirm-actions { display: flex; gap: 8px; justify-content: flex-end; }
.delete-cancel-btn { padding: 6px 16px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-surface); cursor: pointer; font-size: 12px; }
.delete-confirm-btn { padding: 6px 16px; border: none; border-radius: 8px; background: #ef4444; color: white; cursor: pointer; font-size: 12px; font-weight: 600; }
.delete-confirm-btn:hover { background: #dc2626; }

.context-menu { background: rgba(10, 10, 20, 0.08); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid var(--color-border); border-radius: 10px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2); padding: 4px; min-width: 140px; }
.context-menu-item { padding: 8px 12px; font-size: 12px; color: var(--color-text); cursor: pointer; border-radius: 6px; transition: background 0.1s; }
.context-menu-item:hover { background: var(--color-surface); }
.context-menu-item.danger { color: #ef4444; }
.context-menu-item.danger:hover { background: rgba(239, 68, 68, 0.1); }
</style>
