<template>
  <div class="character-view">
    <div class="toolbar">
      <input
        v-model="searchQuery"
        placeholder="搜索角色..."
        class="search-input"
        @input="onSearch"
      />
      <CustomDropdown v-model="roleFilter" :options="roleOptions" placeholder="角色定位" />
      <CustomDropdown v-model="genderFilter" :options="genderOptions" placeholder="性别" />
      <CustomDropdown v-model="raceFilter" :options="raceOptions" placeholder="种族" />
      <CustomDropdown v-model="affiliationFilter" :options="affiliationOptions" placeholder="势力" />
      <CustomDropdown v-model="sortBy" :options="sortOptions" placeholder="排序" />
      <CreateButton label="新建角色" @click="showForm = true" />
      <button v-if="selectedIds.size > 0" class="btn-danger" @click="batchDelete(filteredCharacters, '角色')"><WsIcon name="delete" size="xs" /> 删除 ({{ selectedIds.size }})</button>
      <button v-if="selecting || selectedIds.size > 0" class="btn-ghost" @click="clearSelection">取消选择</button>
      <button class="btn-compare" :class="{ active: compareMode }" @click="toggleCompareMode"><WsIcon name="compare" size="xs" /> 对比</button>
      <CustomDropdown v-model="selectedTemplate" :options="templateOptions" placeholder="模板创建" @update:model-value="onTemplateSelect" />
    </div>

    <div class="entity-grid">
      <div
        v-for="(char, index) in filteredCharacters"
        :key="char?.id ?? index"
        class="entity-card-wrapper"
        :class="{ 'is-flipped': char?.id && isFlipped(char.id), 'batch-selected': char?.id && selectedIds.has(char.id) }"
      >
        <div class="entity-card-flipper">
          <div class="entity-card card-front" @click="selectCharacter(char)">
            <input type="checkbox" class="batch-check" :checked="char?.id && selectedIds.has(char.id)" @change="char?.id && toggleSelect(char.id)" @click.stop />
            <EntityCardCover :entity="char" :cover-field-key="coverFieldKey" />
            <div class="card-header">
              <span class="card-icon"><template v-if="char?.avatar">{{ char?.avatar }}</template><WsIcon v-else name="user" size="sm" /></span>
              <div class="card-body">
                <h3>{{ char?.name }}</h3>
                <p>{{ char?.description?.slice(0, 60) }}</p>
                <div class="card-tags">
                  <span v-for="tag in (char?.tags ?? [])" :key="tag" class="tag">{{ tag }}</span>
                </div>
              </div>
            </div>
            <button v-if="char?.id" class="card-flip-btn" @click.stop="toggleFlip(char.id)" title="翻转查看图片"><WsIcon name="refresh" size="xs" /></button>
          </div>
          <div class="entity-card card-back" @click="char?.id && toggleFlip(char.id)">
            <EntityCardBack :entity="char" :cover-field-key="coverFieldKey" />
            <div class="card-back-info">
              <h3>{{ char?.name }}</h3>
              <p>{{ char?.properties?.role || '' }}</p>
            </div>
            <button v-if="char?.id" class="card-flip-btn" @click.stop="toggleFlip(char.id)" title="翻转回正面"><WsIcon name="refresh" size="xs" /></button>
          </div>
        </div>
      </div>
    </div>

    <p v-if="filteredCharacters.length === 0 && !loading" class="empty">
      还没有角色，点击上方按钮创建
    </p>
    <p v-if="loading" class="empty">加载中...</p>

    <EntityFormModal
      ref="formModalRef"
      v-model="showForm"
      :title="editingCharacter ? '编辑角色' : '新建角色'"
      :entity="editingCharacter"
      :fields="characterFields"
      :entity-type="'character'"
      @save="onFormSave"
    />

    <Transition name="ws-detail-backdrop">
      <div v-if="selectedCharacter" class="detail-backdrop"></div>
    </Transition>

    <Transition name="ws-detail-backdrop">
      <div v-if="compareMode && compareChars.length === 2" class="compare-overlay">
        <div class="compare-panel">
          <div class="compare-header">
            <h3>角色对比</h3>
            <button class="detail-close" @click="compareMode = false; compareIds = []" aria-label="关闭"><WsIcon name="close" size="xs" /></button>
          </div>
          <div class="compare-table">
            <div class="compare-row compare-row-header">
              <span class="compare-label">属性</span>
              <span v-for="c in compareChars" :key="c.id" class="compare-val">{{ c.name }}</span>
            </div>
            <div v-for="key in compareFields" :key="key" class="compare-row">
              <span class="compare-label">{{ fieldLabel(key) }}</span>
              <span v-for="c in compareChars" :key="c.id" class="compare-val"
                :class="{ 'compare-diff': isDiff(key, c, compareChars) }">
                {{ c.properties?.[key] || '—' }}
              </span>
            </div>
            <div class="compare-row">
              <span class="compare-label">标签</span>
              <span v-for="c in compareChars" :key="c.id" class="compare-val">
                {{ c.tags?.join(', ') || '—' }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Transition>
    <Transition name="ws-detail-slide">
      <div v-if="selectedCharacter" class="detail-panel" :style="{ width: detailResizable.width.value + 'px' }">
      <div class="resize-handle-left" @mousedown="detailResizable.onResizeStart"></div>
      <div class="dp-header">
        <span class="dp-avatar"><template v-if="selectedCharacter.avatar">{{ selectedCharacter.avatar }}</template><WsIcon v-else name="user" size="lg" /></span>
        <div>
          <input v-if="isEditing" v-model="editForm._name" class="dp-title-input" />
          <h2 v-else>{{ selectedCharacter.name }}</h2>
          <span class="dp-type-label">角色</span>
        </div>
        <button class="detail-edit-toggle" :class="{active:isEditing}" @click="isEditing?cancelEdit():startEdit()">{{ isEditing?'取消':'编辑' }}</button>
        <button class="detail-close" @click="selectedCharacter = null"><WsIcon name="close" size="xs" /></button>
      </div>
      <div class="dp-tabs">
        <button v-for="tab in tabs" :key="tab.id" class="dp-tab"
          :class="{ active: activeTab === tab.id }"
          @click="activeTab = tab.id">
          <WsIcon :name="tab.icon" size="xs" /> {{ tab.label }}
        </button>
      </div>
      <div class="dp-scroll-area">
      <div v-if="activeTab === 'profile'" class="dp-tab-content">
        <div class="detail-fields">
          <template v-for="(val, key) in selectedCharacter.properties" :key="key">
            <DetailField :label="fieldLabel(key)" :value="val" :editing="isEditing" :type="fieldType(key as string)"
              :entity-id="selectedCharacter.id"
              :cover-position="selectedCharacter.coverPosition"
              :cover-zoom="selectedCharacter.coverZoom"
              :auto-link="fieldAutoLink(key as string)"
              @update:value="editForm[key] = $event"
              @update:cover-position="(val) => { editForm._coverPosition = val; entityStore.update(selectedCharacter.id, { coverPosition: val }) }"
              @update:cover-zoom="(val) => { editForm._coverZoom = val; entityStore.update(selectedCharacter.id, { coverZoom: val }) }"
              @commit="saveEdit" />
          </template>
        </div>
        <DetailField label="描述" :value="selectedCharacter.description" :editing="isEditing" type="textarea"
          @update:value="editForm._description = $event" @commit="saveEdit" />
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin:8px 0;">
          <span v-for="tag in selectedCharacter.tags" :key="tag" class="tag">{{ tag }}</span>
        </div>
        <div class="detail-actions">
          <button v-if="isEditing" class="btn-danger btn-sm" @click="deleteCharacter(selectedCharacter.id)">删除</button>
        </div>
        <div class="detail-edit-bar" v-if="isEditing">
          <button class="btn-primary btn-sm" @click="onSaveChar">保存</button>
        </div>
      </div>
      <div v-else-if="activeTab === 'family'" class="dp-tab-content">
        <FamilyTree :character-id="selectedCharacter.id" @navigate="onFamilyNavigate" @switch-to-profile="activeTab = 'profile'" />
      </div>
      <div v-else-if="activeTab === 'relations'" class="dp-tab-content">
        <RelationGraph :character-id="selectedCharacter.id" @navigate="onFamilyNavigate" />
      </div>
      <div v-else-if="activeTab === 'experience'" class="dp-tab-content">
        <CharacterExperience :character-id="selectedCharacter.id" @switch-to-profile="activeTab = 'profile'" />
      </div>
      <div v-else-if="activeTab === 'names'" class="dp-tab-content">
        <div class="dp-help">角色在不同阶段或不同人面前有不同的称呼</div>
        <div v-for="(n, idx) in alternateNames" :key="idx" class="dp-name-row">
          <input v-model="n.name" class="dp-name-input" placeholder="称呼" />
          <input v-model="n.context" class="dp-name-ctx" placeholder="使用场景" />
          <button class="dp-name-rm" @click="removeName(idx)"><WsIcon name="close" size="xs" /></button>
        </div>
        <button class="btn-sm-add" @click="addName">＋ 添加称呼</button>
        <button class="btn-secondary btn-sm" style="margin-top:8px" @click="saveNames">保存称呼</button>
      </div>
      <div v-else-if="activeTab === 'appearance'" class="dp-tab-content">
        <div class="dp-help">记录角色不同时期的外貌变化</div>
        <div v-for="(a, idx) in appearanceStages" :key="idx" class="dp-app-row">
          <input v-model="a.stage" class="dp-app-stage" placeholder="时期（少年、成年）" />
          <textarea v-model="a.description" class="dp-app-desc" placeholder="外貌描述" rows="2"></textarea>
          <button class="dp-name-rm" @click="removeAppearance(idx)"><WsIcon name="close" size="xs" /></button>
        </div>
        <button class="btn-sm-add" @click="addAppearance">＋ 添加外貌阶段</button>
        <button class="btn-secondary btn-sm" style="margin-top:8px" @click="saveAppearances">保存外貌记录</button>
      </div>
      <div v-else-if="activeTab === 'equipment'" class="dp-tab-content">
        <div class="dp-body-grid">
          <div v-for="slot in bodySlots" :key="slot.id" class="dp-body-slot" :class="{ 'dp-slot-empty': !slotItems(slot.id).length }">
            <div class="dp-slot-label"><WsIcon :name="slot.icon" size="xs" /> {{ slot.label }}</div>
            <div v-for="item in slotItems(slot.id)" :key="item.id" class="dp-equip-card">
              <div class="dp-equip-header">
                <span class="dp-equip-icon"><WsIcon :name="apparelIcon(item)" size="xs" /></span>
                <span class="dp-equip-armor" :class="'armor-' + armorKey(item)">{{ armorLabel(item) }}</span>
              </div>
              <div class="dp-equip-body">
                <h4>{{ item.name }}</h4>
                <div class="dp-equip-tags">
                  <span class="dp-equip-type">{{ (item.properties.apparelType as string) || '服饰' }}</span>
                  <span v-if="item.properties.defense" class="dp-equip-def"><WsIcon name="shield" size="xs" /> {{ item.properties.defense }}</span>
                  <button class="dp-equip-unequip" @click="unequipApparel(item.id)" title="卸下"><WsIcon name="close" size="xs" /></button>
                </div>
              </div>
            </div>
            <div v-if="!slotItems(slot.id).length" class="dp-slot-placeholder">空</div>
          </div>
        </div>
        <p v-if="wornApparel.length === 0" class="dp-help">该角色当前未穿戴任何服饰</p>
        <EntityRelationSelector v-if="selectedCharacter" :entity-id="selectedCharacter.id" entity-type="character" relation-type="worn_by" :reverse-direction="true" />
      </div>
      <UniversalRelationPanel v-if="selectedCharacter?.id" :entity-id="selectedCharacter.id" entity-type="character" :inline-visible="activeTab === 'profile'" storage-scope="character" />
      </div>
    </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, onUnmounted, watch } from 'vue'
import WsIcon from '../../../ui/WsIcon.vue'
import { useEntityStore, useRelationStore, entitySchemaRegistry } from '@worldsmith/entity-core'
import type { Entity } from '@worldsmith/entity-core'
import FamilyTree from './components/FamilyTree.vue'
import RelationGraph from './components/RelationGraph.vue'
import CharacterExperience from './components/CharacterExperience.vue'

import { UniversalRelationPanel, DetailField, EntityFormModal, CustomDropdown, CreateButton, EntityRelationSelector, toastSuccess, toastWithUndo, useEntityEdit, useBatchDelete, useDuplicateNameCheck, useResizable, useShortcuts, useUndoRedo, useConfirm } from '@worldsmith/ui-kit'
import { EntityCardCover, EntityCardBack } from '@worldsmith/ui-kit'
import { useSettingsStore } from '../../../stores/settingsStore'
import { characterFields } from './characterConfig'
import { characterTemplates } from './characterTemplates'
import type { CharacterTemplate } from './characterTemplates'

const detailResizable = useResizable({ panelId: 'detail-character', defaultWidth: 320, minWidth: 240, side: 'left' })

const entityStore = useEntityStore()
const { confirm } = useConfirm()
const { checkAndConfirmName } = useDuplicateNameCheck()
const charSchema = computed(() => entitySchemaRegistry.get('character'))
const { register, unregister } = useShortcuts()
const { undo, redo } = useUndoRedo()
const settingsStore = useSettingsStore()

const searchQuery = ref('')
const roleFilter = ref('')
const genderFilter = ref('')
const raceFilter = ref('')
const affiliationFilter = ref('')
const sortBy = ref('')
const compareMode = ref(false)
const compareIds = ref<string[]>([])
const selectedTemplate = ref('')
const showForm = ref(false)
const loading = ref(false)
const selectedCharacter = ref<Entity | null>(null)
const editingCharacter = ref<Entity | null>(null)
const formModalRef = ref<InstanceType<typeof EntityFormModal> | null>(null)

const { isEditing, editForm, startEdit, cancelEdit, saveEdit } = useEntityEdit(selectedCharacter)

const flippedCardIds = ref<string[]>([])
function toggleFlip(entityId: string) {
  const idx = flippedCardIds.value.indexOf(entityId)
  if (idx !== -1) {
    flippedCardIds.value = flippedCardIds.value.filter(id => id !== entityId)
  } else {
    flippedCardIds.value = [...flippedCardIds.value, entityId]
  }
}
function isFlipped(entityId: string): boolean {
  return flippedCardIds.value.includes(entityId)
}
const coverFieldKey = computed(() => {
  const fields = charSchema.value?.fields || []
  const imageField = fields.find((f: any) => f.type === 'image')
  return imageField?.key || 'coverImage'
})
async function onSaveChar() {
  await saveEdit(undefined, async () => {
    await entityStore.loadByType('character')
  })
}

const characters = computed(() =>
  (entityStore.entities ?? []).filter(e => e && e.type === 'character')
)

const filteredCharacters = computed(() => {
  let list = characters.value
  const q = searchQuery.value.toLowerCase()
  if (q) {
    list = list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q) ||
        (c.tags ?? []).some((t) => t.toLowerCase().includes(q))
    )
  }
  if (roleFilter.value) list = list.filter(c => c.properties?.role === roleFilter.value)
  if (genderFilter.value) list = list.filter(c => c.properties?.gender === genderFilter.value)
  if (raceFilter.value) list = list.filter(c => c.properties?.race === raceFilter.value)
  if (affiliationFilter.value) list = list.filter(c => c.properties?.affiliation === affiliationFilter.value)
  if (sortBy.value) {
    list = [...list].sort((a, b) => {
      if (sortBy.value === 'name') return a.name.localeCompare(b.name)
      if (sortBy.value === 'name_desc') return b.name.localeCompare(a.name)
      if (sortBy.value === 'age') return (Number(a.properties?.age) || 0) - (Number(b.properties?.age) || 0)
      if (sortBy.value === 'age_desc') return (Number(b.properties?.age) || 0) - (Number(a.properties?.age) || 0)
      if (sortBy.value === 'role') return (a.properties?.role || '').localeCompare(b.properties?.role || '')
      return 0
    })
  }
  return list
})

const roleOptions = computed(() => buildFilterOptions('role', '全部定位'))
const genderOptions = computed(() => buildFilterOptions('gender', '全部性别'))
const raceOptions = computed(() => buildFilterOptions('race', '全部种族'))
const affiliationOptions = computed(() => buildFilterOptions('affiliation', '全部势力'))

const sortOptions = [
  { value: '', label: '默认排序' },
  { value: 'name', label: '名称 ↑' },
  { value: 'name_desc', label: '名称 ↓' },
  { value: 'age', label: '年龄 ↑' },
  { value: 'age_desc', label: '年龄 ↓' },
  { value: 'role', label: '角色定位' },
]

const templateOptions = [
  { value: '', label: '模板创建' },
  ...characterTemplates.map(t => ({ value: t.id, label: t.name })),
]

function onTemplateSelect(id: string) {
  if (!id) return
  const tpl = characterTemplates.find(t => t.id === id)
  if (!tpl) return
  const now = new Date().toISOString()
  editingCharacter.value = {
    id: '',
    type: 'character',
    name: '',
    description: '',
    tags: [],
    properties: { ...tpl.defaults },
    createdAt: now,
    updatedAt: now,
  } as Entity
  showForm.value = true
  selectedTemplate.value = ''
}

function buildFilterOptions(key: string, allLabel: string) {
  const values = new Set(
    characters.value.map(c => c.properties?.[key] as string).filter(Boolean)
  )
  return [
    { value: '', label: allLabel },
    ...Array.from(values).sort().map(v => ({ value: v, label: v })),
  ]
}

onMounted(async () => {
  try {

  loading.value = true
  await entityStore.loadByType('character')
  loading.value = false
  } catch (err) {
    console.warn('[CharacterList]', err)
  }

  window.addEventListener('ws-select-entity', onWsSelectEntity)

  const undoKeys = settingsStore.getShortcut('global.undo') || ['ctrl', 'z']
  const redoKeys = settingsStore.getShortcut('global.redo') || ['ctrl', 'y']
  register({ id: 'character.undo', keys: undoKeys, scope: 'view', description: '撤销', handler: () => undo(entityStore, relationStore) })
  register({ id: 'character.redo', keys: redoKeys, scope: 'view', description: '重做', handler: () => redo(entityStore, relationStore) })
})

onBeforeUnmount(() => {
  window.removeEventListener('ws-select-entity', onWsSelectEntity)
  unregister('character.undo')
  unregister('character.redo')
})

function onDetailEsc(e: KeyboardEvent) {
  if (e.key === 'Escape' && selectedCharacter.value) {
    selectedCharacter.value = null
  }
}
onMounted(() => window.addEventListener('keydown', onDetailEsc))
onUnmounted(() => window.removeEventListener('keydown', onDetailEsc))

async function onFormSave(data: { name: string; description: string; properties: Record<string, any>; tags: string[]; _autoLinkFields?: any[]; _coverPosition?: string; _coverZoom?: number }) {
  const now = new Date().toISOString()
  let savedEntityId: string | undefined

  if (editingCharacter.value?.id) {
    savedEntityId = editingCharacter.value.id
    const updateData: Record<string, unknown> = {
      name: data.name,
      description: data.description,
      properties: data.properties,
      tags: data.tags,
    }
    if (data._coverPosition) updateData.coverPosition = data._coverPosition
    if (data._coverZoom) updateData.coverZoom = data._coverZoom
    await entityStore.update(editingCharacter.value.id, updateData)
  } else {
    const checkedName = await checkAndConfirmName(data.name, undefined, 'character')
    if (!checkedName) return
    const entity: Entity = {
      id: `char-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'character',
      name: checkedName,
      description: data.description,
      properties: data.properties,
      tags: data.tags,
      createdAt: now,
      updatedAt: now,
    }
    await entityStore.add(entity); toastSuccess('已创建')
    savedEntityId = entity.id
    await formModalRef.value?.syncEntityRefAfterCreate(entity.id)
  }

  if (savedEntityId && data._autoLinkFields?.length) {
    const { processAutoLinks } = await import('@worldsmith/entity-core/composables').then(m => m.useSmartFieldLink())
    const result = await processAutoLinks(savedEntityId, data.properties, data._autoLinkFields)
    if (result.linked > 0 || result.created > 0) {
      const parts = []
      if (result.linked > 0) parts.push(`自动关联 ${result.linked} 条关系`)
      if (result.created > 0) parts.push(`自动创建 ${result.created} 个实体`)
      toastSuccess(parts.join('，'))
      for (const reminder of result.reminders) {
        setTimeout(() => toastSuccess(reminder), 500)
      }
    }
  }

  showForm.value = false
  editingCharacter.value = null
  await entityStore.loadByType('character')
}

function selectCharacter(char: Entity) {
  if (compareMode.value) {
    toggleCompareChar(char.id)
    return
  }
  selectedCharacter.value = char
}

function toggleCompareMode() {
  compareMode.value = !compareMode.value
  compareIds.value = []
}

function toggleCompareChar(id: string) {
  const idx = compareIds.value.indexOf(id)
  if (idx >= 0) {
    compareIds.value.splice(idx, 1)
  } else if (compareIds.value.length < 2) {
    compareIds.value.push(id)
  }
}

const compareChars = computed(() =>
  compareIds.value.map(id => entityStore.entityMap.get(id)).filter(Boolean) as Entity[]
)

const compareFields = computed(() => {
  const allKeys = new Set<string>()
  for (const c of compareChars.value) {
    if (c.properties) for (const k of Object.keys(c.properties)) {
      if (!k.startsWith('_')) allKeys.add(k)
    }
  }
  return Array.from(allKeys)
})

function isDiff(key: string, char: Entity, all: Entity[]) {
  if (all.length < 2) return false
  const vals = all.map(c => String(c.properties?.[key] ?? ''))
  return new Set(vals).size > 1
}

function onWsSelectEntity(e: Event) {
  const detail = (e as CustomEvent).detail
  if (detail?.entityId) {
    const entity = entityStore.entityMap.get(detail.entityId)
    if (entity && entity.type === 'character') {
      selectedCharacter.value = entity
    }
  }
}

async function deleteCharacter(id: string) {
  const entity = entityStore.entityMap.get(id)
  const relCount = relationStore.relations.filter(r => r.sourceId === id || r.targetId === id).length
  const msg = relCount > 0
    ? `将删除「${entity?.name}」及其 ${relCount} 条关联关系，此操作不可完全撤销。`
    : `将删除「${entity?.name}」，此操作不可完全撤销。`
  if (!(await confirm({ type: 'danger', title: '确认删除', description: msg }))) return
  const entityData = { ...entity } as Entity
  await entityStore.remove(id)
  selectedCharacter.value = null
  await entityStore.loadByType('character')
  toastWithUndo(`已删除「${entityData.name}」`, async () => {
    await entityStore.add(entityData)
    await entityStore.loadByType('character')
    toastSuccess('已撤销删除')
  })
}

  const { selectedIds, selecting, toggleSelect, clearSelection, batchDelete } = useBatchDelete()
function onSearch() {
}

function fieldLabel(key: string): string {
  const field = charSchema.value?.fields.find((f) => f.key === key)
  return field?.label || key
}

function fieldType(key: string): 'text' | 'textarea' | 'number' | 'boolean' | 'date' | 'select' | 'formula' | 'color' | 'image' {
  const field = charSchema.value?.fields.find((f) => f.key === key)
  const t = field?.type || 'text'
  if (['text', 'textarea', 'number', 'boolean', 'date', 'select', 'formula', 'color', 'image'].includes(t)) return t as any
  return 'text'
}

function fieldAutoLink(key: string) {
  const field = charSchema.value?.fields.find((f: any) => f.key === key)
  return (field as any)?.autoLink || undefined
}
const tabs = [
  { id: 'profile', icon: 'outline', label: '档案' },
  { id: 'family', icon: 'tree', label: '家谱' },
  { id: 'relations', icon: 'web', label: '关系图' },
  { id: 'experience', icon: 'hourglass', label: '经历' },
  { id: 'names', icon: 'badge', label: '称呼' },
  { id: 'appearance', icon: 'eye', label: '外貌' },
  { id: 'equipment', icon: 'clothing', label: '装备栏' },
]
const activeTab = ref('profile')

const relationStore = useRelationStore()

const wornApparel = computed(() => {
  if (!selectedCharacter.value) return []
  const rels = relationStore.relations.filter(r =>
    r.type === 'worn_by' && r.targetId === selectedCharacter.value!.id
  )
  return rels.map(r => entityStore.entities.find(e => e.id === r.sourceId)).filter(Boolean)
}) as any

function apparelIcon(item: Entity): string {
  const t = (item.properties.apparelType as string) || ''
  const map: Record<string, string> = {
    '上衣': 'clothing', '外套/披风': 'clothing', '法袍': 'clothing',
    '下装': 'pants', '连衣裙': 'dress',
    '头饰': 'crown', '鞋履': 'boots', '手套': 'gloves',
    '饰品/首饰': 'ring', '轻甲': 'shield', '中甲': 'shield',
    '重甲': 'shield', '盾牌': 'shield', '套装': 'item',
  }
  return map[t] || 'clothing'
}

function armorLabel(item: Entity): string {
  return (item.properties.armorClass as string) || '无防护'
}

function armorKey(item: Entity): string {
  const v = armorLabel(item)
  const map: Record<string, string> = {
    '无防护': 'none', '布甲': 'cloth', '皮甲': 'leather',
    '锁甲': 'chain', '板甲': 'plate', '法袍': 'robe', '饰品': 'accessory',
  }
  return map[v] || 'none'
}

const bodySlots = [
  { id: 'head', label: '头部', icon: 'crown', types: ['头饰'] },
  { id: 'body', label: '身体', icon: 'clothing', types: ['上衣', '外套/披风', '法袍', '连衣裙', '轻甲', '中甲', '重甲'] },
  { id: 'hands', label: '手部', icon: 'gloves', types: ['手套'] },
  { id: 'legs', label: '下身', icon: 'pants', types: ['下装'] },
  { id: 'feet', label: '足部', icon: 'boots', types: ['鞋履'] },
  { id: 'accessory', label: '饰品', icon: 'ring', types: ['饰品/首饰'] },
  { id: 'shield', label: '盾牌', icon: 'shield', types: ['盾牌'] },
  { id: 'set', label: '套装', icon: 'item', types: ['套装'] },
]

function slotItems(slotId: string): Entity[] {
  const slot = bodySlots.find(s => s.id === slotId)
  if (!slot) return []
  return wornApparel.value.filter((item: Entity) =>
    slot.types.includes((item.properties.apparelType as string) || '')
  )
}

async function unequipApparel(apparelId: string) {
  if (!selectedCharacter.value) return
  const rel = relationStore.relations.find(r =>
    r.type === 'worn_by' && r.sourceId === apparelId && r.targetId === selectedCharacter.value!.id
  )
  if (rel) {
    await relationStore.remove(rel.id)
    await relationStore.loadAll()
    toastSuccess('已卸下装备')
  }
}



function loadNames(charId: string): { name: string; context: string }[] {
  try {
    const raw = selectedCharacter.value?.properties?._altNames as string
    return raw ? JSON.parse(raw) : [{ name: '', context: '' }]
  } catch { return [{ name: '', context: '' }] }
}
async function saveNames() {
  if (!selectedCharacter.value) return
  const names = alternateNames.value.filter(n => n.name.trim())
  await entityStore.update(selectedCharacter.value.id, {
    properties: { ...selectedCharacter.value.properties, _altNames: JSON.stringify(names) },
  })
  await entityStore.loadByType('character')
  toastSuccess('称呼已保存')
}

const alternateNames = ref<{ name: string; context: string }[]>([])

watch(() => selectedCharacter.value?.id, (id) => {
  if (id) alternateNames.value = loadNames(id)
})

function addName() { alternateNames.value.push({ name: '', context: '' }) }
function removeName(idx: number) { alternateNames.value.splice(idx, 1) }

function loadAppearances(charId: string): { stage: string; description: string }[] {
  try {
    const raw = selectedCharacter.value?.properties?._appearances as string
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}
async function saveAppearances() {
  if (!selectedCharacter.value) return
  const apps = appearanceStages.value.filter(a => a.stage.trim())
  await entityStore.update(selectedCharacter.value.id, {
    properties: { ...selectedCharacter.value.properties, _appearances: JSON.stringify(apps) },
  })
  await entityStore.loadByType('character')
  toastSuccess('外貌记录已保存')
}

const appearanceStages = ref<{ stage: string; description: string }[]>([])

watch(() => selectedCharacter.value?.id, (id) => {
  if (id) {
    appearanceStages.value = loadAppearances(id)
    alternateNames.value = loadNames(id)
    relationStore.loadAll()
  }
})

function addAppearance() { appearanceStages.value.push({ stage: '', description: '' }) }
function removeAppearance(idx: number) { appearanceStages.value.splice(idx, 1) }

function onFamilyNavigate(id: string) {
  const char = entityStore.entityMap.get(id)
  if (char) selectedCharacter.value = char
}
</script>

<style scoped>
.character-view {
  padding: 20px;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.dp-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.dp-title-input { font-size: var(--font-size-xl);font-weight: var(--font-weight-semibold);border:none;border-bottom:1px solid var(--border-color);background:transparent;color:var(--text-color);width:100%;padding:2px 0; }
.dp-type-label { font-size: var(--font-size-sm);color:var(--text-secondary); }
.detail-edit-toggle { margin-left:auto; margin-right:20px; }
.dp-header h2 { margin:0;font-size: var(--font-size-xl); }
.dp-avatar { font-size: var(--icon-xl); }
.dp-tabs { display: flex; gap: 0; border-bottom: 2px solid var(--border-color); margin-bottom: 12px; overflow-x: auto; flex-shrink: 0; scrollbar-width: none; }
.dp-tabs::-webkit-scrollbar { display: none; }
.dp-tab { padding: 4px 8px; border: none; background: none; cursor: pointer; font-size: var(--font-size-xs); color: var(--text-tertiary); border-bottom: 2px solid transparent; margin-bottom: -2px; white-space: nowrap; transition: all var(--transition-fast); flex-shrink: 0; }
.dp-tab:hover { color: var(--text-color); }
.dp-tab.active { color: var(--primary); border-bottom-color: var(--primary); font-weight: var(--font-weight-semibold); }
.dp-scroll-area { flex: 1; overflow-y: auto; }
.dp-tab-content { }
.dp-empty { font-size: var(--font-size-sm); color: var(--text-tertiary); padding: 20px 0; text-align: center; }
.dp-help { font-size: var(--font-size-sm); color: var(--text-tertiary); margin-bottom: 8px; }

.dp-event-item { display: flex; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--border-light); font-size: var(--font-size-sm); }
.dp-event-date { color: var(--primary); font-weight: var(--font-weight-semibold); font-size: var(--font-size-sm); white-space: nowrap; min-width: 60px; }
.dp-event-name { color: var(--text-color); }

.dp-name-row { display: flex; gap: 6px; margin-bottom: 6px; align-items: center; }
.dp-name-input { flex: 1; padding: 5px 8px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); font-size: var(--font-size-sm); font-family: inherit; }
.dp-name-ctx { flex: 1; padding: 5px 8px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); font-size: var(--font-size-sm); font-family: inherit; }
.dp-name-rm { width: 22px; height: 22px; border: none; background: transparent; cursor: pointer; color: var(--danger); font-size: var(--font-size-sm); border-radius: 4px; flex-shrink: 0; }
.dp-name-rm:hover { background: var(--danger-light); }

.dp-app-row { margin-bottom: 8px; padding: 8px; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: var(--radius-md); }
.dp-app-header { display: flex; gap: 6px; align-items: center; margin-bottom: 4px; }
.dp-app-stage { flex: 1; padding: 5px 8px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); font-size: var(--font-size-sm); font-family: inherit; }
.dp-app-desc { width: 100%; padding: 5px 8px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); font-size: var(--font-size-sm); font-family: inherit; resize: vertical; }

.btn-sm-add { padding: 4px 12px; background: none; border: 1px dashed var(--primary); color: var(--primary); border-radius: var(--radius-sm); cursor: pointer; font-size: var(--font-size-sm); transition: all var(--transition-fast); }
.btn-sm-add:hover { background: var(--primary-light); }
.btn-sm { padding: 5px 12px; font-size: var(--font-size-sm); }

.detail-panel { position: fixed; top: 0; right: 0; height: 100vh; z-index: var(--z-detail); background: var(--glass-bg, var(--bg-secondary)); border-left: 1px solid var(--glass-border, var(--border)); display: flex; flex-direction: column; box-shadow: var(--shadow-xl); backdrop-filter: blur(var(--glass-blur)); }
.detail-close { background: none; border: none; font-size: var(--font-size-lg); cursor: pointer; color: var(--text-secondary); padding: 4px; margin-left: 4px; flex-shrink: 0; }

.detail-backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--z-detail-backdrop);
  background: rgba(0,0,0,0.2);
  pointer-events: none;
}


.btn-compare { padding: 7px 14px; background: var(--bg-tertiary); color: var(--text-secondary); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; font-size: var(--font-size-sm); transition: all var(--transition-fast); }
.btn-compare.active { background: var(--primary-light); border-color: var(--primary); color: var(--primary); }
.compare-overlay { position: fixed; inset: 0; z-index: var(--z-overlay); background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; }
.compare-panel { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 12px; padding: 20px; min-width: 480px; max-width: 640px; max-height: 80vh; overflow-y: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.3); }
.compare-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.compare-header h3 { margin: 0; font-size: var(--font-size-lg); color: var(--accent); }
.compare-table { display: flex; flex-direction: column; gap: 0; }
.compare-row { display: grid; grid-template-columns: 120px 1fr 1fr; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--border-light); font-size: var(--font-size-sm); }
.compare-row-header { font-weight: var(--font-weight-semibold); color: var(--text-color); border-bottom: 2px solid var(--border-color); }
.compare-label { color: var(--text-secondary); font-weight: var(--font-weight-medium); }
.compare-val { color: var(--text-color); }
.compare-diff { color: var(--primary); font-weight: var(--font-weight-semibold); }
.resize-handle-left {
  position: absolute;
  left: 0;
  top: 0;
  width: 6px;
  height: 100%;
  cursor: col-resize;
  z-index: 10;
  background: transparent;
  transition: background 0.15s;
}
.resize-handle-left:hover,
.resize-handle-left:active {
  background: var(--primary);
  opacity: 0.3;
}
.dp-body-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 4px 0;
}
.dp-body-slot {
  background: var(--card-bg); border: 1px solid var(--border-color);
  border-radius: var(--radius-md); padding: 8px; min-height: 60px;
}
.dp-body-slot.dp-slot-empty { opacity: 0.5; }
.dp-slot-label {
  font-size: var(--font-size-xs); font-weight: var(--font-weight-semibold); color: var(--text-secondary);
  margin-bottom: 6px; display: flex; align-items: center; gap: 4px;
}
.dp-slot-placeholder {
  font-size: var(--font-size-xs); color: var(--text-tertiary); font-style: italic; padding: 4px 0;
}
.dp-equip-card {
  display: flex; gap: 8px; padding: 6px;
  background: var(--hover-bg); border-radius: var(--radius-sm); margin-bottom: 4px;
}
.dp-equip-header {
  display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 40px;
}
.dp-equip-icon { font-size: var(--font-size-xl); }
.dp-equip-armor { padding: 1px 5px; border-radius: 6px; font-size: var(--text-micro-font-size); font-weight: var(--font-weight-semibold); white-space: nowrap; }
.armor-none { background: var(--color-bg-elevated); color: var(--color-text-tertiary); }
.armor-cloth { background: #6c5ce7; color: #fff; }
.armor-leather { background: #e67e22; color: #fff; }
.armor-chain { background: #3498db; color: #fff; }
.armor-plate { background: #2c3e50; color: #fff; }
.armor-robe { background: #9b59b6; color: #fff; }
.armor-accessory { background: #f1c40f; color: var(--color-bg-base); }
.dp-equip-body { flex: 1; min-width: 0; }
.dp-equip-body h4 { margin: 0 0 2px; font-size: var(--font-size-sm); }
.dp-equip-tags { display: flex; gap: 4px; align-items: center; }
.dp-equip-type { font-size: var(--text-micro-font-size); padding: 1px 4px; background: var(--hover-bg); border-radius: 3px; color: var(--text-secondary); }
.dp-equip-def { font-size: var(--font-size-xs); color: var(--text-secondary); }
.dp-equip-unequip { margin-left: auto; background: none; border: none; cursor: pointer; color: var(--text-tertiary); padding: 2px; border-radius: 4px; display: flex; align-items: center; }
.dp-equip-unequip:hover { color: var(--danger); background: var(--danger-light); }
</style>
