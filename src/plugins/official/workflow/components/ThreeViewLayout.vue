<script setup lang="ts">
// ThreeViewLayout — 三栏布局(sidebar / inline / hover 3 种 editMethod)
//
// P3 改写:替代 Phase 3.4 的 tab 切换(form/canvas/yaml),
// 改用 editMethod prop 决定右栏是 inspector(360px) / inline(节点下) / hover(浮层)。
// 共享 useNodeMetadata 数据源;emit 透传节点选择 / 配置 / drop 事件。
//
// 5 slot:
//   - palette: 必有(左侧 240px)
//   - canvas: 必有(中部自适应)
//   - inspector: editMethod=sidebar 时显示
//   - inline: editMethod=inline 时显示,挂 canvas 内
//   - hover: editMethod=hover 时显示,挂 canvas 内
//
// CSS 全部 token,移除 hardcoded 颜色。

import { ref, computed } from 'vue'
import NodePalette from './NodePalette.vue'
import NodeInspector from './NodeInspector.vue'
import { nodeRenderers, DefaultNodeRenderer } from './nodeRenderers'
import { useNodeMetadata } from '../composables/useNodeMetadata'
import type { EditorDefinition } from '../composables/editor-types'
import type { EditMethod } from '../composables/useEditorPreferences'

const props = withDefaults(defineProps<{
  definition: EditorDefinition
  selectedNodeId: string | null
  yamlText: string
  editMethod?: EditMethod
}>(), {
  editMethod: 'sidebar',
})

const emit = defineEmits<{
  'update:definition': [value: EditorDefinition]
  'update:selectedNodeId': [value: string | null]
  'update:yamlText': [value: string]
  'drop:node': [value: { type: string; x: number; y: number }]
}>()

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

function defaultPosition(i: number): { x: number; y: number } {
  return { x: 40 + (i % 4) * 220, y: 40 + Math.floor(i / 4) * 140 }
}
</script>

<template>
  <div :class="['three-view-layout', `layout--${editMethod}`]">
    <!-- 左侧调色板(必有) -->
    <aside class="layout__palette" data-testid="layout-palette">
      <slot name="palette">
        <NodePalette />
      </slot>
    </aside>

    <!-- 中部画布(必有) -->
    <div
      class="layout__canvas"
      data-testid="layout-canvas"
      @dragover="onCanvasDragOver"
      @drop="onCanvasDrop"
    >
      <slot name="canvas">
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
      </slot>
    </div>

    <!-- 右栏 1:sidebar 编辑 -->
    <aside
      v-if="editMethod === 'sidebar'"
      class="layout__inspector"
      data-testid="layout-inspector"
    >
      <slot name="inspector">
        <NodeInspector :node="selectedNode" @update:config="onNodeConfigUpdate" />
      </slot>
    </aside>

    <!-- 内联编辑(挂在 canvas 内的节点下方) -->
    <template v-if="editMethod === 'inline'">
      <div class="layout__inline-editor" data-testid="layout-inline-editor">
        <slot name="inline" />
      </div>
    </template>

    <!-- hover 浮层编辑 -->
    <template v-if="editMethod === 'hover'">
      <div class="layout__hover-layer" data-testid="layout-hover-layer">
        <slot name="hover" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.three-view-layout {
  display: flex;
  height: 100%;
  background: var(--color-bg-secondary);
  overflow: hidden;
}
.layout__palette {
  flex-shrink: 0;
  width: 240px;
  height: 100%;
  overflow: hidden;
  border-right: 1px solid var(--color-border-default);
}
.layout__canvas {
  flex: 1;
  position: relative;
  overflow: auto;
  background:
    radial-gradient(circle, var(--color-border-default) 1px, transparent 1px) 0 0 / 20px 20px,
    var(--color-bg-elevated);
}
.layout__inspector {
  flex-shrink: 0;
  width: 360px;
  height: 100%;
  overflow: hidden;
  border-left: 1px solid var(--color-border-default);
  background: var(--color-bg-secondary);
}
.layout__inline-editor {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
}
.layout__inline-editor > * {
  pointer-events: auto;
}
.layout__hover-layer {
  position: absolute;
  top: 0;
  right: 0;
  pointer-events: none;
  z-index: 50;
}
.layout__hover-layer > * {
  pointer-events: auto;
}
.canvas-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-tertiary);
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
</style>
