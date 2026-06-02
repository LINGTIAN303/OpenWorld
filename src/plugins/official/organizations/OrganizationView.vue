<template>
  <div class="org-view">
    <!-- Toolbar -->
    <div class="toolbar">
      <input v-model="searchQuery" placeholder="搜索势力..." class="search-input" @input="onSearch" />
      <CustomDropdown v-model="typeFilter" :options="orgTypeFilterOptions" />
      <CreateButton label="新建势力" @click="openNewForm" />
      <button v-if="selectedIds.size > 0" class="btn-danger" @click="batchDelete(filteredOrgs, '势力')"><WsIcon name="delete" size="xs" /> 删除 ({{ selectedIds.size }})</button>
      <button v-if="selectedIds.size > 0" class="btn-ghost" @click="clearSelection">取消选择</button>
    </div>

    <!-- Main content: tree + grid toggle -->
    <div class="org-content">
      <!-- Tree View -->
      <div class="org-tree">
        <OrgTreeNode
          v-for="node in orgTree"
          :key="node.entity.id"
          :node="node"
          :depth="0"
          :selected-id="selectedOrg?.id"
          :selected-ids="selectedIds"
          @select="selectOrg"
          @toggle-select="toggleSelect"
          @add-child="openNewFormWithParent"
        />
        <p v-if="orgTree.length === 0 && !loading" class="empty">还没有势力，点击上方按钮创建</p>
      </div>

      <Transition name="ws-detail-backdrop">
        <div v-if="selectedOrg" class="detail-backdrop"></div>
      </Transition>
      <Transition name="ws-detail-slide">
      <div v-if="selectedOrg" class="detail-panel" :style="{ width: detailResizable.width.value + 'px' }">
        <div class="resize-handle-left" @mousedown="detailResizable.onResizeStart"></div>

        <div class="detail-header">
          <span class="detail-icon"><WsIcon :name="orgTypeIcon(selectedOrg)" size="lg" /></span>
          <div>
            <input v-if="isEditing" v-model="editForm._name" style="font-size:var(--font-size-xl);font-weight:var(--font-weight-semibold);border:none;border-bottom:1px solid var(--border-color);background:transparent;color:var(--text-color);width:100%;" />
            <h2 v-else>{{ selectedOrg.name }}</h2>
            <p class="detail-type">{{ selectedOrg.properties.orgType as string || '势力' }}</p>
          </div>
          <button class="detail-edit-toggle" :class="{ active: isEditing }" @click="isEditing ? cancelEdit() : startEdit()">{{ isEditing ? '取消' : '编辑' }}</button>
          <button class="detail-close" @click="selectedOrg = null"><WsIcon name="close" size="xs" /></button>
        </div>

        <div class="dp-tabs">
          <button v-for="tab in orgTabs" :key="tab.id" class="dp-tab"
            :class="{ active: activeTab === tab.id }"
            @click="activeTab = tab.id">
            <WsIcon :name="tab.icon" size="xs" /> {{ tab.label }}
          </button>
        </div>

        <div class="dp-scroll-area">
        <div v-if="activeTab === 'overview'" class="dp-tab-content">
          <div class="detail-fields">
            <template v-for="(val, key) in visibleFields(selectedOrg)" :key="key">
              <DetailField :label="fieldLabel(key as string)" :value="val" :editing="isEditing" :type="fieldType(key as string)"
                :entity-id="selectedOrg.id"
                :cover-position="selectedOrg.coverPosition"
                :cover-zoom="selectedOrg.coverZoom"
                @update:value="editForm[key] = $event"
                @update:cover-position="(val) => { editForm._coverPosition = val; entityStore.update(selectedOrg.id, { coverPosition: val }) }"
                @update:cover-zoom="(val) => { editForm._coverZoom = val; entityStore.update(selectedOrg.id, { coverZoom: val }) }"
                @commit="saveEdit" />
            </template>
          </div>
          <DetailField label="描述" :value="selectedOrg.description" :editing="isEditing" type="textarea"
            @update:value="editForm._description = $event" @commit="saveEdit" />
          <DynamicFieldsAdder entity-type="organization" v-model="editForm" :field-defs="customFieldDefs" @update:field-defs="customFieldDefs = $event" />
          <div class="detail-edit-bar" v-if="isEditing">
            <button class="btn-primary btn-sm" @click="saveEdit()">保存</button>
          </div>
          <UniversalRelationPanel v-if="selectedOrg?.id" :entity-id="selectedOrg.id" entity-type="organization" storage-scope="organization" />
        </div>

        <div v-else-if="activeTab === 'members'" class="dp-tab-content">
          <div v-for="m in members" :key="m.relation.id" class="rel-item">
            <span class="rel-name">{{ m.character?.name || '(未知)' }}</span>
            <span v-if="m.relation.properties.role" class="rel-role">{{ m.relation.properties.role }}</span>
            <button class="rel-remove" @click="removeRelation(m.relation.id)" title="移除"><WsIcon name="close" size="xs" /></button>
          </div>
          <p v-if="members.length === 0" class="rel-empty">尚无成员</p>
          <EntityRelationSelector v-if="selectedOrg" :entity-id="selectedOrg.id" entity-type="organization" relation-type="member_of" :reverse-direction="true" />
        </div>

        <div v-else-if="activeTab === 'suborgs'" class="dp-tab-content">
          <div v-for="sub in subOrgs" :key="sub.id" class="rel-item" role="button" tabindex="0" @click="selectOrg(sub)" @keydown.enter="selectOrg(sub)">
            <WsIcon :name="orgTypeIcon(sub)" size="xs" /> {{ sub.name }}
            <button class="rel-remove" @click.stop="removeSubOrg(sub.id)" title="移除"><WsIcon name="close" size="xs" /></button>
          </div>
          <p v-if="subOrgs.length === 0" class="rel-empty">尚无下属势力</p>
          <EntityRelationSelector v-if="selectedOrg" :entity-id="selectedOrg.id" entity-type="organization" relation-type="sub_organization" :reverse-direction="true" />
        </div>

        <div v-else-if="activeTab === 'territories'" class="dp-tab-content">
          <div v-for="t in territories" :key="t.relation.id" class="rel-item">
            <span class="rel-name">{{ t.region?.name || '(未知)' }}</span>
            <button class="rel-remove" @click="removeRelation(t.relation.id)" title="移除"><WsIcon name="close" size="xs" /></button>
          </div>
          <p v-if="territories.length === 0" class="rel-empty">尚无控制区域</p>
          <EntityRelationSelector v-if="selectedOrg" :entity-id="selectedOrg.id" entity-type="organization" relation-type="controls" />
        </div>

        <div v-else-if="activeTab === 'diplomacy'" class="dp-tab-content">
          <div v-for="rel in diplomacy" :key="rel.relation.id" class="rel-item" :class="rel.class">
            <WsIcon :name="rel.icon" size="xs" /> {{ rel.label }}
            <button class="rel-remove" @click="removeRelation(rel.relation.id)" title="移除"><WsIcon name="close" size="xs" /></button>
          </div>
          <p v-if="diplomacy.length === 0" class="rel-empty">尚无外交关系</p>
          <EntityRelationSelector v-if="selectedOrg" :entity-id="selectedOrg.id" entity-type="organization" relation-type="allied_with" />
        </div>
        </div>
      </div>
      </Transition>
    </div>

    <!-- New/Edit Form -->
    <EntityFormModal
      ref="formModalRef"
      v-model="showForm"
      :title="editingOrg ? '编辑势力' : '新建势力'"
      :entity="editingOrg"
      :fields="orgFields"
      :entity-type="'organization'"
      @save="onFormSave"
    />
    <div v-if="showForm && parentCandidate" class="efm-parent-hint">
      上级势力：{{ parentCandidate.name }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import WsIcon from '../../../ui/WsIcon.vue'
import { useEntityStore, useRelationStore, entitySchemaRegistry } from '@worldsmith/entity-core'
import type { Entity, Relation } from '@worldsmith/entity-core'
import OrgTreeNode from './OrgTreeNode.vue'
import { DetailField, CustomDropdown, EntityFormModal, CreateButton, UniversalRelationPanel, EntityRelationSelector, useEntityEdit, useBatchDelete, useDuplicateNameCheck, useShortcuts, useUndoRedo, useResizable } from '@worldsmith/ui-kit'
import { useSettingsStore } from '../../../stores/settingsStore'
import { orgTypes, orgTypeFilterOptions, orgFields } from './organizationConfig'

const detailResizable = useResizable({ panelId: 'detail-organization', defaultWidth: 380, minWidth: 240, side: 'left' })

const entityStore = useEntityStore()
const { checkAndConfirmName } = useDuplicateNameCheck()
const relationStore = useRelationStore()
const orgSchema = computed(() => entitySchemaRegistry.get('organization'))
const { register, unregister } = useShortcuts()
const { undo, redo } = useUndoRedo()
const settingsStore = useSettingsStore()

const searchQuery = ref('')
const typeFilter = ref('')
const loading = ref(false)
const showForm = ref(false)
const selectedOrg = ref<Entity | null>(null)
const editingOrg = ref<Entity | null>(null)
const parentCandidate = ref<Entity | null>(null)
const formModalRef = ref<InstanceType<typeof EntityFormModal> | null>(null)
const activeTab = ref('overview')
const orgTabs = [
  { id: 'overview', icon: 'outline', label: '概览' },
  { id: 'members', icon: 'user', label: '成员' },
  { id: 'suborgs', icon: 'building', label: '下属势力' },
  { id: 'territories', icon: 'location', label: '控制区域' },
  { id: 'diplomacy', icon: 'link', label: '外交关系' },
]

/* ─── 数据 ─── */

const orgList = computed(() => entityStore.entities.filter(e => e.type === 'organization'))

const filteredOrgs = computed(() => {
  let list = orgList.value
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(o => o.name.toLowerCase().includes(q) || o.description.toLowerCase().includes(q))
  }
  if (typeFilter.value) list = list.filter(o => (o.properties.orgType as string) === typeFilter.value)
  return list
})

/* ─── 树结构 ─── */

interface OrgTreeNodeData {
  entity: Entity
  children: OrgTreeNodeData[]
}

const subOrgRels = computed(() => relationStore.relations.filter(r => r.type === 'sub_organization'))

const orgTree = computed(() => {
  const childIds = new Set(subOrgRels.value.map(r => r.sourceId))
  const topLevel = filteredOrgs.value.filter(o => !childIds.has(o.id))

  function buildTree(entities: Entity[]): OrgTreeNodeData[] {
    return entities.map(e => ({
      entity: e,
      children: buildTree(filteredOrgs.value.filter(c =>
        subOrgRels.value.some(r => r.sourceId === c.id && r.targetId === e.id)
      )),
    }))
  }

  return buildTree(topLevel)
})

/* ─── 详情数据 ─── */

const members = computed(() => {
  const rels = relationStore.relations.filter(r => r.type === 'member_of' && r.targetId === selectedOrg.value?.id)
  return rels.map(r => ({
    relation: r,
    character: entityStore.entityMap.get(r.sourceId),
  }))
})

const subOrgs = computed(() => {
  const childIds = subOrgRels.value.filter(r => r.targetId === selectedOrg.value?.id).map(r => r.sourceId)
  return orgList.value.filter(o => childIds.includes(o.id))
})

const territories = computed(() => {
  const rels = relationStore.relations.filter(r => r.type === 'controls' && r.sourceId === selectedOrg.value?.id)
  return rels.map(r => ({
    relation: r,
    region: entityStore.entityMap.get(r.targetId),
  }))
})

const diplomacy = computed(() => {
  if (!selectedOrg.value) return []
  const all = relationStore.relations.filter(r =>
    (r.sourceId === selectedOrg.value!.id || r.targetId === selectedOrg.value!.id) &&
    (r.type === 'allied_with' || r.type === 'at_war_with' || r.type === 'trade_with')
  )
  return all.map(r => {
    const otherId = r.sourceId === selectedOrg.value!.id ? r.targetId : r.sourceId
    const other = entityStore.entityMap.get(otherId)
    const name = other?.name || '(未知)'
    if (r.type === 'allied_with') return { relation: r, label: `盟友：${name}`, icon: 'handshake', class: 'diplo-ally' }
    if (r.type === 'at_war_with') return { relation: r, label: `交战：${name}`, icon: 'sword', class: 'diplo-war' }
    if (r.type === 'trade_with') return { relation: r, label: `贸易：${name}`, icon: 'item', class: 'diplo-trade' }
    return { relation: r, label: name, icon: 'link', class: '' }
  })
})

onMounted(async () => {
  try {

  loading.value = true
  await entityStore.loadAll()
  await relationStore.loadAll()
  loading.value = false
  } catch (err) {
    console.warn('[OrganizationView]', err)
  }

  const undoKeys = settingsStore.getShortcut('global.undo') || ['ctrl', 'z']
  const redoKeys = settingsStore.getShortcut('global.redo') || ['ctrl', 'y']
  register({ id: 'org.undo', keys: undoKeys, scope: 'view', description: '撤销', handler: () => undo(entityStore, relationStore) })
  register({ id: 'org.redo', keys: redoKeys, scope: 'view', description: '重做', handler: () => redo(entityStore, relationStore) })
})

function onDetailEsc(e: KeyboardEvent) {
  if (e.key === 'Escape' && selectedOrg.value) {
    selectedOrg.value = null
  }
}
onMounted(() => window.addEventListener('keydown', onDetailEsc))
onUnmounted(() => {
  window.removeEventListener('keydown', onDetailEsc)
  unregister('org.undo')
  unregister('org.redo')
})

/* ─── 操作 ─── */

function openNewForm() { editingOrg.value = null; parentCandidate.value = null; showForm.value = true }
function openNewFormWithParent(parent: Entity) { editingOrg.value = null; parentCandidate.value = parent; showForm.value = true }

const { isEditing, editForm, customFieldDefs, startEdit, cancelEdit, saveEdit } = useEntityEdit(selectedOrg)

async function onFormSave(data: { name: string; description: string; properties: Record<string, any>; tags: string[]; _coverPosition?: string; _coverZoom?: number }) {
  const now = new Date().toISOString()

  if (editingOrg.value) {
    const updateData: Record<string, unknown> = { name: data.name, description: data.description, properties: data.properties, tags: data.tags }
    if (data._coverPosition) updateData.coverPosition = data._coverPosition
    if (data._coverZoom) updateData.coverZoom = data._coverZoom
    await entityStore.update(editingOrg.value.id, updateData)
  } else {
    const checkedName = await checkAndConfirmName(data.name, undefined, 'organization')
    if (!checkedName) return
    const entity: Entity = {
      id: `org-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'organization',
      name: checkedName,
      description: data.description,
      properties: data.properties,
      tags: data.tags,
      createdAt: now, updatedAt: now,
    }
    await entityStore.add(entity)

    if (parentCandidate.value) {
      const rel: Relation = {
        id: `rel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'sub_organization',
        sourceId: entity.id,
        targetId: parentCandidate.value.id,
        properties: {},
        createdAt: now, updatedAt: now,
      }
      await relationStore.add(rel)
    }
    await formModalRef.value?.syncEntityRefAfterCreate(entity.id)
  }

  showForm.value = false; editingOrg.value = null; parentCandidate.value = null
  await entityStore.loadAll(); await relationStore.loadAll()
}

function selectOrg(org: Entity) { selectedOrg.value = org }

async function removeRelation(relId: string) {
  await relationStore.remove(relId)
  await relationStore.loadAll()
}

async function removeSubOrg(childId: string) {
  if (!selectedOrg.value) return
  const rel = subOrgRels.value.find(r => r.sourceId === childId && r.targetId === selectedOrg.value!.id)
  if (rel) {
    await relationStore.remove(rel.id)
    await relationStore.loadAll()
  }
}

/* ─── 工具 ─── */

function orgTypeIcon(org: Entity): string {
  const t = org.properties.orgType as string
  const icons: Record<string, string> = {
    '王国': 'crown', '帝国': 'building', '部落': 'camp', '教会': 'church',
    '公会': 'wrench', '佣兵团': 'sword', '学派': 'scroll', '家族': 'home',
    '商团': 'coin', '联盟': 'handshake',
  }
  return icons[t] || 'sword'
}

function visibleFields(org: Entity): Record<string, unknown> {
  const { orgType, ...rest } = org.properties as Record<string, unknown>
  return rest
}

function fieldLabel(key: string): string {
  const field = orgSchema.value?.fields.find(f => f.key === key)
  return field?.label || key
}

function fieldType(key: string): 'text' | 'textarea' | 'number' | 'boolean' | 'date' | 'select' | 'formula' | 'color' | 'image' {
  const field = orgSchema.value?.fields.find(f => f.key === key)
  const t = field?.type || 'text'
  if (['text', 'textarea', 'number', 'boolean', 'date', 'select', 'formula', 'color', 'image'].includes(t)) return t as any
  return 'text'
}
  const { selectedIds, selecting: _selecting, toggleSelect, clearSelection, enterSelectMode: _enterSelectMode, batchDelete } = useBatchDelete()
function onSearch() {}
</script>

<style scoped>
.org-view { display: flex; flex-direction: column; height: 100%; padding: 20px; }

.org-content { display: flex; flex: 1; overflow: hidden; gap: 16px; }
.org-tree { flex: 1; overflow-y: auto; min-width: 250px; }

/* Detail Panel */
.detail-panel { position: fixed; top: 0; right: 0; height: 100vh; z-index: var(--z-detail); background: var(--glass-bg, var(--panel-bg, var(--content-bg))); border-left: 1px solid var(--glass-border, var(--border-color)); padding: 20px; overflow-y: auto; box-shadow: var(--shadow-xl); backdrop-filter: blur(var(--glass-blur)); animation: none; }
.detail-backdrop{position:fixed;inset:0;z-index:var(--z-detail-backdrop);background:rgba(0,0,0,0.2);pointer-events:none}

.detail-header { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }
.detail-icon { font-size: var(--icon-xl); }
.detail-header h2 { margin: 0; font-size: var(--font-size-xl); }
.detail-type { margin: 2px 0 0; font-size: var(--font-size-sm); color: var(--text-secondary); }
.detail-edit-toggle { margin-left: auto; }
.detail-close { background: none; border: none; font-size: var(--font-size-lg); cursor: pointer; color: var(--text-secondary); padding: 4px; margin-left: 4px; flex-shrink: 0; }
.field-val { word-break: break-all; }
.detail-section { margin: 14px 0; }
.dp-tabs { display: flex; gap: 0; border-bottom: 2px solid var(--border-color); margin-bottom: 12px; overflow-x: auto; flex-shrink: 0; scrollbar-width: none; }
.dp-tabs::-webkit-scrollbar { display: none; }
.dp-tab { padding: 4px 8px; border: none; background: none; cursor: pointer; font-size: var(--font-size-xs); color: var(--text-tertiary); border-bottom: 2px solid transparent; margin-bottom: -2px; white-space: nowrap; transition: all var(--transition-fast); flex-shrink: 0; }
.dp-tab:hover { color: var(--text-color); }
.dp-tab.active { color: var(--primary); border-bottom-color: var(--primary); font-weight: var(--font-weight-semibold); }
.dp-tab-content { flex: 1; overflow-y: auto; }
.detail-section h4 { font-size: var(--font-size-sm); color: var(--text-secondary); margin-bottom: 6px; border-bottom: 1px solid var(--border-color); padding-bottom: 4px; }
.rel-item { padding: 5px 8px; font-size: var(--font-size-sm); cursor: pointer; border-radius: var(--radius-sm); transition: background var(--transition-fast); }
.rel-item:hover { background: var(--hover-bg); }
.rel-role { font-size: var(--font-size-xs); color: var(--text-tertiary); margin-left: 6px; }
.rel-remove { margin-left: auto; background: none; border: none; cursor: pointer; color: var(--text-tertiary); padding: 2px; border-radius: 4px; display: flex; align-items: center; }
.rel-remove:hover { color: var(--danger); background: var(--danger-light); }
.rel-empty { font-size: var(--font-size-sm); color: var(--text-tertiary); }
.dp-scroll-area { flex: 1; overflow-y: auto; }
.diplo-ally { color: var(--success); }
.diplo-war { color: var(--danger); }
.diplo-trade { color: var(--warning); }

.modal { background: var(--modal-bg); border-radius: var(--radius-lg); padding: 24px; max-width: 520px; width: 90%; max-height: 80vh; overflow-y: auto; box-shadow: var(--shadow-lg); }
.modal h2 { margin: 0 0 16px; font-size: var(--font-size-xl); }
.form { display: flex; flex-direction: column; gap: 10px; }
.form label { display: flex; flex-direction: column; gap: 3px; font-size: var(--font-size-sm); color: var(--text-secondary); }
.form input, .form textarea, .form select { padding: 7px 10px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); font-size: var(--font-size-base); font-family: inherit; outline: none; }
.form input:focus, .form textarea:focus, .form select:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(79,70,229,0.1); }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.efm-parent-hint {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 8px 16px;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  z-index: 99999;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}
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
</style>
