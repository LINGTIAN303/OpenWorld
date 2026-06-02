<script setup lang="ts">
// ThreeViewLayout — 三入口合一布局
//
// Phase 3.4：顶部 Tab 切换 3 个视图（表单 / 画布 / YAML），共享 useWorkflowEditor 状态源。
// Phase 4.5：画布视图按 node.type 动态选 nodeRenderers 渲染（14 个 type + BaseNodeRenderer fallback）。

import { ref, computed } from 'vue'
import NodePalette from './NodePalette.vue'
import NodeInspector from './NodeInspector.vue'
import { nodeRenderers, DefaultNodeRenderer } from './nodeRenderers'
import { useNodeMetadata } from '../composables/useNodeMetadata'
import type { EditorDefinition } from '../composables/editor-types'

const props = defineProps<{
  definition: EditorDefinition
  selectedNodeId: string | null
  yamlText: string
}>()

const emit = defineEmits<{
  'update:definition': [value: EditorDefinition]
  'update:selectedNodeId': [value: string | null]
  'update:yamlText': [value: string]
  'drop:node': [value: { type: string; x: number; y: number }]
}>()

type Tab = 'form' | 'canvas' | 'yaml'
const currentTab = ref<Tab>('form')

// ── 节点元数据（画布视图按 type 渲染用） ──
const metaStore = useNodeMetadata()
const metaList = metaStore.list
const lookupMeta = (type: string) => metaList.value?.find((m) => m.type === type) ?? null

const selectedNode = computed(() => {
  if (!props.selectedNodeId) return null
  return props.definition.nodes.find((n) => n.id === props.selectedNodeId) ?? null
})

function onNodeConfigUpdate(value: Record<string, unknown>): void {
  if (!props.selectedNodeId) return
  const newNodes = props.definition.nodes.map((n) =>
    n.id === props.selectedNodeId ? { ...n, config: value } : n,
  )
  emit('update:definition', { ...props.definition, nodes: newNodes })
}

function onCanvasDragOver(e: DragEvent): void {
  if (e.dataTransfer?.types.includes('application/workflow-node-type')) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }
}

function onCanvasDrop(e: DragEvent): void {
  const type = e.dataTransfer?.getData('application/workflow-node-type')
  if (!type) return
  e.preventDefault()
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  emit('drop:node', {
    type,
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  })
}

function selectNode(id: string): void {
  emit('update:selectedNodeId', id)
}

/** 节点在画布上的默认位置（避免堆在一起） */
function defaultPosition(i: number): { x: number; y: number } {
  return { x: 40 + (i % 4) * 220, y: 40 + Math.floor(i / 4) * 140 }
}
</script>

<template>
  <div class="three-view-layout">
    <nav class="tv-tabs">
      <button
        v-for="t in (['form', 'canvas', 'yaml'] as Tab[])"
        :key="t"
        :class="['tv-tab', { active: currentTab === t }]"
        @click="currentTab = t"
      >
        {{ t === 'form' ? '表单' : t === 'canvas' ? '画布' : 'YAML' }}
      </button>
    </nav>

    <div class="tv-body">
      <!-- 表单视图 -->
      <div v-if="currentTab === 'form'" class="tv-form-view">
        <NodePalette />
        <div class="tv-form-center">
          <div v-if="selectedNode" class="tv-form-summary">
            <h3>已选：{{ selectedNode.id }} ({{ selectedNode.type }})</h3>
            <p>在右侧检查器编辑 config</p>
          </div>
          <div v-else class="tv-form-empty">
            <p>从左侧拖一个节点到画布，或在画布视图点击节点</p>
          </div>
        </div>
        <NodeInspector :node="selectedNode" @update:config="onNodeConfigUpdate" />
      </div>

      <!-- 画布视图 -->
      <div
        v-else-if="currentTab === 'canvas'"
        class="tv-canvas-view"
        @dragover="onCanvasDragOver"
        @drop="onCanvasDrop"
      >
        <div v-if="definition.nodes.length === 0" class="canvas-empty">
          <p>从左侧调色板拖节点到这里</p>
        </div>
        <div v-else class="canvas-nodes">
          <div
            v-for="(n, i) in definition.nodes"
            :key="n.id"
            class="canvas-node-wrapper"
            :style="{
              left: (n.position?.x ?? defaultPosition(i).x) + 'px',
              top: (n.position?.y ?? defaultPosition(i).y) + 'px',
            }"
            @click="selectNode(n.id)"
          >
            <component
              :is="nodeRenderers[n.type] ?? DefaultNodeRenderer"
              :node="n"
              :meta="lookupMeta(n.type)"
              :selected="n.id === selectedNodeId"
            />
          </div>
        </div>
      </div>

      <!-- YAML 视图 -->
      <div v-else class="tv-yaml-view">
        <textarea
          class="yaml-textarea"
          :value="yamlText"
          spellcheck="false"
          @input="emit('update:yamlText', ($event.target as HTMLTextAreaElement).value)"
        />
        <p class="yaml-hint">YAML 编辑 5s 内自动同步到表单 / 画布</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.three-view-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f8fafc;
}
.tv-tabs {
  display: flex;
  gap: 0;
  background: white;
  border-bottom: 1px solid #e2e8f0;
  padding: 0 12px;
}
.tv-tab {
  padding: 8px 16px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  color: #64748b;
  border-bottom: 2px solid transparent;
  transition: all 0.1s;
}
.tv-tab:hover {
  color: #1e293b;
}
.tv-tab.active {
  color: #2563eb;
  border-bottom-color: #2563eb;
  font-weight: 500;
}
.tv-body {
  flex: 1;
  overflow: hidden;
  display: flex;
}
.tv-form-view {
  display: flex;
  flex: 1;
  overflow: hidden;
}
.tv-form-center {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}
.tv-form-summary {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 16px;
}
.tv-form-summary h3 {
  margin: 0 0 4px 0;
  font-size: 14px;
  color: #1e293b;
}
.tv-form-summary p {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}
.tv-form-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #94a3b8;
  font-size: 13px;
}
.tv-canvas-view {
  flex: 1;
  position: relative;
  background:
    radial-gradient(circle, #e2e8f0 1px, transparent 1px) 0 0 / 20px 20px,
    white;
  overflow: auto;
}
.canvas-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #94a3b8;
  font-size: 13px;
}
.canvas-nodes {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 400px;
}
.canvas-node-wrapper {
  position: absolute;
  cursor: pointer;
}
.tv-yaml-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 12px;
  background: #1e293b;
}
.yaml-textarea {
  flex: 1;
  background: #0f172a;
  color: #e2e8f0;
  border: 1px solid #334155;
  border-radius: 4px;
  padding: 12px;
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 12px;
  line-height: 1.6;
  resize: none;
}
.yaml-hint {
  margin: 8px 0 0 0;
  color: #94a3b8;
  font-size: 11px;
}
</style>
