<template>
  <div class="agent-space" :style="cssVars">
    <SpaceNavbar
      @open-workbench="onOpenWorkbench"
      @switch-to-workbench="onSwitchToWorkbench"
      @open-settings="onOpenSettings"
    />

    <div class="space-body">
      <Transition name="sidebar-slide">
        <div
          v-if="spaceStore.sessionSidebarOpen"
          class="session-sidebar-wrapper"
          :style="{ width: spaceStore.sessionSidebarWidth + 'px' }"
        >
          <SessionSidebar v-if="spaceStore.mode === 'chat'" @close="spaceStore.setSessionSidebarOpen(false)" />
          <GroupSessionSidebar v-else @close="spaceStore.setSessionSidebarOpen(false)" @new="onNewGroupChat" />
          <div
            class="resize-handle resize-handle-right"
            @mousedown="onSessionResizeStart"
          ></div>
        </div>
      </Transition>

      <Transition name="panel-slide-left">
        <div
          v-if="spaceStore.leftPanel"
          class="space-panel left-panel"
          :style="{
            width: spaceStore.leftPanelWidth + 'px',
            left: (spaceStore.sessionSidebarOpen ? spaceStore.sessionSidebarWidth : 0) + 'px',
          }"
        >
          <KnowledgeWall
            v-if="spaceStore.leftPanel === 'knowledge'"
            @add="onAddKnowledge"
            @select="onSelectKnowledge"
            @close="spaceStore.toggleLeftPanel(spaceStore.leftPanel!)"
          />
          <div
            class="resize-handle resize-handle-right"
            @mousedown="onLeftResizeStart"
          ></div>
        </div>
      </Transition>

      <div class="space-main">
        <SpaceChat />
      </div>

      <Transition name="panel-slide-right">
        <div
          v-if="spaceStore.rightPanel"
          class="space-panel right-panel"
          :style="{ width: spaceStore.rightPanelWidth + 'px' }"
        >
          <div
            class="resize-handle resize-handle-left"
            @mousedown="onRightResizeStart"
          ></div>
          <MemoryShelf v-if="spaceStore.rightPanel === 'memory'" @close="spaceStore.rightPanel = null" />
          <PersonaMirror v-else-if="spaceStore.rightPanel === 'persona'" @close="spaceStore.rightPanel = null" />
          <SpaceAgentSettingsPanel v-else-if="spaceStore.rightPanel === 'agent-settings'" @close="spaceStore.rightPanel = null" />
          <ActivityLog v-else-if="spaceStore.rightPanel === 'activity'" @close="spaceStore.rightPanel = null" />
        </div>
      </Transition>
    </div>

    <WsDrawer
      :show="spaceStore.workspaceDrawerOpen"
      title="工作台"
      placement="right"
      size="lg"
      @close="spaceStore.setWorkspaceDrawerOpen(false)"
    >
      <div class="drawer-shell-wrapper">
        <Shell />
      </div>
    </WsDrawer>

    <SettingsDialog :show="settingsOpen" @close="settingsOpen = false" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useSpaceStore } from './stores/space-store'
import { useUIStore } from '../stores/uiStore'
import SpaceNavbar from './SpaceNavbar.vue'
import SessionSidebar from './chat/SessionSidebar.vue'
import GroupSessionSidebar from './group-chat/components/GroupSessionSidebar.vue'
import { useGroupChatStore } from './group-chat/GroupChatStore'
import SpaceChat from './chat/SpaceChat.vue'
import KnowledgeWall from './panels/KnowledgeWall.vue'
import MemoryShelf from './panels/MemoryShelf.vue'
import PersonaMirror from './panels/PersonaMirror.vue'
import SpaceAgentSettingsPanel from './panels/SpaceAgentSettingsPanel.vue'
import ActivityLog from './panels/ActivityLog.vue'
import Shell from '../ui/Shell.vue'
import WsDrawer from '../ui/WsDrawer.vue'
import SettingsDialog from '../ui/SettingsDialog.vue'
import type { KBEntry } from '../../worldsmith-agent/src/kb/kb-store'
import { useActivityLog } from './composables/useActivityLog'

const spaceStore = useSpaceStore()
const uiStore = useUIStore()
const settingsOpen = ref(false)
const { addLog } = useActivityLog()

function onOpenWorkbench() {
  spaceStore.setWorkspaceDrawerOpen(true)
}

function onSwitchToWorkbench() {
  spaceStore.setWorkspaceDrawerOpen(false)
  uiStore.setShell('workbench')
}

function onOpenSettings() {
  settingsOpen.value = true
}

function onAddKnowledge() {
  addLog('knowledge', '打开新增知识对话框')
}

const groupChatStore = useGroupChatStore()

function onNewGroupChat() {
  groupChatStore.reset()
}

function onSelectKnowledge(entry: KBEntry) {
  addLog('knowledge', `查看知识: ${entry.path}`)
}

function startResize(
  e: MouseEvent,
  startWidth: number,
  calcDelta: (ev: MouseEvent) => number,
  setter: (w: number) => void,
) {
  e.preventDefault()
  const startX = e.clientX

  function onMove(ev: MouseEvent) {
    setter(startWidth + calcDelta(ev))
  }

  function onUp() {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

function onSessionResizeStart(e: MouseEvent) {
  startResize(e, spaceStore.sessionSidebarWidth, ev => ev.clientX - e.clientX, w => {
    if (w < 180) return spaceStore.setSessionSidebarOpen(false)
    spaceStore.sessionSidebarWidth = Math.min(400, Math.max(200, w))
  })
}

function onLeftResizeStart(e: MouseEvent) {
  startResize(e, spaceStore.leftPanelWidth, ev => ev.clientX - e.clientX, spaceStore.setLeftPanelWidth)
}

function onRightResizeStart(e: MouseEvent) {
  startResize(e, spaceStore.rightPanelWidth, ev => e.clientX - ev.clientX, spaceStore.setRightPanelWidth)
}
</script>

<style scoped>
.agent-space {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background: var(--color-surface);
}

.space-body {
  display: flex;
  flex: 1;
  overflow: hidden;
  position: relative;
}

.session-sidebar-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 20;
  box-shadow: 4px 0 12px -2px rgba(0, 0, 0, 0.12);
}

.space-panel {
  position: absolute;
  top: 0;
  bottom: 0;
  background: var(--color-surface-elevated);
  overflow: hidden;
  z-index: 20;
}

.left-panel {
  left: 0;
  box-shadow: 4px 0 12px -2px rgba(0, 0, 0, 0.15);
  transition: left 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.right-panel {
  right: 0;
  box-shadow: -4px 0 12px -2px rgba(0, 0, 0, 0.15);
}

.resize-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 6px;
  z-index: 10;
  cursor: col-resize;
  transition: background 0.15s;
}

.resize-handle:hover,
.resize-handle:active {
  background: var(--color-primary);
  opacity: 0.35;
}

.resize-handle-right {
  right: 0;
}

.resize-handle-left {
  left: 0;
}

.drawer-shell-wrapper {
  height: 100%;
  overflow: hidden;
}

.space-main {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.sidebar-slide-enter-active,
.sidebar-slide-leave-active {
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease;
}
.sidebar-slide-enter-from {
  transform: translateX(-20px);
  opacity: 0;
}
.sidebar-slide-leave-to {
  transform: translateX(-20px);
  opacity: 0;
}

.panel-slide-left-enter-active,
.panel-slide-left-leave-active {
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease;
}
.panel-slide-left-enter-from {
  transform: translateX(-20px);
  opacity: 0;
}
.panel-slide-left-leave-to {
  transform: translateX(-20px);
  opacity: 0;
}

.panel-slide-right-enter-active,
.panel-slide-right-leave-active {
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease;
}
.panel-slide-right-enter-from {
  transform: translateX(20px);
  opacity: 0;
}
.panel-slide-right-leave-to {
  transform: translateX(20px);
  opacity: 0;
}
</style>
