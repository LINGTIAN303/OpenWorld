import { ref } from 'vue'
import { defineStore } from 'pinia'
import { storage } from '../core/StorageBackend'
import type { ProjectFile, ProjectFileContent } from '../types/file'

export const useFileStore = defineStore('files', () => {
  const files = ref<ProjectFile[]>([])
  const loading = ref(false)

  async function loadAll(): Promise<void> {
    loading.value = true
    try {
      files.value = await storage.getAllFiles()
    } finally {
      loading.value = false
    }
  }

  async function getById(id: string): Promise<ProjectFile | undefined> {
    const cached = files.value.find(f => f.id === id)
    if (cached) return cached
    return storage.getFile(id)
  }

  async function getByPath(path: string): Promise<ProjectFile | undefined> {
    const cached = files.value.find(f => f.path === path)
    if (cached) return cached
    return storage.getFileByPath(path)
  }

  async function getByEntity(entityId: string): Promise<ProjectFile[]> {
    return storage.getFilesByEntity(entityId)
  }

  async function getContent(id: string): Promise<ProjectFileContent | undefined> {
    return storage.getFileContent(id)
  }

  async function add(
    name: string,
    path: string,
    mimeType: string,
    size: number,
    content: string,
    entityId?: string,
    tags: string[] = []
  ): Promise<string> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const file: ProjectFile = {
      id,
      name,
      path,
      mimeType,
      size,
      entityId,
      tags,
      createdAt: now,
      updatedAt: now,
    }
    const fileContent: ProjectFileContent = {
      id,
      textContent: mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType === 'application/xml' || mimeType === 'application/javascript' || mimeType === 'application/typescript' ? content : undefined,
      binaryData: !mimeType.startsWith('text/') && mimeType !== 'application/json' && mimeType !== 'application/xml' && mimeType !== 'application/javascript' && mimeType !== 'application/typescript' ? content : undefined,
    }
    await storage.putFile(file, fileContent)
    files.value = [...files.value, file]
    return id
  }

  async function update(id: string, changes: Partial<ProjectFile>): Promise<void> {
    await storage.updateFile(id, { ...changes, updatedAt: new Date().toISOString() })
    const idx = files.value.findIndex(f => f.id === id)
    if (idx !== -1) {
      files.value = files.value.map((f, i) => i === idx ? { ...f, ...changes, updatedAt: new Date().toISOString() } : f)
    }
  }

  async function remove(id: string): Promise<void> {
    await storage.deleteFile(id)
    files.value = files.value.filter(f => f.id !== id)
  }

  async function associateEntity(fileId: string, entityId: string): Promise<void> {
    await update(fileId, { entityId })
  }

  async function disassociateEntity(fileId: string): Promise<void> {
    await update(fileId, { entityId: undefined })
  }

  async function getAllFiles(): Promise<ProjectFile[]> {
    return storage.getAllFiles()
  }

  return {
    files,
    loading,
    loadAll,
    getById,
    getByPath,
    getByEntity,
    getContent,
    add,
    update,
    remove,
    associateEntity,
    disassociateEntity,
    getAllFiles,
  }
})
