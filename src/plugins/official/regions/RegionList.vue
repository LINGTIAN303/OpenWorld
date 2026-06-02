<template>
  <div class="region-view">
    <div class="toolbar">
      <input v-model="searchQuery" placeholder="搜索区域..." class="search-input" @input="onSearch" />
      <CustomDropdown v-model="typeFilter" :options="typeFilterOptions" placeholder="全部类型" />
      <button class="btn-view" :class="{ active: isListView }"
        @click="onToggleListView"
        :title="viewMode === 'tree' ? '切换为卡片视图' : '切换为树形视图'">
        <WsIcon :name="viewMode === 'tree' ? 'grid' : 'tree'" size="sm" />
      </button>
      <button class="btn-view" :class="{ active: viewMode === 'map' }" @click="viewMode = 'map'" title="地图视图">M</button>
      <CreateButton label="新建区域" @click="openNewForm" />
      <button v-if="selectedIds.size > 0" class="btn-danger" @click="batchDelete(filteredRegions, '区域')">删除 ({{ selectedIds.size }})</button>
      <button v-if="selectedIds.size > 0" class="btn-ghost" @click="clearSelection">取消选择</button>
    </div>

    <div v-if="viewMode === 'tree'" class="tree-view">
      <div v-for="item in visibleTree" :key="item.entity.id" class="tree-item"
        :class="{ selected: selectedRegion?.id === item.entity.id, 'batch-selected': selectedIds.has(item.entity.id) }"
        :style="{ paddingLeft: (item.depth * 20 + 8) + 'px' }"
        @click="selectRegion(item.entity)">
        <span v-if="item.children.length" class="tree-toggle" @click.stop="toggleExpand(item.entity.id)">
          {{ expandedMap[item.entity.id] !== false ? 'v' : '>' }}
        </span>
        <span v-else class="tree-toggle tree-toggle-spacer"></span>
        <label class="batch-check-inline" @click.stop><input type="checkbox" :checked="selectedIds.has(item.entity.id)" @change="toggleSelect(item.entity.id)" /></label>
        <span><WsIcon :name="typeIcon(item.entity)" size="xs" /></span>
        <span>{{ item.entity.name }}</span>
        <span class="region-type">{{ item.entity.properties?.regionType }}</span>
      </div>
    </div>

    <div v-if="viewMode === 'grid'" class="region-grid">
      <div v-for="r in filteredRegions" :key="r.id"
        class="entity-card-wrapper"
        :class="{
          'is-flipped': flippedIds.has(r.id),
          'batch-selected': selectedIds.has(r.id),
        }"
      >
        <div class="entity-card-flipper">
          <div class="entity-card card-front" @click="selectRegion(r)">
            <input type="checkbox" class="batch-check" :checked="selectedIds.has(r.id)" @change="toggleSelect(r.id)" @click.stop />
            <EntityCardCover :entity="r" cover-field-key="coverImage" />
            <div class="card-header">
              <WsIcon class="card-icon" :name="typeIcon(r)" size="sm" />
              <div class="card-body">
                <h3>{{ r.name }}</h3>
                <p>{{ r.properties?.regionType || '区域' }}</p>
              </div>
            </div>
            <button class="card-flip-btn" @click.stop="toggleFlip(r.id)" title="翻转查看图片"><WsIcon name="refresh" size="xs" /></button>
          </div>
          <div class="entity-card card-back" @click="toggleFlip(r.id)">
            <EntityCardBack :entity="r" cover-field-key="coverImage" />
            <div class="card-back-info">
              <h3>{{ r.name }}</h3>
              <p>{{ r.properties?.regionType || '区域' }}</p>
            </div>
            <button class="card-flip-btn" @click.stop="toggleFlip(r.id)" title="翻转回正面"><WsIcon name="refresh" size="xs" /></button>
          </div>
        </div>
      </div>
    </div>

    <RegionMap v-if="viewMode === 'map'" :regions="filteredRegions.length ? filteredRegions : regionList" @select="selectRegion" />

    <LoadingSkeleton v-if="loading" :rows="5" />
    <EmptyState v-else-if="!regionList.length" icon="map" message="还没有区域" hint="创建第一个区域吧" actionText="创建区域" @action="openNewForm" />

    <EntityDetailPanel
      :key="selectedRegion?.id || ''"
      :visible="!!selectedRegion"
      :entity="selectedRegion"
      :icon="selectedRegion ? typeIcon(selectedRegion) : ''"
      :title="selectedRegion?.name || ''"
      :subtitle="selectedRegion?.properties?.regionType || '区域'"
      :tabs="regionTabs"
      :show-edit="true"
      :editing="isEditing"
      panel-id="detail-region"
      @close="selectedRegion = null"
      @edit="isEditing ? cancelEdit() : startEditWithEnclave()"
    >
      <template #overview="{ entity }">
        <div class="region-overview">
          <div class="detail-fields">
            <DetailField label="类型" :value="entity.properties?.regionType as any || ''"
              :editing="isEditing" type="select" :options="allTypeOptions"
              @update:value="editForm.regionType = $event" @commit="saveEdit" />

            <DetailField v-for="field in detailFields" :key="field.key"
              :label="field.label" :value="field.value as any"
              :editing="isEditing" type="text"
              @update:value="editForm[field.key] = $event" @commit="saveEdit" />
          </div>

          <DetailField label="封面图" :value="entity.properties?.coverImage as any || ''"
            :editing="isEditing" type="image" :entity-id="entity.id"
            :cover-position="entity.coverPosition" :cover-zoom="entity.coverZoom"
            @update:value="editForm.coverImage = $event"
            @update:cover-position="(val) => { editForm._coverPosition = val; entityStore.update(entity.id, { coverPosition: val }) }"
            @update:cover-zoom="(val) => { editForm._coverZoom = val; entityStore.update(entity.id, { coverZoom: val }) }"
            @commit="saveEdit" />

          <DetailField label="描述" :value="entity.description as any || ''"
            :editing="isEditing" type="textarea"
            @update:value="editForm._description = $event" @commit="saveEdit" />

        <div class="region-field-row">
          <span class="region-field-key">父级区域</span>
          <CustomDropdown v-if="isEditing" :model-value="String(editForm.parentId || '')" @update:model-value="editForm.parentId = $event" :options="parentRegionOptions" placeholder="无" />
          <span v-else class="region-field-val">{{ getParentName(entity.id) || '无' }}</span>
        </div>

        <div class="region-field-row">
          <span class="region-field-key">飞地联结</span>
          <CustomDropdown v-if="isEditing" :model-value="String(editForm.enclaveOfId || '')" @update:model-value="editForm.enclaveOfId = $event" :options="parentRegionOptions" placeholder="无" />
          <span v-else class="region-field-val">{{ getEnclaveName(entity.id) || '无' }}</span>
        </div>

        <DynamicFieldsAdder entity-type="region" v-model="editForm" :field-defs="customFieldDefs" @update:field-defs="customFieldDefs = $event" />

        <div class="detail-edit-bar" v-if="isEditing">
          <button class="btn-primary btn-sm" @click="onSaveEdit">保存修改</button>
        </div>
        <UniversalRelationPanel v-if="entity?.id" :entity-id="entity.id" entity-type="region" storage-scope="region" />
        </div>
      </template>

      <template #subregions="{ entity }">
        <div v-for="child in childRegions" :key="child.id" class="rel-item" role="button" tabindex="0" @click="selectRegion(child)" @keydown.enter="selectRegion(child)">
          <WsIcon :name="typeIcon(child)" size="xs" /> {{ child.name }}
          <span class="rel-type-badge">{{ child.properties?.regionType || '区域' }}</span>
          <button class="rel-remove" @click.stop="removeLocatedIn(child.id)" title="移除"><WsIcon name="close" size="xs" /></button>
        </div>
        <p v-if="childRegions.length === 0" class="rel-empty">尚无子区域</p>
        <EntityRelationSelector v-if="entity" :entity-id="entity.id" entity-type="region" relation-type="located_in" :reverse-direction="true" />
      </template>

      <template #enclaves="{ entity }">
        <div v-for="enc in enclaveRegions" :key="enc.id" class="rel-item" role="button" tabindex="0" @click="selectRegion(enc)" @keydown.enter="selectRegion(enc)">
          <WsIcon :name="typeIcon(enc)" size="xs" /> {{ enc.name }}
          <button class="rel-remove" @click.stop="removeEnclave(enc.id)" title="移除"><WsIcon name="close" size="xs" /></button>
        </div>
        <p v-if="enclaveRegions.length === 0" class="rel-empty">尚无飞地</p>
        <EntityRelationSelector v-if="entity" :entity-id="entity.id" entity-type="region" relation-type="enclave_of" :reverse-direction="true" />
      </template>

      <template #controllers="{ entity }">
        <div v-for="ctrl in controllingOrgs" :key="ctrl.relation.id" class="rel-item">
          <WsIcon name="building" size="xs" /> {{ ctrl.org?.name || '(未知)' }}
          <button class="rel-remove" @click="removeRelation(ctrl.relation.id)" title="移除"><WsIcon name="close" size="xs" /></button>
        </div>
        <p v-if="controllingOrgs.length === 0" class="rel-empty">尚无控制势力</p>
        <EntityRelationSelector v-if="entity" :entity-id="entity.id" entity-type="region" relation-type="controls" :reverse-direction="true" />
      </template>

      <template #residents="{ entity }">
        <div v-for="res in residentCharacters" :key="res.relation.id" class="rel-item">
          <WsIcon name="user" size="xs" /> {{ res.character?.name || '(未知)' }}
          <button class="rel-remove" @click="removeRelation(res.relation.id)" title="移除"><WsIcon name="close" size="xs" /></button>
        </div>
        <p v-if="residentCharacters.length === 0" class="rel-empty">尚无驻扎角色</p>
        <EntityRelationSelector v-if="entity" :entity-id="entity.id" entity-type="region" relation-type="resides_in" :reverse-direction="true" />
      </template>
    </EntityDetailPanel>

    <EntityFormModal
      v-model="showForm"
      :title="editingRegion ? '编辑区域' : '新建区域'"
      :entity="editingRegion"
      :fields="regionFields"
      :entity-type="'region'"
      @save="onFormSave"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted, onBeforeUnmount, onUnmounted } from 'vue'
import WsIcon from '../../../ui/WsIcon.vue'
import { useEntityStore, useRelationStore } from '@worldsmith/entity-core'
import { LoadingSkeleton, EmptyState, RegionMap, UniversalRelationPanel, DynamicFieldsAdder, CustomDropdown, DetailField, EntityFormModal, CreateButton, EntityRelationSelector, EntityDetailPanel, EntityCardCover, EntityCardBack, useEntityEdit, useBatchDelete, useDuplicateNameCheck, toastSuccess, useShortcuts, useUndoRedo } from '@worldsmith/ui-kit'
import { storage } from '@worldsmith/entity-core'
import { useSettingsStore } from '../../../stores/settingsStore'
import { regionFields, regionTypeOptions, typeIconMap, fieldOrder, fieldLabelMap } from './regionConfig'
import { getRelationLabel } from '@worldsmith/entity-core'

const entityStore = useEntityStore()
const { checkAndConfirmName } = useDuplicateNameCheck()
const relationStore = useRelationStore()
const { register, unregister } = useShortcuts()
const { undo, redo } = useUndoRedo()
const settingsStore = useSettingsStore()
const loading = ref(true)
const searchQuery = ref('')
const typeFilter = ref('')
const viewMode = ref<string>('tree')
const isListView = computed(() => viewMode.value === 'tree' || viewMode.value === 'grid')
function onToggleListView() { viewMode.value = viewMode.value === 'tree' ? 'grid' : 'tree' }
const selectedRegion = ref<any>(null)
const showForm = ref(false)
const editingRegion = ref<any>(null)
const expandedMap = reactive<Record<string, boolean>>({})
const flippedIds = ref(new Set<string>())

function toggleFlip(id: string) {
  if (flippedIds.value.has(id)) {
    flippedIds.value.delete(id)
  } else {
    flippedIds.value.add(id)
  }
}

const { isEditing, editForm, customFieldDefs, startEdit, cancelEdit, saveEdit } = useEntityEdit(selectedRegion as any)
const { selectedIds, toggleSelect, clearSelection, batchDelete } = useBatchDelete()

const regionTabs = [
  { id: 'overview', icon: 'outline', label: '概览' },
  { id: 'subregions', icon: 'location', label: '子区域' },
  { id: 'enclaves', icon: 'location', label: '飞地' },
  { id: 'controllers', icon: 'building', label: '控制势力' },
  { id: 'residents', icon: 'user', label: '驻扎角色' },
]

function toggleExpand(id: string) {
  expandedMap[id] = expandedMap[id] !== false ? false : true
}

const allTypeOptions = computed(() => {
  const customTypes = new Set(regionList.value.map(r => r.properties?.regionType as string).filter(Boolean))
  const result = [...regionTypeOptions]
  for (const ct of customTypes) { if (!result.includes(ct)) result.push(ct) }
  return result
})

const typeFilterOptions = computed(() => [
  { value: '', label: '全部类型' },
  ...allTypeOptions.value.map(t => ({ value: t, label: t })),
])

const parentRegionOptions = computed(() => [
  { value: '', label: '无' },
  ...regionList.value
    .filter(p => p.id !== selectedRegion.value?.id)
    .map(p => ({ value: p.id, label: p.name })),
])

const detailFields = computed(() => {
  const r = selectedRegion.value
  if (!r) return []
  return fieldOrder.map(key => ({
    key,
    label: fieldLabelMap[key] || key,
    value: r.properties?.[key] || '',
  }))
})

const regionList = computed(() => entityStore.entities.filter(e => e.type === 'region'))
const filteredRegions = computed(() => {
  let list = regionList.value
  if (typeFilter.value) list = list.filter(r => r.properties?.regionType === typeFilter.value)
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(r => r.name.toLowerCase().includes(q))
  }
  return list
})

interface TreeItem {
  entity: any
  depth: number
  children: TreeItem[]
}

const regionTree = computed(() => {
  const regions = filteredRegions.value
  const rels = relationStore.relations
  const parentMap: Record<string, string> = {}
  const enclaveMap: Record<string, string> = {}
  for (const rel of rels) {
    if (rel.type === 'located_in') {
      parentMap[rel.sourceId] = rel.targetId
    }
    if (rel.type === 'enclave_of') {
      enclaveMap[rel.sourceId] = rel.targetId
    }
  }
  const roots: any[] = []
  const childrenMap: Record<string, any[]> = {}
  const regionIds = new Set(regions.map(r => r.id))
  for (const r of regions) {
    const pid = parentMap[r.id]
    const eid = enclaveMap[r.id]
    if (pid && regionIds.has(pid)) {
      if (!childrenMap[pid]) childrenMap[pid] = []
      childrenMap[pid].push(r)
    } else if (eid && regionIds.has(eid)) {
      if (!childrenMap[eid]) childrenMap[eid] = []
      childrenMap[eid].push(r)
    } else {
      roots.push(r)
    }
  }
  function buildItems(items: any[], depth: number): TreeItem[] {
    return items.map(e => ({
      entity: e, depth,
      children: childrenMap[e.id] ? buildItems(childrenMap[e.id], depth + 1) : [],
    }))
  }
  return buildItems(roots, 0)
})

const visibleTree = computed(() => {
  function walk(items: TreeItem[]): TreeItem[] {
    const result: TreeItem[] = []
    for (const item of items) {
      result.push(item)
      if (expandedMap[item.entity.id] !== false && item.children.length > 0) {
        result.push(...walk(item.children))
      }
    }
    return result
  }
  return walk(regionTree.value)
})

const regionRelations = computed(() => {
  if (!selectedRegion.value) return []
  const id = selectedRegion.value.id
  return relationStore.relations.filter(r => r.sourceId === id || r.targetId === id)
})

function getRelationPartner(rel: any) {
  const otherId = rel.sourceId === selectedRegion.value?.id ? rel.targetId : rel.sourceId
  return entityStore.entityMap.get(otherId)?.name || otherId
}

function getParentName(id: string) {
  const rel = relationStore.relations.find(r => r.type === 'located_in' && r.sourceId === id)
  return rel ? entityStore.entityMap.get(rel.targetId)?.name || '' : ''
}

function getEnclaveName(id: string) {
  const rel = relationStore.relations.find(r => r.type === 'enclave_of' && r.sourceId === id)
  return rel ? entityStore.entityMap.get(rel.targetId)?.name || '' : ''
}

function startEditWithEnclave() {
  startEdit()
  const existingEnclaveRel = relationStore.relations.find(r => r.type === 'enclave_of' && r.sourceId === selectedRegion.value?.id)
  ;(editForm.value as any).enclaveOfId = existingEnclaveRel?.targetId || ''
  const existingParentRel = relationStore.relations.find(r => r.type === 'located_in' && r.sourceId === selectedRegion.value?.id)
  ;(editForm.value as any).parentId = existingParentRel?.targetId || ''
}

function typeIcon(r: any) { return typeIconMap[r.properties?.regionType as string] || 'location' }
function selectRegion(r: any) { selectedRegion.value = r }

const childRegions = computed(() => {
  if (!selectedRegion.value) return []
  const parentId = selectedRegion.value.id
  return regionList.value.filter(r => {
    const rel = relationStore.relations.find(rel => rel.type === 'located_in' && rel.sourceId === r.id && rel.targetId === parentId)
    return !!rel
  })
})

const enclaveRegions = computed(() => {
  if (!selectedRegion.value) return []
  const parentId = selectedRegion.value.id
  return regionList.value.filter(r => {
    const rel = relationStore.relations.find(rel => rel.type === 'enclave_of' && rel.sourceId === r.id && rel.targetId === parentId)
    return !!rel
  })
})

const controllingOrgs = computed(() => {
  if (!selectedRegion.value) return []
  const regionId = selectedRegion.value.id
  return relationStore.relations
    .filter(r => r.type === 'controls' && r.targetId === regionId)
    .map(r => ({ relation: r, org: entityStore.entityMap.get(r.sourceId) }))
})

const residentCharacters = computed(() => {
  if (!selectedRegion.value) return []
  const regionId = selectedRegion.value.id
  return relationStore.relations
    .filter(r => r.type === 'resides_in' && r.targetId === regionId)
    .map(r => ({ relation: r, character: entityStore.entityMap.get(r.sourceId) }))
})

async function removeLocatedIn(childId: string) {
  const rel = relationStore.relations.find(r => r.type === 'located_in' && r.sourceId === childId && r.targetId === selectedRegion.value?.id)
  if (rel) { await relationStore.remove(rel.id); await relationStore.loadAll() }
}

async function removeEnclave(encId: string) {
  const rel = relationStore.relations.find(r => r.type === 'enclave_of' && r.sourceId === encId && r.targetId === selectedRegion.value?.id)
  if (rel) { await relationStore.remove(rel.id); await relationStore.loadAll() }
}

async function removeRelation(relId: string) {
  await relationStore.remove(relId)
  await relationStore.loadAll()
}

function onWsSelectEntity(e: Event) {
  const detail = (e as CustomEvent).detail
  if (detail?.entityId) {
    const entity = entityStore.entityMap.get(detail.entityId)
    if (entity && entity.type === 'region') {
      selectedRegion.value = entity
    }
  }
}

function openNewForm() {
  editingRegion.value = null
  showForm.value = true
}

async function onFormSave(data: { name: string; description: string; properties: Record<string, any>; tags: string[]; _coverPosition?: string; _coverZoom?: number }) {
  const now = new Date().toISOString()

  if (editingRegion.value) {
    const updateData: Record<string, unknown> = {
      name: data.name,
      description: data.description,
      properties: data.properties,
      tags: data.tags,
    }
    if (data._coverPosition) updateData.coverPosition = data._coverPosition
    if (data._coverZoom) updateData.coverZoom = data._coverZoom
    await entityStore.update(editingRegion.value.id, updateData)
  } else {
    const checkedName = await checkAndConfirmName(data.name, undefined, 'region')
    if (!checkedName) return
    const entity: any = {
      id: 'region-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      type: 'region', name: checkedName, description: data.description, tags: data.tags,
      properties: {
        regionType: data.properties.regionType || '区域',
        climate: data.properties.climate || '',
        population: data.properties.population || '',
        area: data.properties.area || '',
        government: data.properties.government || '',
      },
      createdAt: now, updatedAt: now,
    }
    await entityStore.add(entity)
    toastSuccess('已创建')
  }

  showForm.value = false
  editingRegion.value = null
  await entityStore.loadAll()
}

async function onSaveEdit() {
  await saveEdit(undefined, async (id, form2) => {
    const parentId = (form2 as any).parentId
    const existingRel = relationStore.relations.find(r => r.type === 'located_in' && r.sourceId === id)
    if (parentId) {
      if (existingRel) {
        if (existingRel.targetId !== parentId) {
          await relationStore.update(existingRel.id, { targetId: parentId } as any)
        }
      } else {
        const now = new Date().toISOString()
        await storage.putRelation({
          id: 'rel-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          type: 'located_in', sourceId: id, targetId: parentId,
          label: '', properties: {},
          createdAt: now, updatedAt: now,
        })
      }
    } else if (existingRel) {
      await storage.deleteRelation(existingRel.id)
    }
    const enclaveOfId = (form2 as any).enclaveOfId
    const existingEnclaveRel = relationStore.relations.find(r => r.type === 'enclave_of' && r.sourceId === id)
    if (enclaveOfId) {
      if (existingEnclaveRel) {
        if (existingEnclaveRel.targetId !== enclaveOfId) {
          await relationStore.update(existingEnclaveRel.id, { targetId: enclaveOfId } as any)
        }
      } else {
        const now = new Date().toISOString()
        await storage.putRelation({
          id: 'rel-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          type: 'enclave_of', sourceId: id, targetId: enclaveOfId,
          label: '', properties: {},
          createdAt: now, updatedAt: now,
        })
      }
    } else if (existingEnclaveRel) {
      await storage.deleteRelation(existingEnclaveRel.id)
    }
    await relationStore.loadAll()
  })
}

function onSearch() {}

onMounted(async () => {
  try {

  loading.value = true
  await entityStore.loadAll()
  await relationStore.loadAll()
  loading.value = false
  } catch (err) {
    console.warn('[RegionList]', err)
  }

  window.addEventListener('ws-select-entity', onWsSelectEntity)

  const undoKeys = settingsStore.getShortcut('global.undo') || ['ctrl', 'z']
  const redoKeys = settingsStore.getShortcut('global.redo') || ['ctrl', 'y']
  register({ id: 'region.undo', keys: undoKeys, scope: 'view', description: '撤销', handler: () => undo(entityStore, relationStore) })
  register({ id: 'region.redo', keys: redoKeys, scope: 'view', description: '重做', handler: () => redo(entityStore, relationStore) })
})

onBeforeUnmount(() => {
  window.removeEventListener('ws-select-entity', onWsSelectEntity)
  unregister('region.undo')
  unregister('region.redo')
})

function onDetailEsc(e: KeyboardEvent) {
  if (e.key === 'Escape' && selectedRegion.value) {
    selectedRegion.value = null
  }
}
onMounted(() => window.addEventListener('keydown', onDetailEsc))
onUnmounted(() => window.removeEventListener('keydown', onDetailEsc))
</script>

<style scoped>
.region-view { padding: 20px; height: 100%; display: flex; flex-direction: column; }
.toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.search-input { padding: 6px 10px; border: 1px solid var(--border-color); border-radius: 4px; font-size: var(--font-size-sm); width: 180px; }
.filter-select { padding: 6px 8px; border: 1px solid var(--border-color); border-radius: 4px; font-size: var(--font-size-sm); }
.btn-view { width: 36px; height: 36px; border: 1px solid var(--border-color); border-radius: 4px; cursor: pointer; font-size: var(--font-size-base); background: var(--card-bg); }
.btn-view.active { border-color: var(--primary); background: var(--primary-light); }
.btn-primary { padding: 8px 16px; background: var(--primary); color: var(--text); border: none; border-radius: 4px; cursor: pointer; font-size: var(--font-size-sm); }
.region-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; flex: 1; overflow-y: auto; align-content: start; align-items: start; }
.region-grid :deep(.entity-card-wrapper) { align-self: start; }
.region-grid :deep(.entity-card-flipper) { min-height: 0; }
.region-grid :deep(.entity-card) { min-height: 0; }
.region-grid :deep(.card-cover-wrap) { min-height: 0; }
.tree-view { flex: 1; overflow-y: auto; }
.tree-item { display: flex; align-items: center; gap: 6px; padding: 6px 8px; cursor: pointer; font-size: var(--font-size-base); }
.tree-item:hover { background: var(--hover-bg); }
.tree-item.selected { background: var(--accent-bg); font-weight: var(--font-weight-semibold); }
.tree-item.batch-selected { background: var(--primary-light, #eef2ff) !important; }
.tree-toggle { width: 14px; font-size: var(--font-size-xs); color: var(--text-tertiary); cursor: pointer; user-select: none; flex-shrink: 0; }
.tree-toggle-spacer { visibility: hidden; }
.region-type { font-size: var(--font-size-xs); color: var(--text-tertiary); margin-left: auto; }
.batch-check-inline { display: inline-flex; align-items: center; }
.batch-check-inline input[type="checkbox"] { margin: 0; cursor: pointer; accent-color: var(--primary, #4f46e5); }

.region-overview { text-align: left; }
.region-overview .detail-fields {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 6px 12px;
  margin: 4px 0 12px;
}
.region-overview :deep(.detail-field-row) {
  min-width: 0;
}

.detail-edit-bar { display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap; padding-top: 12px; border-top: 1px solid var(--border-color); }
.region-field-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: var(--font-size-sm); }
.region-field-row .region-field-key { color: var(--text-secondary); min-width: 64px; flex-shrink: 0; }
.region-field-row .region-field-val { color: var(--text); flex: 1; }

.rel-item { display: flex; align-items: center; gap: 6px; padding: 6px 0; font-size: var(--font-size-sm); cursor: pointer; }
.rel-item:hover { background: var(--hover-bg); border-radius: 4px; }
.rel-type-badge { font-size: var(--font-size-xs); color: var(--text-tertiary); margin-left: 4px; }
.rel-remove { margin-left: auto; background: none; border: none; cursor: pointer; color: var(--text-tertiary); padding: 2px; border-radius: 4px; display: flex; align-items: center; }
.rel-remove:hover { color: var(--danger); background: var(--danger-light); }
.rel-empty { font-size: var(--font-size-sm); color: var(--text-tertiary); }

.btn-sm { padding: 5px 12px; background: var(--bg-tertiary); color: var(--text); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; font-size: var(--font-size-sm); }
</style>
