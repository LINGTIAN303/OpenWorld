<template>
  <Transition name="ws-fade">
    <div v-if="visible" class="onboarding-overlay">
      <div class="onboarding-content">
        <div class="onboarding-icon"><WsIcon name="lightning" size="xl" /></div>
        <h2 class="onboarding-title">创建新工作流</h2>
        <p class="onboarding-subtitle">描述你想自动化的任务，或从模板开始</p>

        <div class="onboarding-input-group">
          <textarea
            v-model="description"
            class="onboarding-textarea"
            placeholder="例如：每天早上读取邮件，总结要点后发送到飞书群..."
            rows="3"
            @keydown.enter.ctrl="handleGenerate"
          />
          <button class="generate-btn" :disabled="!description.trim()" @click="handleGenerate">
            <WsIcon name="magic" size="xs" /> 生成工作流
          </button>
        </div>

        <div class="onboarding-divider">
          <span class="divider-line" />
          <span class="divider-text">或从模板开始</span>
          <span class="divider-line" />
        </div>

        <div class="template-grid">
          <button
            v-for="tpl in templates"
            :key="tpl.id"
            class="template-card"
            @click="handleSelectTemplate(tpl.id)"
          >
            <span class="template-icon"><WsIcon :name="tpl.icon" size="md" /></span>
            <span class="template-name">{{ tpl.name }}</span>
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import WsIcon from '../../../../ui/WsIcon.vue'

defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  generate: [description: string]
  'select-template': [templateId: string]
}>()

const description = ref('')

const templates = [
  { id: 'tpl-email-processing', icon: 'manuscript', name: '邮件处理' },
  { id: 'tpl-content-creation', icon: 'edit', name: '内容创作' },
  { id: 'tpl-data-pipeline', icon: 'dashboard', name: '数据处理' },
  { id: 'tpl-scheduled-task', icon: 'delete', name: '定时任务' },
]

function handleGenerate() {
  const text = description.value.trim()
  if (!text) return
  emit('generate', text)
}

function handleSelectTemplate(templateId: string) {
  emit('select-template', templateId)
}
</script>

<style scoped>
.onboarding-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(4px);
}

.onboarding-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 520px;
  width: 100%;
  padding: 40px 32px;
}

.onboarding-icon {
  font-size: var(--icon-2xl);
  margin-bottom: 16px;
  line-height: 1;
}

.onboarding-title {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary, #111827);
  margin: 0 0 8px;
}

.onboarding-subtitle {
  font-size: var(--font-size-base);
  color: var(--text-secondary, #6b7280);
  margin: 0 0 24px;
}

.onboarding-input-group {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.onboarding-textarea {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  font-size: var(--font-size-base);
  line-height: 1.5;
  resize: vertical;
  outline: none;
  transition: border-color 0.15s;
  font-family: inherit;
  box-sizing: border-box;
}

.onboarding-textarea:focus {
  border-color: var(--primary, #3b82f6);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.onboarding-textarea::placeholder {
  color: var(--text-tertiary, #9ca3af);
}

.generate-btn {
  align-self: flex-end;
  padding: 8px 20px;
  border: none;
  border-radius: 8px;
  background: var(--primary, #3b82f6);
  color: white;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  transition: all 0.15s;
}

.generate-btn:hover:not(:disabled) {
  background: var(--primary-hover, #2563eb);
}

.generate-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.onboarding-divider {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 24px 0;
}

.divider-line {
  flex: 1;
  height: 1px;
  background: var(--border-color, #e5e7eb);
}

.divider-text {
  font-size: var(--font-size-sm);
  color: var(--text-tertiary, #9ca3af);
  white-space: nowrap;
}

.template-grid {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.template-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 8px;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 10px;
  background: var(--color-bg-surface);
  cursor: pointer;
  transition: all 0.15s;
}

.template-card:hover {
  border-color: var(--primary, #3b82f6);
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.12);
  transform: translateY(-1px);
}

.template-icon {
  font-size: var(--font-size-3xl);
  line-height: 1;
}

.template-name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary, #111827);
}


</style>
