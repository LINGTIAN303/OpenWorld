<template>
  <div class="space-navbar">
    <div class="navbar-left">
      <div class="agent-identity" ref="identityRef">
        <div class="agent-avatar" :style="{ background: profile.accentColor }" @click.stop="togglePersonaPopover">{{ avatarDisplay }}</div>
        <div class="agent-info">
          <span class="agent-name" :style="{ fontFamily: fontFamily }">{{ agentName }}</span>
          <span class="agent-status"><WsIcon v-if="moodIcon" :name="moodIcon" size="xs" /> {{ moodLabel }}</span>
        </div>
        <div class="mode-dropdown-wrap" ref="dropdownWrapRef">
          <button class="mode-dropdown-btn" :class="{ locked: lockedChatMode !== null && spaceStore.mode === 'chat' }" @click.stop="personaPopoverOpen = false; modeDropdownOpen = !modeDropdownOpen">
            <span class="mode-dropdown-icon"><WsIcon :name="currentMode.icon" size="xs" /></span>
            <span class="mode-dropdown-label">{{ currentMode.label }}</span>
            <span v-if="lockedChatMode !== null && spaceStore.mode === 'chat'" class="mode-lock-icon"><WsIcon name="lock" size="xs" /></span>
            <span v-else class="mode-dropdown-arrow">▾</span>
          </button>
        </div>
      </div>
    </div>

    <div class="navbar-center">
      <div class="mode-switch" @click="toggleMode">
        <div class="mode-switch-track">
          <Transition name="mode-text" mode="out-in">
            <span class="mode-switch-label" :key="spaceStore.mode">
              {{ spaceStore.mode === 'chat' ? '私聊' : '群聊' }}
            </span>
          </Transition>
        </div>
        <span class="mode-switch-hint">切换</span>
      </div>
    </div>

    <div class="navbar-right">
      <button
        class="nav-btn"
        :class="{ active: spaceStore.sessionSidebarOpen }"
        @click="spaceStore.toggleSessionSidebar()"
        title="会话列表"
      ><WsIcon name="clipboard-list" size="sm" /></button>
      <button
        class="nav-btn"
        :class="{ active: spaceStore.leftPanel === 'knowledge' }"
        @click="spaceStore.toggleLeftPanel('knowledge')"
        title="知识墙"
      ><WsIcon name="book" size="sm" /></button>
      <button
        class="nav-btn"
        :class="{ active: spaceStore.rightPanel === 'memory' }"
        @click="spaceStore.toggleRightPanel('memory')"
        title="记忆架"
      ><WsIcon name="brain" size="sm" /></button>
      <button
        class="nav-btn"
        :class="{ active: spaceStore.rightPanel === 'agent-settings' }"
        @click="spaceStore.toggleRightPanel('agent-settings')"
        title="Agent 设置"
      ><WsIcon name="settings" size="sm" /></button>
      <button
        class="nav-btn"
        :class="{ active: spaceStore.rightPanel === 'activity' }"
        @click="spaceStore.toggleRightPanel('activity')"
        title="活动日志"
      ><WsIcon name="chart" size="sm" /></button>
      <span class="nav-divider"></span>
      <button class="nav-btn" @click="emit('openWorkbench')" title="工作台（抽屉）"><WsIcon name="monitor" size="sm" /></button>
      <button class="nav-btn" @click="emit('switchToWorkbench')" title="切换到工作台主界面"><WsIcon name="home" size="sm" /></button>
      <button class="nav-btn" @click="emit('openSettings')" title="设置"><WsIcon name="pencil" size="sm" /></button>
    </div>

    <Teleport to="body">
      <Transition name="popover">
        <div v-if="personaPopoverOpen" class="persona-popover-overlay" @click.self="personaPopoverOpen = false">
          <div class="persona-popover" :style="popoverStyle" @click.stop>
            <PersonaMirror @close="personaPopoverOpen = false" />
          </div>
        </div>
      </Transition>
    </Teleport>

    <Teleport to="body">
      <div v-if="modeDropdownOpen" class="mode-dropdown-backdrop" @click="modeDropdownOpen = false"></div>
    </Teleport>

    <Teleport to="body">
      <Transition name="dropdown">
        <div v-if="modeDropdownOpen" class="mode-dropdown-menu" :style="dropdownMenuStyle">
          <button
            v-for="m in chatModes"
            :key="m.value"
            class="mode-dropdown-item"
            :class="{ active: (spaceStore.mode === 'group' ? spaceStore.groupChatMode : spaceStore.chatMode) === m.value, disabled: lockedChatMode !== null && spaceStore.mode === 'chat' }"
            @click.stop="onModeSelect(m.value)"
          >
            <span class="mode-item-icon"><WsIcon :name="m.icon" size="sm" /></span>
            <div class="mode-item-text">
              <span class="mode-item-label">{{ m.label }}</span>
              <span class="mode-item-desc">{{ m.desc }}</span>
            </div>
          </button>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useSpaceStore, type ChatMode, type GroupChatMode } from './stores/space-store'
import { useAgentPersona } from './composables/useAgentPersona'
import { usePersonaFont } from './composables/usePersonaFont'
import { useAgent } from '../agent/composables/useAgent'
import PersonaMirror from './panels/PersonaMirror.vue'
import WsIcon from '../ui/WsIcon.vue'

const { fontFamily, profile } = usePersonaFont()
const { lockedChatMode, setChatMode: setAgentChatMode } = useAgent()

const emit = defineEmits<{
  openWorkbench: []
  switchToWorkbench: []
  openSettings: []
}>()

const spaceStore = useSpaceStore()
const { agentName, moodIcon, moodLabel } = useAgentPersona()
const avatarDisplay = computed(() => spaceStore.persona.avatar || agentName.value.charAt(0))

const personaPopoverOpen = ref(false)
const modeDropdownOpen = ref(false)
const identityRef = ref<HTMLElement>()
const dropdownWrapRef = ref<HTMLElement>()

function toggleMode() {
  spaceStore.setMode(spaceStore.mode === 'chat' ? 'group' : 'chat')
}

const chatModes = computed(() => {
  if (spaceStore.mode === 'group') {
    return [
      { value: 'meeting' as const, icon: 'clipboard-list', label: '会议模式', desc: '有序讨论，深度发言，适合决策和评审' },
      { value: 'casual' as const, icon: 'coffee', label: '闲聊模式', desc: '自由发言，简短互动，像微信群一样聊天' },
    ]
  }
  return [
    { value: 'normal' as const, icon: 'chat', label: '快问快答', desc: '不思考，不调用工具，直接回答' },
    { value: 'deep' as const, icon: 'brain', label: '深度思考', desc: '深度推理 + 工具验证 + 结构化推理链' },
    { value: 'explore' as const, icon: 'search', label: '知识探索', desc: '知识库 → 联网搜索 → 项目数据 → 模型知识' },
  ]
})

const currentMode = computed(() => {
  if (spaceStore.mode === 'group') {
    return chatModes.value.find(m => m.value === spaceStore.groupChatMode) || chatModes.value[1]
  }
  return chatModes.value.find(m => m.value === spaceStore.chatMode) || chatModes.value[0]
})

function onModeSelect(mode: string) {
  if (spaceStore.mode === 'group') {
    spaceStore.setGroupChatMode(mode as GroupChatMode)
  } else {
    if (lockedChatMode.value !== null) return
    spaceStore.setChatMode(mode as ChatMode)
    setAgentChatMode(mode as ChatMode)
  }
  modeDropdownOpen.value = false
}

const dropdownMenuStyle = computed(() => {
  const el = dropdownWrapRef.value
  if (!el) return { top: '56px', left: '200px' }
  const rect = el.getBoundingClientRect()
  return {
    top: `${rect.bottom + 6}px`,
    left: `${rect.left}px`,
  }
})

const popoverStyle = ref<Record<string, string>>({ top: '56px', left: '16px' })

function updatePopoverPosition() {
  const el = identityRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  popoverStyle.value = {
    top: `${rect.bottom + 8}px`,
    left: `${rect.left}px`,
  }
}

function togglePersonaPopover() {
  personaPopoverOpen.value = !personaPopoverOpen.value
  modeDropdownOpen.value = false
  if (personaPopoverOpen.value) {
    updatePopoverPosition()
  }
}

function onDocClick(e: MouseEvent) {
  if (modeDropdownOpen.value) {
    const target = e.target as HTMLElement
    if (!target.closest('.mode-dropdown-wrap') && !target.closest('.mode-dropdown-backdrop')) {
      modeDropdownOpen.value = false
    }
  }
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
})
</script>

<style scoped>
.space-navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  padding: 0 16px;
  background: var(--color-surface-elevated);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  gap: 12px;
  position: relative;
  z-index: 100;
}

.navbar-left, .navbar-right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
}

.navbar-left {
  justify-content: flex-start;
}

.navbar-right {
  justify-content: flex-end;
}

.navbar-center {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}

.mode-switch {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  padding: 4px 8px;
  border-radius: 8px;
  transition: background 0.15s;
}
.mode-switch:hover {
  background: var(--color-surface);
}

.mode-switch-track {
  position: relative;
  overflow: hidden;
  min-width: 72px;
  text-align: center;
}

.mode-switch-label {
  display: inline-block;
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
}

.mode-switch-hint {
  font-size: var(--font-size-2xs);
  color: var(--color-text-tertiary);
  opacity: 0;
  transition: opacity 0.15s;
}
.mode-switch:hover .mode-switch-hint {
  opacity: 1;
}

.mode-text-enter-active {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.mode-text-leave-active {
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  position: absolute;
  left: 0;
  right: 0;
}
.mode-text-enter-from {
  opacity: 0;
  transform: translateX(12px);
}
.mode-text-leave-to {
  opacity: 0;
  transform: translateX(-12px);
}

.agent-identity {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 8px;
  border-radius: 8px;
}

.agent-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--color-primary);
  color: var(--color-text-inverse);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-size-base);
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
}

.agent-avatar:hover {
  transform: scale(1.08);
  box-shadow: 0 0 0 3px var(--color-primary-muted);
}

.agent-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.agent-name {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-text);
}

.agent-status {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.mode-dropdown-wrap {
  position: relative;
  margin-left: 4px;
}

.mode-dropdown-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.mode-dropdown-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-text);
}

.mode-dropdown-icon {
  font-size: var(--font-size-sm);
  line-height: 1;
}

.mode-dropdown-label {
  font-weight: 500;
}

.mode-dropdown-arrow {
  font-size: 10px;
  opacity: 0.5;
  margin-left: 2px;
}

.mode-dropdown-menu {
  position: fixed;
  min-width: 220px;
  background: rgba(10, 10, 20, 0.08);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  padding: 4px;
  z-index: 10001;
}

.mode-dropdown-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s;
  color: var(--color-text-secondary);
}

.mode-dropdown-btn.locked {
  opacity: 0.7;
  cursor: default;
  border-color: var(--color-border);
}

.mode-dropdown-btn.locked:hover {
  border-color: var(--color-border);
  color: var(--color-text-secondary);
}

.mode-lock-icon {
  font-size: 10px;
  margin-left: 2px;
  opacity: 0.6;
}

.mode-dropdown-item.disabled {
  opacity: 0.4;
  cursor: not-allowed;
  pointer-events: none;
}

.mode-dropdown-item:hover {
  background: var(--color-surface);
  color: var(--color-text);
}

.mode-dropdown-item.active {
  background: var(--color-primary-muted);
  color: var(--color-text);
}

.mode-item-icon {
  font-size: var(--font-size-lg);
  line-height: 1;
  margin-top: 2px;
  flex-shrink: 0;
}

.mode-item-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.mode-item-label {
  font-size: var(--font-size-sm);
  font-weight: 500;
}

.mode-item-desc {
  font-size: var(--font-size-2xs);
  color: var(--color-text-tertiary);
  line-height: 1.3;
}

.mode-dropdown-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
}

.nav-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  font-size: var(--font-size-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.nav-btn:hover {
  background: var(--color-surface);
}
.nav-btn.active {
  background: var(--color-primary-muted);
}

.nav-divider {
  width: 1px;
  height: 20px;
  background: var(--color-border);
  margin: 0 4px;
}

.persona-popover-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
}

.persona-popover {
  position: fixed;
  width: 340px;
  max-height: 70vh;
  background: rgba(10, 10, 20, 0.08);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
  overflow-y: auto;
  z-index: 10000;
}

.popover-enter-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.popover-leave-active {
  transition: opacity 0.1s ease, transform 0.1s ease;
}
.popover-enter-from {
  opacity: 0;
  transform: translateY(-8px) scale(0.97);
}
.popover-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.99);
}

.dropdown-enter-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.dropdown-leave-active {
  transition: opacity 0.08s ease, transform 0.08s ease;
}
.dropdown-enter-from {
  opacity: 0;
  transform: translateY(-4px);
}
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-2px);
}
</style>
