<template>
  <div class="gev-root">
    <div class="toolbar">
      <input v-model="searchQuery" class="search-input" :placeholder="`搜索${entityLabel}...`" />
      <CustomDropdown v-if="filterOptions.length > 1" v-model="typeFilter" :options="filterOptions" />
      <slot name="toolbar-extra" />
      <CreateButton :label="`新建${entityLabel}`" @click="openNewForm" />
      <button v-if="selectedIds.size > 0" class="btn-danger btn-sm" @click="onBatchDel">删除 ({{ selectedIds.size }})</button>
      <button v-if="selectedIds.size > 0" class="btn-ghost btn-sm" @click="clearSelection">取消选择</button>
    </div>

    <div class="entity-grid">
      <slot name="list" :entities="filteredList" :selected-ids="selectedIds" :toggle-select="toggleSelect" :select="selectEntity">
        <div
          v-for="(e, idx) in filteredList"
          :key="e.id"
          class="entity-card-wrapper"
          :class="{
            'is-flipped': hasImageField && isFlipped(e.id),
            'batch-selected': selectedIds.has(e.id),
            'active': listHighlight.selectedId.value === e.id,
            'dimmed': listHighlight.applyToList(filteredList)[idx]?.dimmed,
            'search-highlight': listHighlight.applyToList(filteredList)[idx]?.searchHit,
          }"
        >
          <div v-if="hasImageField" class="entity-card-flipper">
            <div class="entity-card card-front" @click="selectEntity(e)">
              <input type="checkbox" class="batch-check" :checked="selectedIds.has(e.id)" @change="toggleSelect(e.id)" @click.stop />
              <EntityCardCover :entity="e" :cover-field-key="coverFieldKey" />
              <div class="card-header">
                <WsIcon class="card-icon" :name="resolvedIconFn(e)" size="sm" />
                <div class="card-body">
                  <h3>{{ e.name }}</h3>
                  <slot name="card-subtitle" :entity="e">
                    <p>{{ e.properties[typeFieldKey] || '' }}</p>
                  </slot>
                </div>
              </div>
              <button class="card-flip-btn" @click.stop="toggleFlip(e.id)" title="翻转查看图片">🔄</button>
            </div>
            <div class="entity-card card-back" @click="toggleFlip(e.id)">
              <EntityCardBack :entity="e" :cover-field-key="coverFieldKey" />
              <div class="card-back-info">
                <h3>{{ e.name }}</h3>
                <p>{{ e.properties[typeFieldKey] || '' }}</p>
              </div>
              <button class="card-flip-btn" @click.stop="toggleFlip(e.id)" title="翻转回正面">🔄</button>
            </div>
          </div>
          <div v-else class="entity-card" @click="selectEntity(e)">
            <input type="checkbox" class="batch-check" :checked="selectedIds.has(e.id)" @change="toggleSelect(e.id)" @click.stop />
            <div class="card-header">
              <WsIcon class="card-icon" :name="resolvedIconFn(e)" size="sm" />
              <div class="card-body">
                <h3>{{ e.name }}</h3>
                <slot name="card-subtitle" :entity="e">
                  <p>{{ e.properties[typeFieldKey] || '' }}</p>
                </slot>
              </div>
            </div>
          </div>
        </div>
      </slot>
      <WsEmpty v-if="filteredList.length === 0" :title="`暂无${entityLabel}`" :description="`点击上方按钮创建第一个${entityLabel}`">
        <template #icon>
          <WsIcon :name="resolvedIconFn({ properties: {} } as any) || 'manuscript'" size="xl" />
        </template>
      </WsEmpty>
    </div>

    <EntityDetailPanel
      :visible="!!selectedEntity"
      :entity="selectedEntity"
      :icon="selectedEntity ? resolvedIconFn(selectedEntity) : ''"
      :title="selectedEntity?.name || ''"
      :subtitle="selectedEntity?.properties[typeFieldKey] || entityLabel"
      :tabs="resolvedTabs"
      :show-edit="true"
      :editing="isEditing"
      :panel-id="`detail-${entityType}`"
      @close="selectedEntity = null"
      @edit="isEditing ? cancelEdit() : startEdit()"
    >
      <template #info="{ entity, editing }">
        <div class="detail-fields">
          <DetailField
            v-for="f in displayFields"
            :key="f.key"
            :label="f.label"
            :value="entity.properties[f.key]"
            :editing="editing"
            :type="(f.type as any)"
            :options="f.options"
            :entity-id="entity.id"
            :cover-position="entity.coverPosition"
            :cover-zoom="entity.coverZoom"
            :auto-link="(f as any).autoLink"
            @update:value="editForm[f.key] = $event"
            @update:cover-position="(val) => { editForm._coverPosition = val; entityStore.update(entity.id, { coverPosition: val }) }"
            @update:cover-zoom="(val) => { editForm._coverZoom = val; entityStore.update(entity.id, { coverZoom: val }) }"
            @commit="saveEdit"
          />
        </div>

        <DetailField
          label="描述"
          :value="entity.description"
          :editing="editing"
          type="textarea"
          @update:value="editForm._description = $event"
          @commit="saveEdit"
        />

        <DynamicFieldsAdder
          :entity-type="entityType"
          v-model="editForm"
          :field-defs="customFieldDefs"
          @update:field-defs="customFieldDefs = $event"
        />

        <slot name="detail-extra" :entity="entity" :editing="editing" />

        <div class="detail-actions" v-if="editing">
          <button class="btn-danger btn-sm" @click="deleteEntity">删除</button>
        </div>
        <div class="detail-edit-bar" v-if="editing">
          <button class="btn-primary btn-sm" @click="saveEdit()">保存</button>
        </div>
      </template>

      <template v-for="rt in relationTabs" :key="rt.id" #[rt.id]="{ entity }">
        <div v-for="r in getRelations(entity.id, rt.relationType)" :key="r.id" class="dp-rel-item">
          <span class="dp-rel-icon"><WsIcon :name="rt.targetIcon || 'link'" size="xs" /></span>
          <span class="dp-rel-name">{{ getEntityName(r) }}</span>
        </div>
        <WsEmpty v-if="getRelations(entity.id, rt.relationType).length === 0" preset="no-data" :title="`暂无${rt.label}`" />
        <EntityRelationSelector v-if="entity" :entity-id="entity.id" :entity-type="entityType" :relation-type="rt.relationType" :reverse-direction="rt.reverseDirection" />
      </template>

      <template #relations="{ entity }">
        <UniversalRelationPanel v-if="entity" :entity-id="entity.id" :entity-type="entityType" :storage-scope="entityType" />
      </template>
    </EntityDetailPanel>

    <EntityFormModal
      v-model="showForm"
      :title="editingEntity ? `编辑${entityLabel}` : `新建${entityLabel}`"
      :entity="editingEntity"
      :fields="formFields"
      :entity-type="entityType"
      @save="onFormSave"
    />
  </div>
</template>

<script setup lang="ts">
import { toastSuccess } from '@worldsmith/ui-kit'
import { useEntityEdit, useBatchDelete, useDuplicateNameCheck, useConfirm, useHighlight } from '../composables'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useEntityStore, useRelationStore, entitySchemaRegistry } from '@worldsmith/entity-core'
import type { Entity } from '@worldsmith/entity-core'
import DetailField from './DetailField.vue'
import CustomDropdown from './CustomDropdown.vue'
import CreateButton from './CreateButton.vue'
import DynamicFieldsAdder from './DynamicFieldsAdder.vue'
import UniversalRelationPanel from './UniversalRelationPanel.vue'
import EntityFormModal from './EntityFormModal.vue'
import EntityDetailPanel from './EntityDetailPanel.vue'
import EntityRelationSelector from './EntityRelationSelector.vue'
import type { FormFieldDef, RelationTabDef } from './types'
import { WsIcon, WsEmpty } from '@worldsmith/ui-kit'
import EntityCardCover from './EntityCardCover.vue'
import EntityCardBack from './EntityCardBack.vue'

const props = withDefaults(defineProps<{
  entityType: string
  formFields: FormFieldDef[]
  iconFn?: (entity: Entity) => string
  filterOptions?: { value: string; label: string }[]
  filterFieldKey?: string
  additionalFilter?: (entity: Entity) => boolean
  idPrefix?: string
  entityLabel?: string
  detailTabs?: RelationTabDef[]
}>(), {
  filterOptions: () => [{ value: '', label: '全部' }],
  idPrefix: '',
  entityLabel: '',
  detailTabs: () => [],
})

const entityStore = useEntityStore()
const relationStore = useRelationStore()
const { checkAndConfirmName } = useDuplicateNameCheck()
const { confirm } = useConfirm()

const listHighlight = useHighlight({
  getRelations: () => relationStore.relations,
})

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

const searchQuery = ref('')
const typeFilter = ref('')
const selectedEntity = ref<Entity | null>(null)
const showForm = ref(false)
const editingEntity = ref<Entity | null>(null)

const { isEditing, editForm, customFieldDefs, startEdit, cancelEdit, saveEdit } = useEntityEdit(selectedEntity)
const { selectedIds, toggleSelect, clearSelection, batchDelete } = useBatchDelete()

const entityLabel = computed(() => props.entityLabel || props.entityType)
const idPrefix = computed(() => props.idPrefix || `${props.entityType.slice(0, 3)}-`)
const resolvedIconFn = computed(() => props.iconFn || (() => entitySchemaRegistry.getIconName(props.entityType)))

const typeFieldKey = computed(() => {
  const schema = entitySchemaRegistry.get(props.entityType)
  const fields = schema?.fields || []
  return props.filterFieldKey || fields[0]?.key || ''
})

const coverFieldKey = computed(() => {
  const schema = entitySchemaRegistry.get(props.entityType)
  const fields = schema?.fields || []
  const imageField = fields.find((f: any) => f.type === 'image')
  return imageField?.key || 'coverImage'
})

const hasImageField = computed(() => {
  const schema = entitySchemaRegistry.get(props.entityType)
  const fields = schema?.fields || []
  return fields.some((f: any) => f.type === 'image')
})

const displayFields = computed(() => {
  const schema = entitySchemaRegistry.get(props.entityType)
  return (schema?.fields || []).filter((f: any) => f.key !== typeFieldKey.value)
})

const relationTabs = computed(() => props.detailTabs || [])

const resolvedTabs = computed(() => {
  const tabs = [{ id: 'info', label: '信息', icon: 'outline' }]
  for (const rt of relationTabs.value) {
    tabs.push({ id: rt.id, label: rt.label, icon: rt.icon })
  }
  tabs.push({ id: 'relations', label: '关联', icon: 'link' })
  return tabs
})

function getRelations(entityId: string, relationType: string) {
  return relationStore.relations.filter(r =>
    (r.sourceId === entityId || r.targetId === entityId) && r.type === relationType
  )
}

function getEntityName(rel: any) {
  const otherId = rel.sourceId === selectedEntity.value?.id ? rel.targetId : rel.sourceId
  return entityStore.entityMap.get(otherId)?.name || otherId
}

const list = computed(() => (entityStore.entities ?? []).filter(e => e.type === props.entityType))

const filteredList = computed(() => {
  let l = list.value
  const s = searchQuery.value.toLowerCase()
  if (s) l = l.filter(e => e.name.toLowerCase().includes(s))
  if (typeFilter.value && props.filterFieldKey) {
    l = l.filter(e => e.properties[props.filterFieldKey!] === typeFilter.value)
  }
  if (props.additionalFilter) {
    l = l.filter(props.additionalFilter)
  }
  return l
})

onMounted(async () => {
  try {
    await entityStore.loadAll()
    await relationStore.loadAll()
  } catch (err) {
    console.warn(`[GenericEntityView:${props.entityType}]`, err)
  }
})

function onGlobalKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && selectedEntity.value) {
    selectedEntity.value = null
  }
}
onMounted(() => window.addEventListener('keydown', onGlobalKeyDown))
onUnmounted(() => window.removeEventListener('keydown', onGlobalKeyDown))

function selectEntity(e: Entity) { selectedEntity.value = e; listHighlight.select(e.id) }
function openNewForm() { editingEntity.value = null; showForm.value = true }

async function onFormSave(data: { name: string; description: string; properties: Record<string, any>; tags: string[]; _autoLinkFields?: any[]; _coverPosition?: string; _coverZoom?: number }) {
  const now = new Date().toISOString()
  let savedEntityId: string | undefined
  if (editingEntity.value) {
    savedEntityId = editingEntity.value.id
    const updateData: Record<string, unknown> = {
      name: data.name, description: data.description,
      properties: data.properties, tags: data.tags,
    }
    if (data._coverPosition) updateData.coverPosition = data._coverPosition
    if (data._coverZoom) updateData.coverZoom = data._coverZoom
    await entityStore.update(editingEntity.value.id, updateData)
  } else {
    const checkedName = await checkAndConfirmName(data.name, undefined, props.entityType)
    if (!checkedName) return
    const id = `${idPrefix.value}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const entityData: Record<string, unknown> = {
      id,
      type: props.entityType,
      name: checkedName,
      description: data.description,
      properties: data.properties,
      tags: data.tags,
      createdAt: now, updatedAt: now,
    }
    if (data._coverPosition) entityData.coverPosition = data._coverPosition
    if (data._coverZoom) entityData.coverZoom = data._coverZoom
    await entityStore.add(entityData as Entity)
    savedEntityId = id
    toastSuccess('已创建')
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
  editingEntity.value = null
  await entityStore.loadAll()
}

async function onBatchDel() {
  const ok = await batchDelete(filteredList.value, entityLabel.value)
  if (ok) await entityStore.loadAll()
}

async function deleteEntity() {
  if (!selectedEntity.value) return
  const entity = entityStore.entityMap.get(selectedEntity.value.id)
  const relCount = relationStore.relations.filter(
    r => r.sourceId === selectedEntity.value!.id || r.targetId === selectedEntity.value!.id
  ).length
  const msg = relCount > 0
    ? `将删除「${entity?.name}」及其 ${relCount} 条关联关系，此操作不可完全撤销。`
    : `将删除「${entity?.name}」，此操作不可完全撤销。`
  if (!(await confirm({ type: 'danger', title: '确认删除', description: msg }))) return
  await entityStore.remove(selectedEntity.value.id)
  selectedEntity.value = null
  await entityStore.loadAll()
}
</script>

<style scoped>
.gev-root { display: flex; flex-direction: column; height: 100%; padding: 20px; }
.dp-rel-item { display: flex; align-items: center; gap: 6px; padding: 4px 0; font-size: var(--font-size-sm); }
.dp-rel-icon { color: var(--text-tertiary); }
.dp-rel-name { color: var(--text); }
</style>
