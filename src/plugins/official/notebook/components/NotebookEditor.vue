<template>
  <div class="nb-editor">
    <div class="nb-editor-header">
      <input v-model="editName" class="nb-editor-title" placeholder="笔记标题" @change="emitUpdate" />
      <select v-model="editFolder" class="nb-editor-folder" @change="emitUpdate">
        <option value="">未分类</option>
        <option v-for="f in folders" :key="f.id" :value="f.id"><WsIcon name="folder" size="xs" /> {{ f.name }}</option>
      </select>
      <select v-model="editType" class="nb-editor-type" @change="emitUpdate">
        <option v-for="t in NOTE_TYPES" :key="t.value" :value="t.value">{{ t.icon }} {{ t.label }}</option>
      </select>
    </div>
    <div class="nb-editor-body">
      <CodeCell
        v-if="editType === 'code'"
        :code="editContent"
        :language="editLanguage"
        @update="editContent = $event; emitUpdate()"
        @run="onCodeRun"
      />
      <textarea
        v-else
        v-model="editContent"
        class="nb-editor-textarea"
        placeholder="开始写作..."
        @input="emitUpdate"
      />
    </div>
    <div v-if="backlinkNotes.length" class="nb-editor-backlinks">
      <div class="nb-bl-title">反向链接 ({{ backlinkNotes.length }})</div>
      <div v-for="bl in backlinkNotes" :key="bl.id" class="nb-bl-item" @click="$emit('navigate', bl.id)">
        {{ bl.name }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import WsIcon from '../../../../ui/WsIcon.vue'
import { useEntityStore } from '@worldsmith/entity-core'
import CodeCell from './CodeCell.vue'
import { NOTE_TYPES } from '../notebookConfig'

interface NotebookFolder {
  id: string
  name: string
}

const props = defineProps<{ note: any; folders: NotebookFolder[] }>()
const emit = defineEmits<{ update: [data: { id: string; changes: Record<string, unknown> }]; navigate: [id: string] }>()

const entityStore = useEntityStore()

const editName = ref(props.note.name || '')
const editContent = ref(String(props.note.properties?.content || ''))
const editType = ref(String(props.note.properties?.noteType || 'markdown'))
const editLanguage = ref(String(props.note.properties?.codeLanguage || 'javascript'))
const editFolder = ref(String(props.note.properties?.folderId || ''))

watch(() => props.note, (n) => {
  if (!n) return
  editName.value = n.name || ''
  editContent.value = String(n.properties?.content || '')
  editType.value = String(n.properties?.noteType || 'markdown')
  editLanguage.value = String(n.properties?.codeLanguage || 'javascript')
  editFolder.value = String(n.properties?.folderId || '')
})

const backlinkNotes = computed(() => {
  const ids: string[] = props.note.properties?.backlinks || []
  return entityStore.entities.filter((e: any) => ids.includes(e.id))
})

function emitUpdate(): void {
  emit('update', {
    id: props.note.id,
    changes: {
      name: editName.value,
      properties: {
        ...props.note.properties,
        content: editContent.value,
        noteType: editType.value,
        codeLanguage: editLanguage.value,
        folderId: editFolder.value,
      },
    },
  })
}

function onCodeRun(): void {
}
</script>

<style scoped>
.nb-editor { display: flex; flex-direction: column; height: 100%; }
.nb-editor-header { display: flex; gap: 8px; padding: 8px 16px; border-bottom: 1px solid var(--color-border-subtle); align-items: center; background: var(--color-bg-surface); }
.nb-editor-title { flex: 1; background: transparent; border: none; color: var(--color-text-primary); font-size: var(--font-size-xl); font-weight: var(--font-weight-semibold); outline: none; }
.nb-editor-folder { padding: 4px 8px; border-radius: 4px; border: 1px solid var(--color-border); background: var(--color-bg-base); color: var(--color-text-secondary); font-size: var(--font-size-sm); outline: none; max-width: 140px; }
.nb-editor-type { padding: 4px 8px; border-radius: 4px; border: 1px solid var(--color-border); background: var(--color-bg-base); color: var(--color-text-secondary); font-size: var(--font-size-sm); outline: none; }
.nb-editor-folder option, .nb-editor-type option { background: var(--color-bg-surface); color: var(--color-text-primary); }
.nb-editor-body { flex: 1; padding: 16px; overflow: auto; }
.nb-editor-textarea { width: 100%; height: 100%; background: transparent; border: none; color: var(--color-text-primary); font-size: var(--font-size-base); line-height: 1.7; resize: none; outline: none; font-family: inherit; }
.nb-editor-backlinks { border-top: 1px solid var(--color-border-subtle); padding: 8px 16px; }
.nb-bl-title { font-size: var(--font-size-xs); font-weight: var(--font-weight-semibold); color: var(--color-text-tertiary); text-transform: uppercase; margin-bottom: 4px; }
.nb-bl-item { font-size: var(--font-size-sm); color: var(--color-primary); cursor: pointer; padding: 2px 0; }
.nb-bl-item:hover { text-decoration: underline; }
</style>
