<template>
  <div class="notebook-view">
    <div class="nb-toolbar">
      <div class="nb-toolbar-left">
        <button class="nb-sidebar-toggle" @click="sidebarOpen = !sidebarOpen" :title="sidebarOpen ? '收起侧边栏' : '展开侧边栏'">
          <span class="nb-toggle-icon"><WsIcon :name="sidebarOpen ? 'arrow-up' : 'chevron-right'" size="xs" /></span>
        </button>
        <button
          v-for="mode in VIEW_MODES"
          :key="mode"
          :class="['nb-mode-btn', { active: currentMode === mode }]"
          @click="currentMode = mode"
        >
          <WsIcon :name="modeIcons[mode]" size="xs" /> {{ modeLabels[mode] }}
        </button>
      </div>
      <div class="nb-toolbar-right">
        <button class="nb-action-btn" @click="createNote">+ 笔记</button>
        <button class="nb-action-btn nb-folder-btn" @click="createFolder">+ 文件夹</button>
      </div>
    </div>

    <div class="nb-content">
      <div :class="['nb-sidebar', { collapsed: !sidebarOpen }]">
        <div class="nb-sidebar-inner">
          <div class="nb-search">
            <input v-model="searchQuery" class="nb-search-input" placeholder="搜索笔记..." />
          </div>
          <div class="nb-note-list">
            <template v-if="searchQuery">
              <div
                v-for="note in filteredNotes"
                :key="note.id"
                :class="['nb-note-item', { active: selectedNoteId === note.id }]"
                role="button"
                tabindex="0"
                @click="selectedNoteId = note.id"
                @keydown.enter="selectedNoteId = note.id"
              >
                <span class="nb-note-icon"><WsIcon :name="getNoteIcon(note)" size="xs" /></span>
                <span class="nb-note-name">{{ note.name }}</span>
              </div>
            </template>
            <template v-else>
              <div :class="['nb-folder-group', { collapsed: collapsedFolders.has('') }]">
                <div class="nb-folder-header" role="button" tabindex="0" @click="toggleFolder('')" @keydown.enter="toggleFolder('')" @keydown.space.prevent="toggleFolder('')">
                  <span class="nb-folder-arrow"><WsIcon :name="collapsedFolders.has('') ? 'chevron-right' : 'chevron-down'" size="xs" /></span>
                  <span class="nb-folder-icon"><WsIcon name="outline" size="xs" /></span>
                  <span class="nb-folder-name">未分类</span>
                  <span class="nb-folder-count">{{ unfiledNotes.length }}</span>
                </div>
                <div class="nb-folder-items">
                  <div
                    v-for="note in unfiledNotes"
                    :key="note.id"
                    :class="['nb-note-item', { active: selectedNoteId === note.id }]"
                    @click="selectedNoteId = note.id"
                  >
                    <span class="nb-note-icon"><WsIcon :name="getNoteIcon(note)" size="xs" /></span>
                    <span class="nb-note-name">{{ note.name }}</span>
                  </div>
                </div>
              </div>

              <div
                v-for="folder in folders"
                :key="folder.id"
                :class="['nb-folder-group', { collapsed: collapsedFolders.has(folder.id) }]"
              >
                <div class="nb-folder-header" @click="toggleFolder(folder.id)">
                  <span class="nb-folder-arrow"><WsIcon :name="collapsedFolders.has(folder.id) ? 'chevron-right' : 'chevron-down'" size="xs" /></span>
                  <span class="nb-folder-icon"><WsIcon name="folder" size="xs" /></span>
                  <span class="nb-folder-name">{{ folder.name }}</span>
                  <span class="nb-folder-count">{{ getFolderNotes(folder.id).length }}</span>
                  <button :class="['nb-folder-del', { confirming: pendingDeleteFolderId === folder.id }]" @click.stop="deleteFolder(folder.id)" :title="pendingDeleteFolderId === folder.id ? '再次点击确认删除' : '删除文件夹'">{{ pendingDeleteFolderId === folder.id ? '确认?' : '×' }}</button>
                </div>
                <div class="nb-folder-items">
                  <div
                    v-for="note in getFolderNotes(folder.id)"
                    :key="note.id"
                    :class="['nb-note-item', { active: selectedNoteId === note.id }]"
                    @click="selectedNoteId = note.id"
                  >
                    <span class="nb-note-icon"><WsIcon :name="getNoteIcon(note)" size="xs" /></span>
                    <span class="nb-note-name">{{ note.name }}</span>
                  </div>
                </div>
              </div>
            </template>
        </div>
        <div v-if="showFolderInput" class="nb-folder-input-wrap">
          <input
            ref="folderInputRef"
            v-model="newFolderName"
            class="nb-folder-input"
            placeholder="文件夹名称…"
            @keydown.enter="confirmCreateFolder"
            @keydown.escape="showFolderInput = false"
          />
          <button class="nb-fi-ok" @click="confirmCreateFolder" aria-label="确认"><WsIcon name="check" size="xs" /></button>
          <button class="nb-fi-cancel" @click="showFolderInput = false" aria-label="取消"><WsIcon name="close" size="xs" /></button>
        </div>
      </div>
    </div>

      <div class="nb-main">
        <NotebookEditor
          v-if="currentMode === 'editor' && currentNote"
          :note="currentNote"
          :folders="folders"
          @update="onNoteUpdate"
        />
        <NotebookBoard
          v-else-if="currentMode === 'board'"
          :notes="filteredNotes"
          @select="selectedNoteId = $event"
        />
        <NotebookGraph
          v-else-if="currentMode === 'graph'"
          :notes="filteredNotes"
          @select="selectedNoteId = $event"
        />
        <div v-else class="nb-empty">选择或创建一个笔记开始</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch, nextTick } from 'vue'
import { useEntityStore } from '@worldsmith/entity-core'
import WsIcon from '../../../ui/WsIcon.vue'
import NotebookEditor from './components/NotebookEditor.vue'
import NotebookBoard from './components/NotebookBoard.vue'
import NotebookGraph from './components/NotebookGraph.vue'
import { VIEW_MODES, NOTE_TYPES } from './notebookConfig'
import type { ViewMode } from './notebookConfig'
import { useAgentPluginBridge } from '../../../composables/useAgentPluginBridge'

interface NotebookFolder {
  id: string
  name: string
}

const entityStore = useEntityStore()
const currentMode = ref<ViewMode>('editor')
const searchQuery = ref('')
const selectedNoteId = ref<string | null>(null)
const collapsedFolders = reactive(new Set<string>())
const sidebarOpen = ref(true)
const showFolderInput = ref(false)
const newFolderName = ref('')
const folderInputRef = ref<HTMLInputElement | null>(null)
const pendingDeleteFolderId = ref<string | null>(null)

const STORAGE_KEY_FOLDERS = 'worldsmith-notebook-folders'
const STORAGE_KEY_COLLAPSED = 'worldsmith-notebook-collapsed'
const STORAGE_KEY_SIDEBAR = 'worldsmith-notebook-sidebar'

const folders = ref<NotebookFolder[]>(loadFolders())
collapsedFolders.clear()
for (const id of loadCollapsed()) collapsedFolders.add(id)
sidebarOpen.value = loadSidebar()

function loadFolders(): NotebookFolder[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY_FOLDERS) || '[]') } catch { return [] }
}
function saveFolders(): void { localStorage.setItem(STORAGE_KEY_FOLDERS, JSON.stringify(folders.value)) }
function loadCollapsed(): string[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY_COLLAPSED) || '[]') } catch { return [] }
}
function saveCollapsed(): void { localStorage.setItem(STORAGE_KEY_COLLAPSED, JSON.stringify([...collapsedFolders])) }
function loadSidebar(): boolean {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY_SIDEBAR) || 'true') } catch { return true }
}
function saveSidebar(): void { localStorage.setItem(STORAGE_KEY_SIDEBAR, JSON.stringify(sidebarOpen.value)) }

const modeIcons: Record<ViewMode, string> = {
  editor: 'edit',
  board: 'dashboard',
  graph: 'link',
}

const modeLabels: Record<ViewMode, string> = {
  editor: '编辑',
  board: '看板',
  graph: '图谱',
}

const notebookNotes = computed(() =>
  entityStore.entities.filter((e: any) => e.type === 'notebook')
)

const filteredNotes = computed(() => {
  if (!searchQuery.value) return notebookNotes.value
  const q = searchQuery.value.toLowerCase()
  return notebookNotes.value.filter((n: any) =>
    n.name.toLowerCase().includes(q) ||
    (n.description || '').toLowerCase().includes(q)
  )
})

const unfiledNotes = computed(() =>
  notebookNotes.value.filter((n: any) => {
    const fid = n.properties?.folderId
    return !fid || !folders.value.some(f => f.id === fid)
  })
)

function getFolderNotes(folderId: string): any[] {
  return notebookNotes.value.filter((n: any) => n.properties?.folderId === folderId)
}

const currentNote = computed(() =>
  selectedNoteId.value
    ? notebookNotes.value.find((n: any) => n.id === selectedNoteId.value)
    : null
)

function getNoteIcon(note: any): string {
  const noteType = note.properties?.noteType || 'markdown'
  const iconMap: Record<string, string> = {
    markdown: 'edit',
    code: 'keyboard',
    canvas: 'palette',
    reference: 'manuscript',
  }
  return iconMap[noteType] || 'edit'
}

function toggleFolder(id: string): void {
  if (collapsedFolders.has(id)) collapsedFolders.delete(id)
  else collapsedFolders.add(id)
  saveCollapsed()
}

async function createNote(): Promise<void> {
  const targetFolder = folders.value.length > 0 ? folders.value[0].id : ''
  const id = await entityStore.add({
    id: crypto.randomUUID(),
    type: 'notebook',
    name: '未命名笔记',
    description: '',
    properties: {
      content: '',
      noteType: 'markdown',
      tags: [],
      backlinks: [],
      forwardLinks: [],
      linkedEntities: [],
      codeLanguage: '',
      codeOutput: '',
      sortOrder: Date.now().toString(),
      folderId: targetFolder,
    },
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }, 'user')
  selectedNoteId.value = id
  if (collapsedFolders.has(targetFolder)) {
    collapsedFolders.delete(targetFolder)
    saveCollapsed()
  }
}

function createFolder(): void {
  showFolderInput.value = true
  newFolderName.value = ''
  nextTick(() => { folderInputRef.value?.focus() })
}

function confirmCreateFolder(): void {
  const name = newFolderName.value.trim()
  if (!name) return
  const id = crypto.randomUUID()
  folders.value.push({ id, name })
  saveFolders()
  showFolderInput.value = false
  newFolderName.value = ''
}

function deleteFolder(folderId: string): void {
  if (pendingDeleteFolderId.value === folderId) {
    const folder = folders.value.find(f => f.id === folderId)
    if (folder) {
      for (const note of getFolderNotes(folderId)) {
        entityStore.update(note.id, { properties: { ...note.properties, folderId: '' } })
      }
      folders.value = folders.value.filter(f => f.id !== folderId)
      collapsedFolders.delete(folderId)
      saveFolders()
      saveCollapsed()
    }
    pendingDeleteFolderId.value = null
  } else {
    pendingDeleteFolderId.value = folderId
    setTimeout(() => { if (pendingDeleteFolderId.value === folderId) pendingDeleteFolderId.value = null }, 3000)
  }
}

async function onNoteUpdate(data: { id: string; changes: Record<string, unknown> }): Promise<void> {
  await entityStore.update(data.id, data.changes)
}

watch(sidebarOpen, () => { saveSidebar() })

useAgentPluginBridge('notebook', (event) => {
  console.log(`[Agent→${event.pluginId}] ${event.action}`, event.payload)
})
</script>

<style scoped>
.notebook-view { display: flex; flex-direction: column; height: 100%; background: var(--color-bg-base); }
.nb-toolbar { display: flex; justify-content: space-between; align-items: center; padding: 8px 16px; border-bottom: 1px solid var(--color-border-subtle); background: var(--color-bg-surface); }
.nb-toolbar-left { display: flex; gap: 4px; align-items: center; }
.nb-sidebar-toggle { padding: 4px 8px; border-radius: 4px; border: 1px solid var(--color-border); background: transparent; color: var(--color-text-tertiary); font-size: var(--font-size-xs); cursor: pointer; transition: all 0.15s; display: flex; align-items: center; justify-content: center; }
.nb-sidebar-toggle:hover { background: var(--color-bg-hover); color: var(--color-text-secondary); border-color: var(--color-text-secondary); }
.nb-toggle-icon { transition: transform 0.2s; display: inline-block; }
.nb-mode-btn { padding: 4px 12px; border-radius: 4px; border: 1px solid transparent; background: transparent; color: var(--color-text-secondary); font-size: var(--font-size-sm); cursor: pointer; transition: all 0.15s; }
.nb-mode-btn:hover { background: var(--color-bg-hover); }
.nb-mode-btn.active { background: color-mix(in srgb, var(--color-primary) 15%, transparent); color: var(--color-primary); border-color: var(--color-primary); }
.nb-toolbar-right { display: flex; gap: 6px; }
.nb-action-btn { padding: 4px 12px; border-radius: 4px; border: 1px solid var(--color-primary); background: transparent; color: var(--color-primary); font-size: var(--font-size-sm); cursor: pointer; }
.nb-action-btn:hover { background: color-mix(in srgb, var(--color-primary) 10%, transparent); }
.nb-folder-btn { border-color: var(--color-text-tertiary); color: var(--color-text-tertiary); }
.nb-folder-btn:hover { background: var(--color-bg-hover); border-color: var(--color-text-secondary); }

.nb-content { display: flex; flex: 1; overflow: hidden; background: var(--color-bg-base); }

.nb-sidebar { width: 240px; min-width: 0; border-right: 1px solid var(--color-border-subtle); display: flex; flex-direction: column; transition: width 0.25s ease, min-width 0.25s ease, opacity 0.2s ease; overflow: hidden; background: var(--color-bg-surface); }
.nb-sidebar.collapsed { width: 0; min-width: 0; border-right: none; }
.nb-sidebar-inner { width: 240px; min-width: 240px; display: flex; flex-direction: column; height: 100%; }
.nb-search { padding: 8px; }
.nb-search-input { width: 100%; padding: 6px 8px; border-radius: 4px; border: 1px solid var(--color-border); background: var(--color-bg-base); color: var(--color-text-primary); font-size: var(--font-size-sm); outline: none; }
.nb-search-input:focus { border-color: var(--color-primary); }
.nb-note-list { flex: 1; overflow-y: auto; padding: 4px; }

.nb-folder-group { margin-bottom: 2px; }
.nb-folder-header { display: flex; align-items: center; gap: 4px; padding: 5px 6px; border-radius: 4px; cursor: pointer; font-size: var(--font-size-sm); color: var(--color-text-secondary); transition: all 0.1s; user-select: none; }
.nb-folder-header:hover { background: var(--color-bg-hover); }
.nb-folder-arrow { font-size: var(--text-micro-font-size); width: 12px; text-align: center; color: var(--color-text-tertiary); }
.nb-folder-icon { font-size: var(--font-size-sm); }
.nb-folder-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: var(--font-weight-medium); }
.nb-folder-count { font-size: var(--font-size-xs); color: var(--color-text-tertiary); min-width: 16px; text-align: right; }
.nb-folder-del { display: none; font-size: var(--font-size-sm); padding: 0 4px; border: none; background: transparent; color: var(--color-text-tertiary); cursor: pointer; line-height: 1; }
.nb-folder-header:hover .nb-folder-del { display: inline-block; }
.nb-folder-del:hover { color: var(--color-danger); }
.nb-folder-del.confirming { display: inline-block; color: var(--color-danger); font-size: var(--font-size-xs); font-weight: var(--font-weight-semibold); animation: ws-pulse 1s infinite; }


.nb-folder-input-wrap { display: flex; gap: 4px; padding: 6px 8px; border-top: 1px solid var(--color-border-subtle); align-items: center; }
.nb-folder-input { flex: 1; padding: 4px 8px; border-radius: 4px; border: 1px solid var(--color-primary); background: var(--color-bg-base); color: var(--color-text-primary); font-size: var(--font-size-sm); outline: none; }
.nb-fi-ok, .nb-fi-cancel { padding: 2px 8px; border-radius: 4px; border: 1px solid var(--color-border); background: transparent; color: var(--color-text-secondary); font-size: var(--font-size-sm); cursor: pointer; }
.nb-fi-ok:hover { background: color-mix(in srgb, var(--color-success) 15%, transparent); color: var(--color-success); border-color: var(--color-success); }
.nb-fi-cancel:hover { background: color-mix(in srgb, var(--color-danger) 15%, transparent); color: var(--color-danger); border-color: var(--color-danger); }

.nb-folder-items { overflow: hidden; transition: max-height 0.2s ease; }
.nb-folder-group.collapsed .nb-folder-items { max-height: 0; }
.nb-folder-group:not(.collapsed) .nb-folder-items { max-height: 2000px; }

.nb-note-item { display: flex; align-items: center; gap: 6px; padding: 5px 8px 5px 28px; border-radius: 4px; cursor: pointer; font-size: var(--font-size-sm); color: var(--color-text-secondary); transition: all 0.1s; }
.nb-note-item:hover { background: var(--color-bg-hover); }
.nb-note-item.active { background: color-mix(in srgb, var(--color-primary) 15%, transparent); color: var(--color-primary); }
.nb-note-icon { font-size: var(--font-size-base); }
.nb-note-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nb-main { flex: 1; overflow: auto; background: var(--color-bg-base); }
.nb-empty { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--color-text-tertiary); font-size: var(--font-size-base); }
</style>
