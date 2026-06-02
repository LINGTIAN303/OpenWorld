import { ref, computed } from 'vue'
import { useEntityStore, useRelationStore } from '@worldsmith/entity-core'
import { useCustomModuleStore } from '../stores/customModuleStore'
import { usePluginStore } from '@worldsmith/entity-core'
import { getExportController, getImportController } from '../utils/io_export'
import type { WorldSmithPack } from '../core/WorldSmithPack'

const dirHandle = ref<FileSystemDirectoryHandle | null>(null)
const saving = ref(false)
const loading = ref(false)
const lastError = ref('')

const projectName = computed(() => dirHandle.value?.name ?? '')
const isProjectOpen = computed(() => dirHandle.value !== null)
const isSupported = computed(() => typeof window !== 'undefined' && 'showDirectoryPicker' in window)

const HANDLE_DB = 'WorldSmith-FSHandles'
const HANDLE_STORE = 'handles'
const HANDLE_KEY = 'project-dir'

function openHandleDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_DB, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(HANDLE_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function persistHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openHandleDB()
  const tx = db.transaction(HANDLE_STORE, 'readwrite')
  tx.objectStore(HANDLE_STORE).put(handle, HANDLE_KEY)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function loadPersistedHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openHandleDB()
    const tx = db.transaction(HANDLE_STORE, 'readonly')
    const req = tx.objectStore(HANDLE_STORE).get(HANDLE_KEY)
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

async function clearPersistedHandle(): Promise<void> {
  try {
    const db = await openHandleDB()
    const tx = db.transaction(HANDLE_STORE, 'readwrite')
    tx.objectStore(HANDLE_STORE).delete(HANDLE_KEY)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch { /* ignore */ }
}

async function readFileText(handle: FileSystemDirectoryHandle, path: string): Promise<string | null> {
  try {
    const parts = path.split('/')
    let h: FileSystemDirectoryHandle | FileSystemFileHandle = handle
    for (let i = 0; i < parts.length - 1; i++) {
      h = await (h as FileSystemDirectoryHandle).getDirectoryHandle(parts[i])
    }
    const fileHandle = await (h as FileSystemDirectoryHandle).getFileHandle(parts[parts.length - 1])
    const file = await fileHandle.getFile()
    return await file.text()
  } catch {
    return null
  }
}

async function writeFileText(handle: FileSystemDirectoryHandle, path: string, content: string): Promise<void> {
  const parts = path.split('/')
  let h: FileSystemDirectoryHandle = handle
  for (let i = 0; i < parts.length - 1; i++) {
    h = await h.getDirectoryHandle(parts[i], { create: true })
  }
  const fileHandle = await h.getFileHandle(parts[parts.length - 1], { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(content)
  await writable.close()
}

async function writeBlob(handle: FileSystemDirectoryHandle, path: string, blob: Blob): Promise<void> {
  const parts = path.split('/')
  let h: FileSystemDirectoryHandle = handle
  for (let i = 0; i < parts.length - 1; i++) {
    h = await h.getDirectoryHandle(parts[i], { create: true })
  }
  const fileHandle = await h.getFileHandle(parts[parts.length - 1], { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(blob)
  await writable.close()
}

export function useFileSystemProject() {
  async function tryRestoreProject(): Promise<boolean> {
    if (!isSupported.value) return false
    const handle = await loadPersistedHandle()
    if (!handle) return false
    try {
      const perm = await handle.queryPermission({ mode: 'readwrite' })
      if (perm === 'granted') {
        dirHandle.value = handle
        return true
      }
      const requested = await handle.requestPermission({ mode: 'readwrite' })
      if (requested === 'granted') {
        dirHandle.value = handle
        return true
      }
    } catch { /* permission denied or handle invalidated */ }
    await clearPersistedHandle()
    return false
  }

  async function openFolder(): Promise<boolean> {
    if (!isSupported.value) {
      lastError.value = '当前浏览器不支持文件系统访问 API，请使用 Chrome 或 Edge'
      return false
    }
    lastError.value = ''
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
      dirHandle.value = handle
      await persistHandle(handle)

      const packText = await readFileText(handle, 'pack.json')
      if (packText) {
        await loadFromFolder()
      }

      return true
    } catch (err: any) {
      if (err.name === 'AbortError') return false
      lastError.value = err.message
      return false
    }
  }

  async function loadFromFolder(): Promise<boolean> {
    if (!dirHandle.value) return false
    loading.value = true
    lastError.value = ''
    try {
      const packText = await readFileText(dirHandle.value, 'pack.json')
      if (!packText) {
        lastError.value = '文件夹中没有 pack.json，请先保存数据到该文件夹'
        return false
      }

      const pack: WorldSmithPack = JSON.parse(packText)

      const customModuleStore = useCustomModuleStore()
      const pluginStore = usePluginStore()
      getExportController(
        {
          modules: customModuleStore.modules,
          addModule: customModuleStore.addModule,
          updateModule: customModuleStore.updateModule,
          removeModule: customModuleStore.removeModule,
        },
        { views: pluginStore.views },
      )

      const ic = getImportController()
      const report = await ic.importPack(pack, 'overwrite')

      if (report.success) {
        const entityStore = useEntityStore()
        const relationStore = useRelationStore()
        await entityStore.loadAll()
        await relationStore.loadAll()
      }

      return report.success
    } catch (err: any) {
      lastError.value = err.message
      return false
    } finally {
      loading.value = false
    }
  }

  async function saveToFolder(): Promise<boolean> {
    if (!dirHandle.value) return false
    saving.value = true
    lastError.value = ''
    try {
      const customModuleStore = useCustomModuleStore()
      const pluginStore = usePluginStore()
      const entityStore = useEntityStore()

      const ec = getExportController(
        {
          modules: customModuleStore.modules,
          addModule: customModuleStore.addModule,
          updateModule: customModuleStore.updateModule,
          removeModule: customModuleStore.removeModule,
        },
        { views: pluginStore.views },
      )

      const pack = await ec.collectAll()
      const packJson = JSON.stringify(pack, null, 2)
      await writeFileText(dirHandle.value, 'pack.json', packJson)

      const manifest = {
        formatVersion: 1,
        exportedAt: pack.manifest.exportedAt,
        appVersion: pack.manifest.appVersion,
        name: pack.manifest.description,
        summary: buildSummary(pack),
        mediaIndex: {} as Record<string, string>,
      }
      await writeFileText(dirHandle.value, 'manifest.json', JSON.stringify(manifest, null, 2))

      await writeMediaFiles(dirHandle.value, entityStore.entities)

      return true
    } catch (err: any) {
      lastError.value = err.message
      return false
    } finally {
      saving.value = false
    }
  }

  async function closeProject(): Promise<void> {
    dirHandle.value = null
    await clearPersistedHandle()
  }

  return {
    dirHandle,
    projectName,
    isProjectOpen,
    isSupported,
    saving,
    loading,
    lastError,
    openFolder,
    loadFromFolder,
    saveToFolder,
    closeProject,
    tryRestoreProject,
  }
}

function buildSummary(pack: WorldSmithPack) {
  const s = pack.serializers
  const count = (key: string, field: string) => {
    const d = s[key] as any
    return d?.total ?? d?.[field]?.length ?? 0
  }
  return {
    entities: count('entities', 'entities'),
    relations: count('relations', 'relations'),
    entityTypes: count('entity-types', 'schemas'),
    relationTypes: count('relation-types', 'schemas'),
    customModules: count('custom-modules', 'modules'),
    mediaFiles: 0,
  }
}

async function writeMediaFiles(handle: FileSystemDirectoryHandle, entities: any[]) {
  const seen = new Set<string>()
  for (const entity of entities) {
    if (entity.avatar && !seen.has(entity.avatar)) {
      seen.add(entity.avatar)
      const blob = await tryFetchBlob(entity.avatar)
      if (blob) {
        const ext = guessExt(entity.avatar, blob.type)
        await writeBlob(handle, `media/avatars/${entity.id}${ext}`, blob)
      }
    }
    if (entity.properties) {
      for (const [, value] of Object.entries(entity.properties)) {
        if (typeof value === 'string' && isLikelyUrl(value) && !seen.has(value)) {
          seen.add(value)
          const blob = await tryFetchBlob(value)
          if (blob) {
            const ext = guessExt(value, blob.type)
            await writeBlob(handle, `media/attachments/${entity.id}${ext}`, blob)
          }
        }
      }
    }
  }
}

function isLikelyUrl(s: string): boolean {
  return s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:') || s.startsWith('blob:')
}

async function tryFetchBlob(url: string): Promise<Blob | null> {
  try {
    if (url.startsWith('data:') || url.startsWith('blob:')) {
      const res = await fetch(url)
      return res.ok ? await res.blob() : null
    }
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const res = await fetch(url, { mode: 'cors' })
      return res.ok ? await res.blob() : null
    }
    return null
  } catch {
    return null
  }
}

function guessExt(url: string, mimeType: string): string {
  if (mimeType) {
    const map: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/gif': '.gif',
      'image/svg+xml': '.svg',
      'image/webp': '.webp',
      'image/bmp': '.bmp',
    }
    if (map[mimeType]) return map[mimeType]
  }
  if (url.startsWith('data:')) {
    const m = url.match(/^data:image\/(\w+)/)
    if (m) return '.' + (m[1] === 'jpeg' ? 'jpg' : m[1])
  }
  try {
    const u = new URL(url)
    const segs = u.pathname.split('/').filter(Boolean)
    const last = segs[segs.length - 1]
    if (last && last.includes('.')) return '.' + last.split('.').pop()
  } catch { /* ignore */ }
  return '.bin'
}
