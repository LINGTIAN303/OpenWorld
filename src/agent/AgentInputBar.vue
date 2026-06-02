<template>
  <div
    class="chat-input-bar agent-panel"
    :class="{ 'drag-over': isDragOver }"
    :style="inputBarStyle"
    @dragover.prevent="isDragOver = true"
    @dragleave="isDragOver = false"
    @drop.prevent="onDrop"
  >
    <button class="menu-btn" @click="emit('toggle-menu')" ref="menuBtnRef" title="AI 助手设置"><WsIcon name="settings" size="sm" /></button>
    <div class="input-wrap">
      <div v-if="attachments.length" class="attachments-preview">
        <div v-for="(att, i) in attachments" :key="i" class="att-item" :class="{ 'att-image': att.type === 'image', 'att-file': att.type === 'file' }">
          <img v-if="att.type === 'image' && att.previewUrl" :src="att.previewUrl" class="att-thumb" />
          <span v-if="att.type === 'file'" class="att-file-icon"><WsIcon name="manuscript" size="xs" /></span>
          <span class="att-name">{{ att.name }}</span>
          <button class="att-remove" @click="removeAttachment(i)">✕</button>
        </div>
      </div>
      <textarea
        ref="inputRef"
        :value="inputText"
        @input="onInput"
        :placeholder="visionSupported ? '输入消息…  / 唤起命令  拖拽文件或图片' : '输入消息…  / 唤起命令  拖拽文件'"
        rows="1"
        @keydown.enter.exact="onEnter"
        @keydown.shift.enter.stop
        @keydown.up.prevent="emit('slash-up')"
        @keydown.down.prevent="emit('slash-down')"
        @keydown.escape="slashModeLocal = false"
        @paste="onPaste"
      ></textarea>
    </div>
    <button v-if="!isStreaming" class="send-btn" :class="{ bounce: sendBouncing }" @click="doSend" :disabled="!inputText.trim() && !attachments.length">➤</button>
    <button v-else class="stop-btn" @click="emit('abort')">⏹</button>
    <div v-if="visionWarning" class="vision-warning">{{ visionWarning }}</div>
  </div>

  <div v-if="slashMode" class="slash-list agent-panel" :style="slashStyle">
    <div
      v-for="(cmd, i) in filteredCommands"
      :key="cmd.id"
      class="slash-item"
      :class="{ active: slashIndex === i }"
      role="button"
      tabindex="0"
      @click="emit('select-slash', cmd)"
      @keydown.enter="emit('select-slash', cmd)"
      @mouseenter="emit('slash-down')"
    >
      <span class="slash-icon">{{ cmd.icon }}</span>
      <span class="slash-label">{{ cmd.label }}</span>
      <span class="slash-desc">{{ cmd.description }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import WsIcon from '../ui/WsIcon.vue'
import { modelSupportsVision } from './modelRegistry'

const props = defineProps<{
  isStreaming: boolean
  inputBarWidth: number
  filteredCommands: Array<{ id: string; icon: string; label: string; description: string }>
  slashMode: boolean
  slashIndex: number
  currentModelId: string
  hasVisionSubAgent: boolean
}>()

const emit = defineEmits<{
  send: [text: string, attachments: any[]]
  abort: []
  'toggle-menu': []
  'update:inputText': [value: string]
  'select-slash': [cmd: any]
  'slash-up': []
  'slash-down': []
}>()

interface FileAttachment {
  type: 'image' | 'file'
  name: string
  mimeType: string
  data: string
  previewUrl?: string
  textContent?: string
}

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
const TEXT_EXTENSIONS = ['.txt', '.md', '.json', '.csv', '.xml', '.yaml', '.yml', '.toml', '.ini', '.log', '.html', '.css', '.js', '.ts', '.vue', '.py', '.rs', '.go', '.java', '.c', '.cpp', '.h', '.sh', '.sql']
const DOC_EXTENSIONS = ['.docx']
const PDF_EXTENSIONS = ['.pdf']
const MAX_IMAGE_SIZE = 20 * 1024 * 1024
const MAX_IMAGE_COUNT = 10
const MAX_IMAGE_DIMENSION = 2048

const inputText = ref('')
const attachments = ref<FileAttachment[]>([])
const isDragOver = ref(false)
const inputRef = ref<HTMLTextAreaElement>()
const menuBtnRef = ref<HTMLButtonElement>()
const slashModeLocal = ref(false)
const sendBouncing = ref(false)
const visionWarning = ref('')

const visionSupported = computed(() => modelSupportsVision(props.currentModelId) || props.hasVisionSubAgent)

const inputBarStyle = computed(() => ({
  width: `${props.inputBarWidth}px`,
}))

const slashStyle = computed(() => {
  const el = inputRef.value
  if (!el) return {}
  const rect = el.getBoundingClientRect()
  return {
    left: `${rect.left}px`,
    bottom: `${window.innerHeight - rect.top + 4}px`,
    width: `${rect.width}px`,
  }
})

function processFile(file: File): void {
  if (IMAGE_TYPES.includes(file.type)) {
    if (!visionSupported.value) {
      visionWarning.value = `当前模型不支持图片理解，请切换到支持视觉的模型或在设置中配置视觉 SubAgent`
      setTimeout(() => { visionWarning.value = '' }, 4000)
      return
    }
    const currentImageCount = attachments.value.filter(a => a.type === 'image').length
    if (currentImageCount >= MAX_IMAGE_COUNT) {
      visionWarning.value = `最多同时发送 ${MAX_IMAGE_COUNT} 张图片`
      setTimeout(() => { visionWarning.value = '' }, 4000)
      return
    }
    if (file.size > MAX_IMAGE_SIZE) {
      visionWarning.value = `图片大小不能超过 ${MAX_IMAGE_SIZE / 1024 / 1024}MB`
      setTimeout(() => { visionWarning.value = '' }, 4000)
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      compressImage(dataUrl, file.type).then(compressed => {
        attachments.value.push({
          type: 'image',
          name: file.name,
          mimeType: compressed.mimeType,
          data: compressed.base64,
          previewUrl: dataUrl,
        })
      })
    }
    reader.readAsDataURL(file)
    return
  }

  const ext = '.' + file.name.split('.').pop()!.toLowerCase()

  if (DOC_EXTENSIONS.includes(ext)) {
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const mammoth = await import('mammoth')
        const result = await mammoth.extractRawText({ arrayBuffer: reader.result as ArrayBuffer })
        attachments.value.push({
          type: 'file',
          name: file.name,
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          data: '',
          textContent: result.value || '[Word 文件内容为空]',
        })
      } catch (err) {
        attachments.value.push({
          type: 'file',
          name: file.name,
          mimeType: file.type,
          data: '',
          textContent: `[Word 文件解析失败: ${(err as Error).message}]`,
        })
      }
    }
    reader.readAsArrayBuffer(file)
    return
  }

  if (PDF_EXTENSIONS.includes(ext)) {
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = ''
        const pdf = await pdfjsLib.getDocument({ data: reader.result as ArrayBuffer }).promise
        const pages: string[] = []
        for (let i = 1; i <= Math.min(pdf.numPages, 50); i++) {
          const page = await pdf.getPage(i)
          const content = await page.getTextContent()
          const text = content.items.map((item: any) => item.str).join(' ')
          if (text.trim()) pages.push(text)
        }
        attachments.value.push({
          type: 'file',
          name: file.name,
          mimeType: 'application/pdf',
          data: '',
          textContent: pages.join('\n\n---\n\n') || '[PDF 文件内容为空或为扫描件]',
        })
      } catch (err) {
        attachments.value.push({
          type: 'file',
          name: file.name,
          mimeType: file.type,
          data: '',
          textContent: `[PDF 文件解析失败: ${(err as Error).message}]`,
        })
      }
    }
    reader.readAsArrayBuffer(file)
    return
  }

  if (TEXT_EXTENSIONS.includes(ext)) {
    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      attachments.value.push({
        type: 'file',
        name: file.name,
        mimeType: file.type || 'text/plain',
        data: '',
        textContent: text,
      })
    }
    reader.readAsText(file)
    return
  }

  attachments.value.push({
    type: 'file',
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    data: '',
    textContent: `[不支持的文件类型: ${file.type || '未知'}]`,
  })
}

function removeAttachment(index: number): void {
  attachments.value.splice(index, 1)
}

function onInput(e: Event): void {
  inputText.value = (e.target as HTMLTextAreaElement).value
  emit('update:inputText', inputText.value)
  autoResize()
}

function onEnter(e: KeyboardEvent): void {
  e.preventDefault()
  if (props.slashMode && props.filteredCommands.length > 0) {
    emit('select-slash', props.filteredCommands[props.slashIndex])
    return
  }
  doSend()
}

function onPaste(e: ClipboardEvent): void {
  if (!e.clipboardData?.items) return
  const imageItems = Array.from(e.clipboardData.items).filter(item => item.type.startsWith('image/'))
  if (imageItems.length === 0) return
  if (!visionSupported.value) {
    visionWarning.value = `当前模型不支持图片理解，请切换到支持视觉的模型或在设置中配置视觉 SubAgent`
    setTimeout(() => { visionWarning.value = '' }, 4000)
    return
  }
  const currentCount = attachments.value.filter(a => a.type === 'image').length
  const remaining = MAX_IMAGE_COUNT - currentCount
  if (remaining <= 0) {
    visionWarning.value = `最多同时发送 ${MAX_IMAGE_COUNT} 张图片`
    setTimeout(() => { visionWarning.value = '' }, 4000)
    return
  }
  const toProcess = imageItems.slice(0, remaining)
  for (const item of toProcess) {
    const file = item.getAsFile()
    if (file) processFile(file)
  }
  if (imageItems.length > remaining) {
    visionWarning.value = `已添加 ${remaining} 张图片，已达上限 ${MAX_IMAGE_COUNT}`
    setTimeout(() => { visionWarning.value = '' }, 4000)
  }
}

function onDrop(e: DragEvent): void {
  isDragOver.value = false
  if (!e.dataTransfer?.files.length) return
  for (const file of Array.from(e.dataTransfer.files)) {
    processFile(file)
  }
}

function doSend(): void {
  const text = inputText.value.trim()
  if ((!text && !attachments.value.length) || props.isStreaming) return
  sendBouncing.value = true
  setTimeout(() => { sendBouncing.value = false }, 300)
  const hasImages = attachments.value.some(a => a.type === 'image')
  if (hasImages && !visionSupported.value) {
    visionWarning.value = `当前模型不支持图片理解，请切换到支持视觉的模型或在设置中配置视觉 SubAgent`
    setTimeout(() => { visionWarning.value = '' }, 4000)
    return
  }
  const currentAttachments = [...attachments.value]
  inputText.value = ''
  attachments.value = []
  emit('update:inputText', '')
  emit('send', text, currentAttachments)
}

function autoResize(): void {
  const el = inputRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 120) + 'px'
}

async function compressImage(dataUrl: string, mimeType: string): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width <= MAX_IMAGE_DIMENSION && height <= MAX_IMAGE_DIMENSION) {
        const base64 = dataUrl.split(',')[1]
        resolve({ base64, mimeType })
        return
      }
      const scale = MAX_IMAGE_DIMENSION / Math.max(width, height)
      width = Math.round(width * scale)
      height = Math.round(height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        const base64 = dataUrl.split(',')[1]
        resolve({ base64, mimeType })
        return
      }
      ctx.drawImage(img, 0, 0, width, height)
      const outputMime = mimeType === 'image/png' ? 'image/png' : 'image/jpeg'
      const outputDataUrl = canvas.toDataURL(outputMime, 0.85)
      const base64 = outputDataUrl.split(',')[1]
      resolve({ base64, mimeType: outputMime })
    }
    img.onerror = () => {
      const base64 = dataUrl.split(',')[1]
      resolve({ base64, mimeType })
    }
    img.src = dataUrl
  })
}

defineExpose({ inputRef, menuBtnRef })
</script>

<style scoped>
.chat-input-bar {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: flex-end;
  gap: 6px;
  padding: 8px 12px;
  background: var(--agent-bg, rgba(26, 26, 46, 0.75));
  backdrop-filter: blur(var(--agent-blur, 16px));
  border: 1px solid var(--agent-border, rgba(58, 58, 106, 0.4));
  border-radius: var(--agent-radius, 14px);
  box-shadow: 0 0 0 1px rgba(255,255,255,0.06), 0 4px 20px rgba(0,0,0,0.3);
  z-index: 9998;
  pointer-events: auto;
}

.menu-btn {
  width: 32px; height: 32px;
  border: 1px solid var(--agent-border-color, #444);
  border-radius: var(--agent-radius-sm, 10px);
  background: var(--agent-hover-bg, rgba(255,255,255,0.04));
  color: var(--agent-text, #e0e0e0); cursor: pointer; font-size: var(--font-size-lg);
  display: flex; align-items: center; justify-content: center;
  transition: border-color 0.15s;
  flex-shrink: 0;
}
.menu-btn:hover { border-color: var(--agent-primary, #6c5ce7) }
.menu-btn.active {
  border-color: var(--agent-primary, #6c5ce7);
  color: var(--agent-primary, #6c5ce7);
  background: var(--agent-accent-bg, rgba(108, 92, 231, 0.15));
}

.input-wrap { flex: 1 }
.input-wrap textarea {
  width: 100%; resize: none;
  border: 1px solid var(--agent-border-color, rgba(255,255,255,0.15));
  border-radius: var(--agent-radius-sm, 12px);
  padding: 8px 12px;
  background: var(--agent-input-bg, rgba(255,255,255,0.06));
  backdrop-filter: blur(8px);
  color: var(--agent-text, #e0e0e0);
  font-size: var(--font-size-base); line-height: 1.4; outline: none;
  font-family: var(--agent-font, sans-serif);
  transition: border-color 0.15s;
}
.input-wrap textarea:focus { border-color: var(--agent-primary, #6c5ce7) }
.input-wrap textarea::placeholder { color: var(--agent-text-tertiary, #666) }

.attachments-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px 0;
  max-height: 120px;
  overflow-y: auto;
}

.att-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  background: var(--agent-hover-bg, rgba(255,255,255,0.06));
  border: 1px solid var(--agent-border, rgba(58, 58, 106, 0.3));
  border-radius: 8px;
  font-size: var(--font-size-sm);
  color: var(--agent-text-secondary, #aaa);
  max-width: 160px;
  overflow: hidden;
}

.att-image {
  padding: 2px 4px 2px 2px;
}

.att-thumb {
  width: 32px;
  height: 32px;
  object-fit: cover;
  border-radius: 4px;
  flex-shrink: 0;
}

.att-file-icon {
  font-size: var(--font-size-base);
  flex-shrink: 0;
}

.att-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.att-remove {
  background: none;
  border: none;
  color: var(--agent-text-tertiary, #666);
  cursor: pointer;
  font-size: var(--font-size-xs);
  padding: 0 2px;
  flex-shrink: 0;
  transition: color 0.1s;
}

.att-remove:hover {
  color: var(--danger, #e74c3c);
}

.send-btn, .stop-btn {
  flex-shrink: 0; width: 32px; height: 32px;
  border: none; border-radius: var(--agent-radius-sm, 10px);
  cursor: pointer; font-size: var(--font-size-base);
  display: flex; align-items: center; justify-content: center;
}
.send-btn { background: var(--agent-primary, #6c5ce7); color: #fff }
.send-btn:disabled { opacity: 0.35; cursor: default }
.stop-btn { background: var(--danger, #e74c3c); color: #fff }

.slash-list {
  position: fixed;
  max-height: 240px;
  overflow-y: auto;
  background: var(--agent-bg, rgba(26, 26, 46, 0.92));
  border: 1px solid var(--agent-border, rgba(58, 58, 106, 0.4));
  border-radius: var(--agent-radius-sm, 10px);
  box-shadow: var(--shadow-lg, 0 4px 20px rgba(0,0,0,0.4));
  z-index: 10002;
  pointer-events: auto;
}
.slash-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; cursor: pointer; font-size: var(--font-size-sm);
  color: var(--agent-text, #e0e0e0); transition: background 0.1s;
  font-family: var(--agent-font, sans-serif);
}
.slash-item:first-child { border-radius: 10px 10px 0 0 }
.slash-item:last-child { border-radius: 0 0 10px 10px }
.slash-item.active { background: var(--agent-accent-bg, rgba(108,92,231,0.2)) }
.slash-icon { font-size: var(--font-size-base) }
.slash-label { font-weight: var(--font-weight-medium) }
.slash-desc { flex: 1; text-align: right; font-size: var(--font-size-xs); opacity: 0.5 }

.chat-input-bar.drag-over {
  border-color: var(--agent-primary, #6c5ce7);
  box-shadow: 0 0 0 2px rgba(108, 92, 231, 0.3), 0 4px 20px rgba(0,0,0,0.3);
}

.vision-warning {
  position: absolute;
  top: -36px;
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 14px;
  background: var(--agent-bg, rgba(26, 26, 46, 0.92));
  border: 1px solid var(--warning, #f0ad4e);
  border-radius: 8px;
  color: var(--warning, #f0ad4e);
  font-size: var(--font-size-xs);
  white-space: nowrap;
  pointer-events: none;
  animation: visionWarningIn 0.2s ease-out;
}

@keyframes visionWarningIn {
  from { opacity: 0; transform: translateX(-50%) translateY(4px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

.send-btn.bounce {
  animation: ws-send-bounce 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes ws-send-bounce {
  0% { transform: scale(1) }
  40% { transform: scale(0.85) }
  100% { transform: scale(1) }
}


</style>
