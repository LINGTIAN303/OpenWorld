<template>
  <Teleport to="body">
    <div class="dialog-backdrop" @click.self="$emit('close')"></div>
    <div class="create-agent-dialog">
      <div class="dialog-title">{{ isEdit ? '编辑 Agent' : '创建 Agent' }}</div>

      <div class="avatar-section">
        <div class="avatar-circle" :style="{ background: selectedColor }">{{ agentName[0] || '?' }}</div>
        <div class="avatar-fields">
          <input class="name-input" v-model="agentName" placeholder="Agent 名字" />
          <input class="role-input" v-model="agentRole" placeholder="角色标签（如：剑客、军师）" />
        </div>
      </div>

      <div class="color-section">
        <div class="section-label">颜色</div>
        <div class="color-options">
          <div
            v-for="c in AGENT_COLORS"
            :key="c"
            class="color-dot"
            :class="{ active: selectedColor === c }"
            :style="{ background: c }"
            @click="selectedColor = c"
          ></div>
        </div>
      </div>

      <div class="source-section">
        <div class="section-label">人格来源</div>
        <div class="source-options">
          <div class="source-option" :class="{ active: sourceType === 'entity' }" @click="sourceType = 'entity'">
            <span class="source-icon"><WsIcon name="landmark" size="xs" /></span>
            <span class="source-label">从实体选择</span>
          </div>
          <div class="source-option" :class="{ active: sourceType === 'custom' }" @click="sourceType = 'custom'">
            <span class="source-icon"><WsIcon name="pencil" size="xs" /></span>
            <span class="source-label">手动创建</span>
          </div>
        </div>
      </div>

      <div v-if="sourceType === 'entity'" class="entity-section">
        <input class="entity-search" v-model="entitySearch" placeholder="搜索实体..." />
        <div class="entity-list">
          <div
            v-for="entity in filteredEntities"
            :key="entity.id"
            class="entity-item"
            :class="{ selected: selectedEntityId === entity.id }"
            @click="onSelectEntity(entity)"
          >
            <div class="entity-avatar">{{ entity.name[0] }}</div>
            <div class="entity-info">
              <span class="entity-name">{{ entity.name }}</span>
              <span class="entity-type">{{ getEntityTypeLabel(entity.type) }}</span>
            </div>
            <span v-if="selectedEntityId === entity.id" class="entity-check">✓</span>
          </div>
          <div v-if="filteredEntities.length === 0" class="entity-empty">无匹配实体</div>
        </div>
      </div>

      <div class="prompt-section">
        <div class="section-label">系统提示词</div>
        <textarea class="prompt-input" v-model="systemPrompt" placeholder="描述这个 Agent 的人格、说话风格、知识背景..." rows="5"></textarea>
      </div>

      <div class="model-section">
        <div class="section-label">模型</div>
        <select class="model-select" v-model="modelId">
          <option value="">默认模型</option>
          <option v-for="m in modelOptions" :key="m.id" :value="m.id">{{ m.name }}</option>
        </select>
      </div>

      <div class="tools-section">
        <div class="section-label">工具与技能</div>
        <div class="tools-placeholder">即将支持</div>
      </div>

      <button class="create-btn" :disabled="!canCreate" @click="onCreate">
        {{ isEdit ? '保存修改' : '创建 Agent' }}
      </button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useEntityStore, type Entity } from '@worldsmith/entity-core'
import { MODEL_REGISTRY } from '../../../agent/modelRegistry'
import { AGENT_COLORS } from '../types'
import type { ChatAgent } from '../types'
import WsIcon from '../../../ui/WsIcon.vue'

const props = defineProps<{
  agent?: ChatAgent
}>()

const emit = defineEmits<{
  close: []
  created: [agent: ChatAgent]
  updated: [agent: ChatAgent]
}>()

const isEdit = computed(() => !!props.agent)

const agentName = ref(props.agent?.name || '')
const agentRole = ref(props.agent?.role || '')
const selectedColor = ref(props.agent?.color || AGENT_COLORS[0])
const sourceType = ref<'entity' | 'custom'>(props.agent?.sourceType || 'custom')
const selectedEntityId = ref(props.agent?.sourceEntityId || '')
const systemPrompt = ref(props.agent?.systemPrompt || '')
const modelId = ref(props.agent?.modelId || '')
const entitySearch = ref('')

watch(sourceType, (newType) => {
  if (newType === 'custom') {
    selectedEntityId.value = ''
  }
})

const entityStore = useEntityStore()

const modelOptions = computed(() => {
  return MODEL_REGISTRY.map(m => ({ id: m.id, name: m.name }))
})

const filteredEntities = computed(() => {
  let list = entityStore.entities
  if (entitySearch.value) {
    const q = entitySearch.value.toLowerCase()
    list = list.filter(e =>
      e.name.toLowerCase().includes(q) || e.type.toLowerCase().includes(q)
    )
  }
  return list.slice(0, 50)
})

const canCreate = computed(() => {
  return agentName.value.trim().length > 0 && systemPrompt.value.trim().length > 0
})

function getEntityTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    character: '角色',
    region: '地区',
    event: '事件',
    item: '道具',
    organization: '组织',
    concept: '概念',
  }
  return labels[type] || type
}

function buildEntityPrompt(entity: { name: string; type: string; description: string; properties: Record<string, unknown> }): string {
  const parts: string[] = []
  parts.push(`你的名字是「${entity.name}」。`)
  const typeMap: Record<string, string> = {
    character: '你是这个角色本身。用第一人称说话，仿佛你就是这个角色。',
    region: '你是这片土地的叙事者。用地理叙事者的口吻说话。',
    event: '你是这段历史的见证者。用历史见证者的口吻说话。',
    item: '你是这件器物之灵。用器物之灵的口吻说话。',
    organization: '你是这个组织的代言人。用组织代言人的口吻说话。',
    concept: '你是这个概念的化身。用概念化身的口吻说话。',
  }
  if (typeMap[entity.type]) {
    parts.push(typeMap[entity.type])
  }
  if (entity.description) {
    parts.push(`关于你的描述：${entity.description}`)
  }
  const personalityKeys = ['personality', '性格', '性格特点', 'personality_traits']
  for (const key of personalityKeys) {
    const val = entity.properties[key]
    if (val && typeof val === 'string') {
      parts.push(`你的性格：${val}`)
      break
    }
  }
  return parts.join('\n')
}

function onSelectEntity(entity: Entity): void {
  selectedEntityId.value = entity.id
  agentName.value = entity.name
  agentRole.value = getEntityTypeLabel(entity.type)
  systemPrompt.value = buildEntityPrompt(entity)
}

function onCreate(): void {
  if (!canCreate.value) return

  const now = Date.now()

  if (isEdit.value && props.agent) {
    const updated: ChatAgent = {
      ...props.agent,
      name: agentName.value.trim(),
      role: agentRole.value.trim(),
      color: selectedColor.value,
      systemPrompt: systemPrompt.value.trim(),
      modelId: modelId.value || undefined,
      sourceType: sourceType.value,
      sourceEntityId: sourceType.value === 'entity' ? selectedEntityId.value : undefined,
      updatedAt: now,
    }
    emit('updated', updated)
  } else {
    const agent: ChatAgent = {
      id: crypto.randomUUID(),
      name: agentName.value.trim(),
      avatar: agentName.value.trim()[0] || '?',
      color: selectedColor.value,
      role: agentRole.value.trim(),
      systemPrompt: systemPrompt.value.trim(),
      modelId: modelId.value || undefined,
      sourceType: sourceType.value,
      sourceEntityId: sourceType.value === 'entity' ? selectedEntityId.value : undefined,
      enabledTools: [],
      enabledSkills: [],
      createdAt: now,
      updatedAt: now,
    }
    emit('created', agent)
  }
}
</script>

<style scoped>
.dialog-backdrop { position: fixed; inset: 0; z-index: 9998; }
.create-agent-dialog { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--color-surface-elevated); border: 1px solid var(--color-border); border-radius: 12px; padding: 20px; min-width: 380px; max-height: 80vh; overflow-y: auto; z-index: 9999; box-shadow: 0 8px 24px rgba(0,0,0,0.2); }
.dialog-title { font-size: 16px; font-weight: 600; margin-bottom: 16px; text-align: center; }

.avatar-section { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.avatar-circle { width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: 700; font-size: 18px; flex-shrink: 0; }
.avatar-fields { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.name-input { border: none; border-bottom: 1px solid var(--color-border); font-size: 16px; font-weight: 600; background: transparent; outline: none; }
.role-input { border: none; border-bottom: 1px solid var(--color-border); font-size: 12px; background: transparent; outline: none; color: var(--color-text-secondary); }

.section-label { font-size: 11px; color: var(--color-text-tertiary); font-weight: 600; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }

.color-section { margin-bottom: 14px; }
.color-options { display: flex; gap: 6px; }
.color-dot { width: 22px; height: 22px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; transition: border-color 0.15s; }
.color-dot.active { border-color: white; box-shadow: 0 0 0 2px var(--color-primary); }

.source-section { margin-bottom: 14px; }
.source-options { display: flex; gap: 8px; }
.source-option { flex: 1; padding: 8px; border: 2px solid var(--color-border); border-radius: 8px; cursor: pointer; text-align: center; transition: all 0.15s; }
.source-option.active { border-color: var(--color-primary); background: rgba(108,92,231,0.06); }
.source-icon { font-size: 18px; display: block; margin-bottom: 2px; }
.source-label { font-size: 11px; font-weight: 600; }

.entity-section { margin-bottom: 14px; }
.entity-search { width: 100%; padding: 6px 10px; border: 1px solid var(--color-border); border-radius: 8px; font-size: 12px; background: var(--color-surface); outline: none; margin-bottom: 6px; }
.entity-list { max-height: 160px; overflow-y: auto; border: 1px solid var(--color-border); border-radius: 8px; }
.entity-item { display: flex; align-items: center; gap: 8px; padding: 6px 10px; cursor: pointer; transition: background 0.12s; }
.entity-item:hover { background: var(--color-surface); }
.entity-item.selected { background: rgba(108,92,231,0.08); }
.entity-avatar { width: 24px; height: 24px; border-radius: 50%; background: var(--color-surface); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; }
.entity-info { flex: 1; min-width: 0; }
.entity-name { font-size: 12px; font-weight: 600; }
.entity-type { font-size: 10px; color: var(--color-text-tertiary); margin-left: 4px; }
.entity-check { color: var(--color-primary); font-weight: 700; }
.entity-empty { padding: 12px; font-size: 11px; color: var(--color-text-tertiary); text-align: center; }

.prompt-section { margin-bottom: 14px; }
.prompt-input { width: 100%; border: 1px solid var(--color-border); border-radius: 8px; padding: 8px; font-size: 12px; resize: vertical; outline: none; background: var(--color-surface); min-height: 80px; }
.prompt-input:focus { border-color: var(--color-primary); }

.model-section { margin-bottom: 14px; }
.model-select { width: 100%; padding: 6px 10px; border: 1px solid var(--color-border); border-radius: 8px; font-size: 12px; background: var(--color-surface); outline: none; }

.tools-section { margin-bottom: 16px; }
.tools-placeholder { padding: 8px; border: 1px dashed var(--color-border); border-radius: 8px; font-size: 11px; color: var(--color-text-tertiary); text-align: center; }

.create-btn { width: 100%; padding: 10px; border: none; background: var(--color-primary); color: white; border-radius: 10px; cursor: pointer; font-size: 13px; font-weight: 600; }
.create-btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
