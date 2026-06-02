<template>
  <div class="persona-mirror">
    <div class="panel-header">
      <h3 class="panel-title" :style="{ fontFamily: fontFamily }">人格镜</h3>
      <button class="panel-close-btn" @click="emit('close')" title="关闭">✕</button>
    </div>
    <div class="panel-body">
      <div class="section-label">Agent 自我认知</div>
      <div class="persona-card">
        <PersonaAvatarCanvas
          :character="persona.avatar || persona.name.charAt(0)"
          :font-family="fontFamily"
          :accent-color="profile.accentColor"
          :size="48"
        />
        <div class="persona-details">
          <div class="detail-row"><span class="detail-key">名字</span><span class="detail-val" :style="{ fontFamily: fontFamily }">{{ persona.name }}</span></div>
          <div class="detail-row"><span class="detail-key">状态</span><span class="detail-val"><WsIcon :name="moodIcon" size="xs" /> {{ moodLabel }}</span></div>
        </div>
      </div>

      <div class="section-divider"></div>
      <div class="section-label">用户偏好</div>
      <div v-if="userPreferences.length === 0" class="panel-empty">Agent 尚未记录用户偏好</div>
      <div v-for="pref in userPreferences" :key="pref.key" class="pref-item">
        <span class="pref-key">{{ pref.key }}</span>
        <span class="pref-value">{{ pref.value }}</span>
      </div>

      <div class="section-divider"></div>
      <div class="section-label">自我反思</div>
      <div v-if="reflections.length === 0" class="panel-empty">反思记录将在对话中自动生成</div>
      <div v-for="ref in reflections" :key="ref.id" class="reflection-item">
        <div class="reflection-path">{{ getFileName(ref.path) }}</div>
        <div v-if="ref.summary" class="reflection-summary">{{ ref.summary }}</div>
        <div class="reflection-meta">
          <span>{{ formatTime(ref.updatedAt) }}</span>
          <span>{{ ref.accessCount }}</span>
        </div>
      </div>
      <div class="section-divider"></div>
      <div class="section-label">字体设置</div>
      <div class="font-settings">
        <div class="font-current">
          <span class="font-label">当前字体</span>
          <span class="font-value">{{ profile.fontFamily }}</span>
        </div>
        <div class="font-actions">
          <button class="font-btn" @click="showFontSelector = true">选择字体</button>
          <button class="font-btn" @click="installWsfont">安装字体包</button>
        </div>
        <div class="profile-selector">
          <span class="font-label">人格预设</span>
          <div class="profile-list">
            <button
              v-for="p in allProfiles"
              :key="p.id"
              class="profile-btn"
              :class="{ active: p.id === activeProfileId }"
              @click="setActiveProfile(p.id)"
            >{{ p.name }}</button>
          </div>
        </div>
      </div>
    </div>
    <Teleport to="body">
      <div v-if="showFontSelector" class="font-selector-overlay" @click.stop.self="showFontSelector = false">
        <FontSelectorDropdown
          :visible="showFontSelector"
          :model-value="profile.fontFamily"
          @close="showFontSelector = false"
          @update:model-value="onFontSelected"
          @select-windfonts="onWindFontsSelected"
        />
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAgentPersona } from '../composables/useAgentPersona'
import { usePersonaFont } from '../composables/usePersonaFont'
import PersonaAvatarCanvas from '../components/PersonaAvatarCanvas.vue'
import FontSelectorDropdown from '../components/FontSelectorDropdown.vue'
import { usePersonaFontStore } from '../stores/persona-font-store'
import WsIcon from '../../ui/WsIcon.vue'
import { loadMemory } from '../../../worldsmith-agent/src/tools/memory-internal'
import { kbList } from '../../../worldsmith-agent/src/kb/kb-store'
import type { KBEntry } from '../../../worldsmith-agent/src/kb/kb-store'

const emit = defineEmits<{ close: [] }>()

const { persona, moodIcon, moodLabel } = useAgentPersona()
const { fontFamily, profile } = usePersonaFont()
const fontStore = usePersonaFontStore()
const { allProfiles, activeProfileId, setActiveProfile } = fontStore
const showFontSelector = ref(false)

function onFontSelected(family: string) {
  fontStore.addCustomProfile({
    id: `custom-${family}`,
    name: family,
    fontFamily: family,
    fallbackFamily: 'sans-serif',
    fontCategory: 'base',
    sizeScale: 1.0,
    weightDefault: 'medium',
    letterSpacing: 'normal',
    animationStyle: { messageEnter: 'fadeIn', panelTransition: 'smooth', notificationStyle: 'pulse' },
    accentColor: profile.accentColor,
    fontSource: { type: 'system' },
  })
  fontStore.setActiveProfile(`custom-${family}`)
  showFontSelector.value = false
}

interface WindFontsItem {
  fontFamily: string
  name: string
  englishName: string
  categoryName: string
  licenseType: string
  weightKeys: string[]
}

function onWindFontsSelected(font: WindFontsItem) {
  const categoryMap: Record<string, 'base' | 'serif' | 'mono' | 'display'> = {
    '无衬线字体': 'base',
    '衬线': 'serif',
    '宋体': 'serif',
    '手写体': 'display',
    '隶书': 'display',
    'Mono': 'mono',
    '其他': 'base',
  }
  const fallbackMap: Record<string, string> = {
    'base': 'sans-serif',
    'serif': 'serif',
    'mono': 'monospace',
    'display': 'cursive',
  }
  const cat = categoryMap[font.categoryName] || 'base'
  const fallback = fallbackMap[cat] || 'sans-serif'
  const weight = font.weightKeys.includes('Regular') ? 'Regular' : font.weightKeys[0]

  fontStore.addCustomProfile({
    id: `wf-${font.fontFamily}`,
    name: font.name,
    fontFamily: font.fontFamily,
    fallbackFamily: fallback,
    fontCategory: cat,
    sizeScale: 1.0,
    weightDefault: 'medium',
    letterSpacing: 'normal',
    animationStyle: { messageEnter: 'fadeIn', panelTransition: 'smooth', notificationStyle: 'pulse' },
    accentColor: profile.accentColor,
    fontSource: { type: 'windfonts', weight },
  })
  fontStore.setActiveProfile(`wf-${font.fontFamily}`)
  showFontSelector.value = false
}

async function installWsfont() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.wsfont,.zip'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      const buffer = await file.arrayBuffer()
      const { unpackWsFont, register, loadFont } = await import('@worldsmith/font-kit')
      const { manifest } = await unpackWsFont(buffer)
      const profileId = `custom-${Date.now()}`
      fontStore.addCustomProfile({
        id: profileId,
        name: manifest.displayName || manifest.family,
        fontFamily: manifest.family,
        fallbackFamily: 'sans-serif',
        fontCategory: 'display',
        sizeScale: 1.0,
        weightDefault: 'medium',
        letterSpacing: 'normal',
        animationStyle: { messageEnter: 'fadeIn', panelTransition: 'smooth', notificationStyle: 'pulse' },
        accentColor: profile.accentColor,
        fontSource: { type: 'wsfont', path: file.name },
      })
      fontStore.setActiveProfile(profileId)
    } catch (err) {
      console.error('字体包安装失败:', err)
    }
  }
  input.click()
}

interface UserPref { key: string; value: string }

const userPreferences = ref<UserPref[]>([])
const reflections = ref<KBEntry[]>([])

function getFileName(path: string): string {
  return path.includes('/') ? path.substring(path.lastIndexOf('/') + 1) : path
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

onMounted(async () => {
  try {
    const mems = loadMemory()
    const fromMemory = mems
      .filter(m => m.tags.some(t => ['preference', 'decision', '偏好', '决策'].includes(t)))
      .map(m => ({ key: m.key, value: m.value.slice(0, 80) }))

    const all = await kbList()
    const fromKB = all
      .filter(e => e.tags.some(t => ['preference', 'decision'].includes(t)) || e.path.startsWith('profile/'))
      .filter(e => !e.path.endsWith('/.dir'))
      .map(e => ({ key: e.path, value: (e.summary || e.path).slice(0, 80) }))

    const seen = new Set<string>()
    userPreferences.value = [...fromMemory, ...fromKB].filter(p => {
      if (seen.has(p.key)) return false
      seen.add(p.key)
      return true
    })

    reflections.value = all.filter(e =>
      e.path.startsWith('reflections/') && !e.path.endsWith('/.dir')
    )
  } catch {}
})
</script>

<style scoped>
.persona-mirror {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--color-border);
}

.panel-close-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
}
.panel-close-btn:hover {
  background: var(--color-surface);
  color: var(--color-text);
}

.panel-title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  margin: 0;
  letter-spacing: var(--letter-spacing-wide);
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 14px;
}

.panel-empty {
  text-align: center;
  color: var(--color-text-tertiary);
  padding: 16px;
  font-size: var(--font-size-xs);
}

.section-label {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.section-divider {
  height: 1px;
  background: var(--color-border);
  margin: 12px 0;
}

.persona-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px;
  background: var(--color-surface);
  border-radius: 10px;
}

.persona-avatar-large {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--color-primary);
  color: var(--color-text-inverse);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-size-2xl);
  font-weight: 700;
  flex-shrink: 0;
}

.persona-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-row {
  display: flex;
  gap: 8px;
  font-size: var(--font-size-xs);
}

.detail-key {
  color: var(--color-text-tertiary);
  min-width: 40px;
}

.detail-val {
  color: var(--color-text);
  font-weight: 500;
}

.pref-item {
  padding: 6px 10px;
  border-radius: 6px;
  margin-bottom: 4px;
  font-size: var(--font-size-xs);
}
.pref-item:hover {
  background: var(--color-surface);
}

.pref-key {
  color: var(--color-text);
  font-weight: 500;
  margin-right: 8px;
}

.pref-value {
  color: var(--color-text-secondary);
}

.reflection-item {
  padding: 8px 10px;
  border-radius: 8px;
  margin-bottom: 4px;
  border-left: 3px solid var(--color-primary);
}

.reflection-path {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--color-text);
}

.reflection-summary {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  margin-top: 4px;
  line-height: 1.4;
}

.reflection-meta {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  font-size: var(--font-size-2xs);
  color: var(--color-text-tertiary);
}
.font-settings {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.font-current {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: var(--font-size-xs);
}
.font-label {
  color: var(--color-text-tertiary);
  font-weight: 500;
}
.font-value {
  color: var(--color-text);
  font-weight: 600;
}
.font-actions {
  display: flex;
  gap: 6px;
}
.font-btn {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  cursor: pointer;
  transition: all 0.15s;
}
.font-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-muted);
}
.profile-selector {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.profile-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.profile-btn {
  padding: 4px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-size-2xs);
  cursor: pointer;
  transition: all 0.15s;
}
.profile-btn.active {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-muted);
}
.profile-btn:hover {
  border-color: var(--color-primary);
}
.font-selector-overlay {
  position: fixed;
  inset: 0;
  z-index: 10001;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
