<script setup lang="ts">
// WorkflowEditorView — Phase 3 编辑器主入口
//
// 三入口合一:表单 / 画布 / YAML 顶部 Tab 切换。
// 单一状态源:useWorkflowEditor(替换旧 editorMode + nodeModeOverrides)。
// 工具栏:保存 / 运行 / 清空。
//
// P3 扩展:
//   - 读 useEditorPreferences().value.editMethod 注入 ThreeViewLayout
//   - 监听 useWorkflowRuns().activeDecision 挂 AgentDecisionCard
//   - handleDecide / handleFallback / handleDismiss → resolve / fallback / dismiss
//   - CSS 全部 token 化(去掉 hardcoded 颜色)

import { ref, onMounted, computed, watch } from 'vue'
import yaml from 'js-yaml'
import ThreeViewLayout from './ThreeViewLayout.vue'
import AgentDecisionCard from './run/AgentDecisionCard.vue'
import CanvasContextMenu from './editor/CanvasContextMenu.vue'
import { useEditorPreferences } from '../composables/useEditorPreferences'
import { useWorkflowRuns } from '../composables/useWorkflowRuns'
import { useCanvasContextMenu } from '../composables/useCanvasContextMenu'
import type { EditorDefinition } from '../composables/editor-types'
import type { DecisionResult } from '../types'
import { useWorkflowEditor } from '../composables/useWorkflowEditor'
import { useWorkflowClient } from '../composables/useWorkflowClient'
import { isTauri } from '../types'

const props = defineProps<{
  workflowId: string
}>()

const emit = defineEmits<{
  'run-saved': [definition: EditorDefinition]
  'toast': [message: string, type: 'info' | 'error' | 'success']
}>()

const client = useWorkflowClient()
const prefs = useEditorPreferences()
const runs = useWorkflowRuns()
const ctxMenu = useCanvasContextMenu()

const loading = ref(false)
const error = ref<string | null>(null)
const ready = ref(false)

const placeholder: EditorDefinition = {
  id: props.workflowId,
  name: props.workflowId,
  version: 1,
  category: 'custom',
  nodes: [],
  edges: [],
}
const editor = useWorkflowEditor({ initialDefinition: placeholder })

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    if (isTauri()) {
      const def = (await client.get(props.workflowId)) as unknown as Record<string, unknown>
      editor.loadFromYaml(serializeRawToYaml(def))
    } else {
      editor.loadFromYaml(demoYaml(props.workflowId))
    }
    ready.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    ready.value = true
  } finally {
    loading.value = false
  }
}

onMounted(() => { void load() })
watch(() => props.workflowId, () => { void load() })

function serializeRawToYaml(d: Record<string, unknown>): string {
  const obj = {
    id: d.id, name: d.name, version: d.version, description: d.description,
    category: d.category ?? 'custom',
    nodes: (d.nodes as Array<Record<string, unknown>>) ?? [],
    edges: (d.edges as Array<Record<string, unknown>>) ?? [],
  }
  return yaml.dump(obj)
}

function demoYaml(id: string): string {
  return `id: ${id}
name: ${id}
version: 1
category: custom
nodes:
  - id: start
    type: start
    config: {}
  - id: greet
    type: skill
    config:
      skill_id: greet.skill
      prompt: "hello world"
  - id: end
    type: end
    config: {}
edges:
  - from: start
    to: greet
  - from: greet
    to: end
`
}

async function handleSave(): Promise<void> {
  if (!ready.value) return
  if (isTauri()) {
    try {
      await client.update(props.workflowId, editor.definition.value as never)
      emit('toast', '已保存', 'success')
      emit('run-saved', editor.definition.value)
    } catch (e) {
      emit('toast', `保存失败: ${e instanceof Error ? e.message : String(e)}`, 'error')
    }
  } else {
    emit('toast', 'mock: 已保存到内存', 'info')
  }
}

async function handleRun(): Promise<void> {
  if (!ready.value) return
  if (isTauri()) {
    try {
      const runId = await client.run(props.workflowId, {}, 'user')
      emit('toast', `已启动 run: ${runId}`, 'success')
    } catch (e) {
      emit('toast', `运行失败: ${e instanceof Error ? e.message : String(e)}`, 'error')
    }
  } else {
    emit('toast', 'mock: 已"启动" run', 'info')
  }
}

function handleClear(): void {
  editor.definition.value = { ...editor.definition.value, nodes: [], edges: [] }
  editor.refreshYaml()
  emit('toast', '已清空(请保存以持久化)', 'info')
}

function onDefinitionUpdate(next: EditorDefinition): void {
  editor.definition.value = next
}
function onYamlUpdate(text: string): void {
  editor.yamlText.value = text
}
function onSelectNode(id: string | null): void {
  editor.selectedNodeId.value = id
}
function onDropNode(payload: { type: string; x: number; y: number }): void {
  editor.addNode(payload.type, { x: payload.x, y: payload.y })
}

function onAddNode(type: string): void {
  editor.addNode(type)
}

// P3 决策回调
function onDecide(payload: DecisionResult): void {
  runs.resolveDecision(payload)
  emit('toast', '决策已提交', 'success')
}
function onFallback(): void {
  runs.fallbackDecision()
  emit('toast', '决策超时,已走默认', 'info')
}
function onDismiss(): void {
  runs.activeDecision.value = null
}

// 画布右键菜单
function onCanvasContextMenu(e: MouseEvent): void {
  e.preventDefault()
  ctxMenu.openAt(e.clientX, e.clientY)
}
function onContextMenuPick(type: string): void {
  if (type === 'more') {
    // 折叠入口 — 简化处理:打开 start
    editor.addNode('start')
  } else {
    editor.addNode(type)
  }
}

const toolbarVersion = computed(() => editor.definition.value?.version ?? 1)
const toolbarName = computed(() => editor.definition.value?.name ?? props.workflowId)
</script>

<template>
  <div class="workflow-editor-view">
    <header class="editor-toolbar">
      <div class="toolbar-left">
        <h2 class="editor-title">{{ toolbarName }}</h2>
        <span class="editor-version">v{{ toolbarVersion }}</span>
      </div>
      <div class="toolbar-right">
        <button class="toolbar-btn" :disabled="loading" @click="load">
          <span v-if="loading">加载中…</span><span v-else>重载</span>
        </button>
        <button class="toolbar-btn primary" :disabled="!ready" @click="handleSave">保存</button>
        <button class="toolbar-btn primary" :disabled="!ready" @click="handleRun">运行</button>
        <button class="toolbar-btn danger" :disabled="!ready" @click="handleClear">清空</button>
      </div>
    </header>

    <div v-if="error" class="editor-error">{{ error }}</div>

    <ThreeViewLayout
      :definition="editor.definition.value"
      :selected-node-id="editor.selectedNodeId.value"
      :yaml-text="editor.yamlText.value"
      :edit-method="prefs.value.editMethod"
      @update:definition="onDefinitionUpdate"
      @update:selected-node-id="onSelectNode"
      @update:yaml-text="onYamlUpdate"
      @drop:node="onDropNode"
      @contextmenu="onCanvasContextMenu"
    />

    <CanvasContextMenu @pick="onContextMenuPick" />

    <!-- P3 决策卡:当 activeDecision 不为空时显示 -->
    <div v-if="runs.activeDecision.value" class="decision-overlay" data-testid="decision-overlay">
      <AgentDecisionCard
        :context="runs.activeDecision.value"
        @decide="onDecide"
        @fallback="onFallback"
        @dismiss="onDismiss"
      />
    </div>
  </div>
</template>

<style scoped>
.workflow-editor-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg-secondary);
}
.editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--color-bg-elevated);
  border-bottom: 1px solid var(--color-border-default);
}
.toolbar-left {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.editor-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}
.editor-version {
  font-size: 11px;
  color: var(--color-text-tertiary);
  font-family: ui-monospace, SFMono-Regular, monospace;
}
.toolbar-right {
  display: flex;
  gap: 6px;
}
.toolbar-btn {
  padding: 5px 12px;
  border: 1px solid var(--color-border-default);
  background: var(--color-bg-elevated);
  border-radius: 4px;
  font-size: 12px;
  color: var(--color-text-primary);
  cursor: pointer;
  font-family: inherit;
}
.toolbar-btn:hover {
  background: var(--color-bg-hover);
}
.toolbar-btn.primary {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--color-text-on-primary, white);
}
.toolbar-btn.primary:hover {
  filter: brightness(1.1);
}
.toolbar-btn.danger {
  border-color: var(--color-danger-border);
  color: var(--color-danger);
}
.toolbar-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.editor-error {
  padding: 8px 16px;
  background: var(--color-danger-subtle);
  color: var(--color-danger);
  font-size: 12px;
  border-bottom: 1px solid var(--color-danger-border);
}
.decision-overlay {
  position: fixed;
  inset: 0;
  background: var(--color-overlay-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9000;
  padding: 24px;
  box-sizing: border-box;
}
</style>
