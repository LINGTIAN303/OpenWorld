<template>
  <Transition name="ws-panel">
    <div v-if="visible" class="mm-detail-panel">
      <div class="mm-dp-header">
        <span class="mm-dp-icon"><WsIcon :name="iconForType(nodeType)" size="md" /></span>
        <span class="mm-dp-name">{{ nodeName }}</span>
        <button class="mm-dp-close" @click="$emit('close')">✕</button>
      </div>

      <div class="mm-dp-section">
        <div class="mm-dp-row"><span class="mm-dp-label">类型</span><span class="mm-dp-value">{{ typeLabel(nodeType) }}</span></div>
        <div v-if="nodeTags" class="mm-dp-row"><span class="mm-dp-label">标签</span><span class="mm-dp-value">{{ nodeTags }}</span></div>
      </div>

      <div class="mm-dp-section">
        <button class="mm-dp-toggle" @click="showRelations = !showRelations">
          {{ showRelations ? '▾' : '▸' }} 关系 ({{ relationCount }})
        </button>
        <div v-if="showRelations" class="mm-dp-relations">
          <div v-for="r in relations" :key="r.id" class="mm-dp-rel-item" role="button" tabindex="0" @click="$emit('navigate', r.targetId)" @keydown.enter="$emit('navigate', r.targetId)">
            <span class="mm-dp-rel-type">{{ r.label }}</span>
            <span class="mm-dp-rel-target">{{ r.targetName }}</span>
          </div>
          <WsEmpty v-if="relations.length === 0" preset="no-data" title="暂无关系" />
        </div>
      </div>

      <div class="mm-dp-section">
        <button class="mm-dp-toggle" @click="showDetails = !showDetails">
          {{ showDetails ? '▾' : '▸' }} 详细信息
        </button>
        <div v-if="showDetails" class="mm-dp-details">
          <p v-if="nodeDesc" class="mm-dp-desc">{{ nodeDesc }}</p>
          <div v-if="customFields.length > 0">
            <div v-for="f in customFields" :key="f.key" class="mm-dp-row">
              <span class="mm-dp-label">{{ f.label }}</span>
              <span class="mm-dp-value">{{ f.value }}</span>
            </div>
          </div>
          <WsEmpty v-if="!nodeDesc && customFields.length === 0" preset="no-data" title="暂无详细信息" />
        </div>
      </div>

      <div class="mm-dp-actions">
        <button class="mm-dp-btn" @click="$emit('edit')"><WsIcon name="edit" size="xs" /> 编辑</button>
        <button v-if="!isCustomType" class="mm-dp-btn" @click="$emit('enter')"><WsIcon name="search" size="xs" /> 进入</button>
        <button class="mm-dp-btn danger" @click="$emit('delete')"><WsIcon name="delete" size="xs" /> 删除</button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import WsIcon from '../../../ui/WsIcon.vue'
import WsEmpty from '../../../ui/WsEmpty.vue'
import { typeLabel, iconForType } from './mindmapConfig'
import { useEntityStore, useRelationStore } from '@worldsmith/entity-core'

const props = defineProps<{
  visible: boolean
  nodeId: string
  nodeName: string
  nodeType: string
  nodeTags: string
  nodeDesc: string
  nodeProperties: Record<string, unknown>
}>()

defineEmits<{
  close: []
  edit: []
  enter: []
  delete: []
  navigate: [entityId: string]
}>()

const relationStore = useRelationStore()
const entityStore = useEntityStore()

const showRelations = ref(true)
const showDetails = ref(false)

const CUSTOM_TYPES = new Set(['textbox', 'image', 'note', 'link', 'group', 'center', 'section'])
const isCustomType = computed(() => CUSTOM_TYPES.has(props.nodeType))

const relations = computed(() => {
  const rels = relationStore.relations.filter(r => r.sourceId === props.nodeId || r.targetId === props.nodeId)
  return rels.map(r => {
    const targetId = r.sourceId === props.nodeId ? r.targetId : r.sourceId
    const entity = entityStore.entities.find(e => e.id === targetId)
    return {
      id: r.id,
      label: r.label || r.type,
      targetId,
      targetName: entity?.name || targetId,
    }
  })
})

const relationCount = computed(() => relations.value.length)

const customFields = computed(() => {
  const fields: { key: string; label: string; value: string }[] = []
  if (!props.nodeProperties) return fields
  for (const [key, val] of Object.entries(props.nodeProperties)) {
    if (['name', 'description', 'tags'].includes(key)) continue
    if (val === undefined || val === null || val === '') continue
    fields.push({ key, label: key, value: String(val) })
  }
  return fields
})
</script>

<style scoped>
.mm-detail-panel {
  width: 260px; background: var(--card-bg);
  border-left: 1px solid var(--border-color);
  display: flex; flex-direction: column;
  overflow-y: auto; flex-shrink: 0;
}
.mm-dp-header {
  display: flex; align-items: center; gap: 8px;
  padding: 12px; border-bottom: 1px solid var(--border-color);
}
.mm-dp-icon { font-size: var(--font-size-xl); }
.mm-dp-name { flex: 1; font-weight: var(--font-weight-semibold); font-size: var(--font-size-base); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mm-dp-close { background: none; border: none; cursor: pointer; color: var(--text-tertiary); font-size: var(--font-size-base); }
.mm-dp-close:hover { color: var(--text-color); }
.mm-dp-section { padding: 8px 12px; border-bottom: 1px solid var(--border-color); }
.mm-dp-row { display: flex; gap: 8px; margin-bottom: 4px; font-size: var(--font-size-sm); }
.mm-dp-label { color: var(--text-tertiary); min-width: 40px; }
.mm-dp-value { color: var(--text-secondary); flex: 1; word-break: break-all; }
.mm-dp-toggle {
  background: none; border: none; cursor: pointer;
  font-size: var(--font-size-sm); font-weight: var(--font-weight-semibold); color: var(--primary);
  padding: 2px 0; width: 100%; text-align: left;
}
.mm-dp-toggle:hover { text-decoration: underline; }
.mm-dp-relations { margin-top: 4px; }
.mm-dp-rel-item {
  display: flex; gap: 8px; padding: 3px 0; font-size: var(--font-size-xs);
  cursor: pointer; transition: color var(--transition-fast);
}
.mm-dp-rel-item:hover { color: var(--primary); }
.mm-dp-rel-type { color: var(--text-tertiary); }
.mm-dp-rel-target { color: var(--text-secondary); }
.mm-dp-details { margin-top: 4px; }
.mm-dp-desc { font-size: var(--font-size-sm); color: var(--text-secondary); line-height: 1.5; }
.mm-dp-actions { padding: 12px; display: flex; gap: 6px; margin-top: auto; }
.mm-dp-btn {
  padding: 4px 10px; border: 1px solid var(--border-color);
  border-radius: var(--radius-sm); background: transparent;
  cursor: pointer; font-size: var(--font-size-xs); color: var(--text-secondary);
  transition: all var(--transition-fast);
}
.mm-dp-btn:hover { background: var(--hover-bg); color: var(--text-color); }
.mm-dp-btn.danger { color: var(--danger); border-color: var(--danger); }
.mm-dp-btn.danger:hover { background: var(--danger); color: white; }

</style>
