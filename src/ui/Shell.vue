<template>
  <div class="shell">
    <WelcomeOverlay />
    <MenuBar />
    <div class="shell-body">
      <Sidebar />
      <ViewContainer />
    </div>
    <GlobalSearch :show="searchOpen" @close="searchOpen = false" />
    <ImportExportModal :show="importExportOpen" @close="importExportOpen = false" />
    <Toast />
    <DialogContainer />
    <WsConfirmDialog />
    <BatchEditModal :show="batchEditOpen" @close="batchEditOpen = false" />
    <TemplateManager :show="templateOpen" @close="templateOpen = false" />
    <VersionHistory :show="versionOpen" @close="versionOpen = false" />
    <DocExport :show="docOpen" @close="docOpen = false" />
    <SettingsDialog :show="settingsOpen" @close="settingsOpen = false" />
    <ThemeEditor :show="themeEditorOpen" @close="themeEditorOpen = false" />
    <LayoutManager :show="layoutMgrOpen" @close="layoutMgrOpen = false" />
    <ShortcutHelpModal :show="shortcutHelpOpen" @close="shortcutHelpOpen = false" />
    <UndoHistoryPanel :show="undoHistoryOpen" @close="undoHistoryOpen = false" @redo="onRedoFromHistory" />
    <InfoPanel />
    <VideoNotification :notifications="videoNotifications" :session-memory="videoSessionMemory" @dismiss="dismissNotification" @pin="pinNotification" @unpin="unpinNotification" />
    <AgentOverlay />
  </div>
</template>

<script setup lang="ts">
import { ref, defineAsyncComponent, onMounted, watch } from 'vue'
import MenuBar from './MenuBar.vue'
import Sidebar from './Sidebar.vue'
import ViewContainer from './ViewContainer.vue'
import Toast from './Toast.vue'
import DialogContainer from './DialogContainer.vue'
import WsConfirmDialog from './WsConfirmDialog.vue'

const WelcomeOverlay = defineAsyncComponent(() => import('./WelcomeOverlay.vue'))
const GlobalSearch = defineAsyncComponent(() => import('./GlobalSearch.vue'))
const ImportExportModal = defineAsyncComponent(() => import('./ImportExportModal.vue'))
import { BatchEditModal } from '@worldsmith/ui-kit'
const TemplateManager = defineAsyncComponent(() => import('./TemplateManager.vue'))
const VersionHistory = defineAsyncComponent(() => import('./VersionHistory.vue'))
const DocExport = defineAsyncComponent(() => import('./DocExport.vue'))
const SettingsDialog = defineAsyncComponent(() => import('./SettingsDialog.vue'))
const ThemeEditor = defineAsyncComponent(() => import('../components/theme-editor/ThemeEditor.vue'))
const LayoutManager = defineAsyncComponent(() => import('./LayoutManager.vue'))
const ShortcutHelpModal = defineAsyncComponent(() => import('./ShortcutHelpModal.vue'))
const UndoHistoryPanel = defineAsyncComponent(() => import('./UndoHistoryPanel.vue'))
const InfoPanel = defineAsyncComponent(() => import('./InfoPanel.vue'))
const AgentOverlay = defineAsyncComponent(() => import('../agent/AgentOverlay.vue'))
import { useShortcuts, useUndoRedo } from '@worldsmith/ui-kit'
import { usePluginStore } from '@worldsmith/entity-core'
import { useUIStore } from '../stores/uiStore'
import { useEntityStore, useRelationStore } from '@worldsmith/entity-core'
import { useSettingsStore } from '../stores/settingsStore'
import { entitySchemaRegistry } from '@worldsmith/entity-core'
import { useFileSystemProject } from '../composables/useFileSystemProject'
import { useGlobalEvents } from '../composables/useGlobalEvents'
import VideoNotification from './VideoNotification.vue'
import { useVideoMode } from '../composables/useVideoMode'

const searchOpen = ref(false)
const importExportOpen = ref(false)
const batchEditOpen = ref(false)
const templateOpen = ref(false)
const versionOpen = ref(false)
const docOpen = ref(false)
const settingsOpen = ref(false)
const themeEditorOpen = ref(false)
const layoutMgrOpen = ref(false)
const shortcutHelpOpen = ref(false)
const undoHistoryOpen = ref(false)



function onOpenSearch() { searchOpen.value = true }
function onOpenImportExport() { importExportOpen.value = true }
function onOpenBatchEdit() { batchEditOpen.value = true }
function onOpenTemplate() { templateOpen.value = true }
function onOpenVersion() { versionOpen.value = true }
function onOpenDocExport() { docOpen.value = true }
function onOpenLayoutMgr() { layoutMgrOpen.value = true }
function onOpenSettings() { settingsOpen.value = true }
function onOpenThemeEditor() { themeEditorOpen.value = true }

const pluginStore = usePluginStore()
const uiStore = useUIStore()
const settingsStore = useSettingsStore()
const { notifications: videoNotifications, dismissNotification, pinNotification, unpinNotification, notifyViewSwitch, sessionMemory: videoSessionMemory } = useVideoMode()

watch(() => uiStore.currentView, (newView, oldView) => {
  if (newView && newView !== oldView) {
    notifyViewSwitch(newView)
  }
})

function onWsNavigate(e: Event) {
  const detail = (e as CustomEvent).detail
  if (!detail) return
  const { view: entityType, entityId } = detail
  const schema = entitySchemaRegistry.get(entityType)
  const pluginId = schema?.pluginId
  const targetView = pluginStore.views.find(v => v.pluginId === pluginId)
  if (targetView) {
    uiStore.setView(targetView.id)
    uiStore.viewComponent = targetView.component
  }
  if (entityId) {
    uiStore.selectEntity(entityId)
    window.dispatchEvent(new CustomEvent('ws-select-entity', { detail: { entityId } }))
  }
}

const { on: onGlobalEvent } = useGlobalEvents()

onGlobalEvent('ws-open-search', onOpenSearch)
onGlobalEvent('ws-open-import-export', onOpenImportExport)
onGlobalEvent('ws-open-batch-edit', onOpenBatchEdit)
onGlobalEvent('ws-open-template', onOpenTemplate)
onGlobalEvent('ws-open-version', onOpenVersion)
onGlobalEvent('ws-open-doc-export', onOpenDocExport)
onGlobalEvent('ws-open-layout-mgr', onOpenLayoutMgr)
onGlobalEvent('ws-open-settings', onOpenSettings)
onGlobalEvent('ws-open-theme-editor', onOpenThemeEditor)
onGlobalEvent('ws-navigate', onWsNavigate)

onMounted(() => {
  const { tryRestoreProject } = useFileSystemProject()
  tryRestoreProject()
})


onMounted(() => {
  const { register, unregister: _unregister } = useShortcuts()
  const { undo, redo } = useUndoRedo()
  const entityStore = useEntityStore()
  const relationStore = useRelationStore()

  register({ id: 'help.shortcuts', keys: ['?'], description: '开启快捷键帮助', scope: 'global', handler: () => { shortcutHelpOpen.value = true } })
  register({ id: 'sidebar.toggle', keys: ['ctrl', 'b'], description: '切换侧边栏', scope: 'global', handler: () => uiStore.toggleSidebar() })
  register({ id: 'search.open', keys: ['ctrl', 'k'], description: '全局搜索', scope: 'global', handler: () => { searchOpen.value = true } })
  register({ id: 'settings.open', keys: ['ctrl', ','], description: '打开设置', scope: 'global', handler: () => { settingsOpen.value = true } })
  register({ id: 'global.undo', keys: ['ctrl', 'z'], description: '撤销', scope: 'global', handler: () => undo(entityStore, relationStore), preventDefault: true })
  register({ id: 'global.redo', keys: ['ctrl', 'y'], description: '重做', scope: 'global', handler: () => redo(entityStore, relationStore), preventDefault: true })
  register({ id: 'global.redo-alt', keys: ['ctrl', 'shift', 'z'], description: '重做(备选)', scope: 'global', handler: () => redo(entityStore, relationStore), preventDefault: true })
  register({ id: 'global.undoHistory', keys: ['ctrl', 'alt', 'z'], description: '撤销历史面板', scope: 'global', handler: () => { undoHistoryOpen.value = !undoHistoryOpen.value } })

  const { saveToFolder, isProjectOpen: projectOpen } = useFileSystemProject()
  register({ id: 'project.save', keys: ['ctrl', 's'], description: '保存到文件夹', scope: 'global', handler: () => { if (projectOpen.value) saveToFolder() }, preventDefault: true })

  for (let i = 0; i < Math.min(pluginStore.views.length, 9); i++) {
    const idx = i
    register({
      id: `view.switch.${idx}`,
      keys: [String(idx + 1)],
      description: `切换到 ${pluginStore.views[idx]?.label || '视图' + (idx+1)}`,
      scope: 'global',
      handler: () => {
        const v = pluginStore.views[idx]
        if (v) { uiStore.setView(v.id); uiStore.viewComponent = v.component }
      },
    })
  }
})

async function onRedoFromHistory(indices: number[]) {
  const { redo } = useUndoRedo()
  const entityStore = useEntityStore()
  const relationStore = useRelationStore()

  if (!settingsStore.multiStepRedo) {
    await redo(entityStore, relationStore)
    return
  }

  const sorted = [...indices].sort((a, b) => a - b)
  for (let i = 0; i < sorted.length; i++) {
    await redo(entityStore, relationStore)
  }
}
</script>

<style scoped>
.shell {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  overflow: hidden;
}
.shell-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}
</style>
