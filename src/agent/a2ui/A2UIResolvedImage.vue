<template>
  <img
    v-if="resolvedSrc"
    :src="resolvedSrc"
    :alt="alt"
    :class="imgClass"
    :style="imgStyle"
    @click="$emit('click', $event)"
  />
  <div v-else-if="loading" :class="imgClass" class="a2ui-img-loading">
    <span class="a2ui-img-spinner" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { useFileStore } from '@worldsmith/entity-core'

const props = defineProps<{
  src: string | undefined | null
  alt?: string
  imgClass?: string
  imgStyle?: Record<string, string>
}>()

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

const fileStore = useFileStore()
const resolvedSrc = ref<string | null>(null)
const loading = ref(false)

let currentBlobUrl: string | null = null
let resolveVersion = 0

function revokeCurrent() {
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl)
    currentBlobUrl = null
  }
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

function parseFileRef(raw: string): { type: 'fileId'; fileId: string } | { type: 'path'; path: string } | null {
  if (!raw.startsWith('file:')) return null
  const rest = raw.slice(5)
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

async function resolve() {
  const version = ++resolveVersion
  const raw = props.src

  if (!raw) {
    revokeCurrent()
    resolvedSrc.value = null
    loading.value = false
    return
  }

  const ref = parseFileRef(raw)

  if (!ref) {
    revokeCurrent()
    resolvedSrc.value = raw
    loading.value = false
    return
  }

  loading.value = true
  resolvedSrc.value = null

  try {
    let fileId: string | undefined

    if (ref.type === 'fileId') {
      fileId = ref.fileId
    } else {
      const fileRecord = await fileStore.getByPath(ref.path)
      if (version !== resolveVersion) return
      if (fileRecord) {
        fileId = fileRecord.id
      } else {
        const segments = ref.path.split('/')
        const maybeId = segments[segments.length - 1]?.replace(/\.[^.]+$/, '')
        if (maybeId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(maybeId)) {
          fileId = maybeId
        }
      }
    }

    if (!fileId) {
      if (version !== resolveVersion) return
      resolvedSrc.value = null
      loading.value = false
      return
    }

    const content = await fileStore.getContent(fileId)
    if (version !== resolveVersion) return

    if (!content?.binaryData) {
      resolvedSrc.value = null
      loading.value = false
      return
    }

    revokeCurrent()
    const fileRecord = await fileStore.getById(fileId)
    const mimeType = fileRecord?.mimeType || 'image/png'
    const blob = base64ToBlob(content.binaryData, mimeType)
    currentBlobUrl = URL.createObjectURL(blob)
    resolvedSrc.value = currentBlobUrl
  } catch {
    if (version !== resolveVersion) return
    resolvedSrc.value = null
  } finally {
    if (version === resolveVersion) {
      loading.value = false
    }
  }
}

watch(() => props.src, resolve, { immediate: true })

onUnmounted(revokeCurrent)
</script>

<style scoped>
.a2ui-img-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--agent-bg-tertiary, var(--color-bg-elevated));
  border-radius: var(--radius-sm, 4px);
  min-height: 60px;
}
.a2ui-img-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--agent-border, var(--color-border));
  border-top-color: var(--agent-accent, var(--color-primary));
  border-radius: 50%;
  animation: ws-spin 0.6s linear infinite;
}
</style>
