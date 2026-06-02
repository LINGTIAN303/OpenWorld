import { ref, watch, onUnmounted, type Ref } from 'vue'
import { useFileStore } from '../stores/fileStore'

export interface ImageRef {
  fileId?: string
  url?: string
}

function parseImageRef(value: unknown): ImageRef | null {
  if (!value) return null
  if (typeof value === 'string') {
    if (value.startsWith('file://')) {
      return { fileId: undefined, url: undefined }
    }
    if (value.startsWith('file:')) {
      return { fileId: value.slice(5) }
    }
    return { url: value }
  }
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>
    if (obj.fileId && typeof obj.fileId === 'string') {
      return { fileId: obj.fileId, url: obj.thumbnail as string | undefined }
    }
    if (obj.url && typeof obj.url === 'string') {
      return { url: obj.url }
    }
  }
  return null
}

function parseFilePathRef(value: string): { type: 'fileId'; fileId: string } | { type: 'path'; path: string } | null {
  if (!value.startsWith('file:')) return null
  const rest = value.slice(5)
  if (rest.startsWith('//')) {
    const path = decodeURIComponent(rest.slice(2))
    return { type: 'path', path }
  }
  if (rest.startsWith('/')) {
    const path = decodeURIComponent(rest.slice(1))
    return { type: 'path', path }
  }
  return { type: 'fileId', fileId: rest }
}

export function useEntityImage(imageValue: Ref<unknown>) {
  const fileStore = useFileStore()
  const imageUrl = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  let currentBlobUrl: string | null = null
  let resolveVersion = 0

  function revokeCurrent() {
    if (currentBlobUrl) {
      URL.revokeObjectURL(currentBlobUrl)
      currentBlobUrl = null
    }
  }

  async function resolve() {
    const version = ++resolveVersion
    const raw = imageValue.value

    if (!raw || typeof raw !== 'string') {
      const ref = parseImageRef(raw)
      if (!ref) {
        revokeCurrent()
        imageUrl.value = null
        return
      }
      if (ref.url) {
        revokeCurrent()
        imageUrl.value = ref.url
        return
      }
      if (ref.fileId) {
        await resolveByFileId(ref.fileId, version)
      }
      return
    }

    const pathRef = parseFilePathRef(raw)

    if (!pathRef) {
      const simpleRef = parseImageRef(raw)
      if (simpleRef?.url) {
        revokeCurrent()
        imageUrl.value = simpleRef.url
        return
      }
      revokeCurrent()
      imageUrl.value = null
      return
    }

    if (pathRef.type === 'fileId') {
      await resolveByFileId(pathRef.fileId, version)
      return
    }

    loading.value = true
    error.value = null
    try {
      const fileRecord = await fileStore.getByPath(pathRef.path)
      if (version !== resolveVersion) return

      if (fileRecord) {
        await resolveByFileId(fileRecord.id, version)
        return
      }

      const segments = pathRef.path.split('/')
      const maybeId = segments[segments.length - 1]?.replace(/\.[^.]+$/, '')
      if (maybeId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(maybeId)) {
        await resolveByFileId(maybeId, version)
        return
      }

      if (version !== resolveVersion) return
      imageUrl.value = null
      error.value = '图片文件未找到'
    } catch (e: any) {
      if (version !== resolveVersion) return
      error.value = e?.message || '图片加载失败'
      imageUrl.value = null
    } finally {
      if (version === resolveVersion) {
        loading.value = false
      }
    }
  }

  async function resolveByFileId(fileId: string, version: number) {
    loading.value = true
    error.value = null
    try {
      const content = await fileStore.getContent(fileId)
      if (version !== resolveVersion) return
      if (!content?.binaryData) {
        imageUrl.value = null
        error.value = '图片数据未找到'
        return
      }
      revokeCurrent()
      const fileRecord = await fileStore.getById(fileId)
      const mimeType = fileRecord?.mimeType || 'image/png'
      const blob = base64ToBlob(content.binaryData, mimeType)
      currentBlobUrl = URL.createObjectURL(blob)
      imageUrl.value = currentBlobUrl
    } catch (e: any) {
      if (version !== resolveVersion) return
      error.value = e?.message || '图片加载失败'
      imageUrl.value = null
    } finally {
      if (version === resolveVersion) {
        loading.value = false
      }
    }
  }

  watch(imageValue, resolve, { immediate: true })
  onUnmounted(revokeCurrent)

  return { imageUrl, loading, error }
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteString = atob(base64)
  const ab = new ArrayBuffer(byteString.length)
  const ia = new Uint8Array(ab)
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i)
  }
  return new Blob([ab], { type: mimeType })
}
