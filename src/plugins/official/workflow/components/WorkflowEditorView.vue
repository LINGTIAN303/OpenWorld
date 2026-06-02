<script setup lang="ts">
// WorkflowEditorView — Phase 3 编辑器主入口
//
// 三入口合一：表单 / 画布 / YAML 顶部 Tab 切换。
// 单一状态源：useWorkflowEditor（替换旧 editorMode + nodeModeOverrides）。
// 工具栏：保存 / 运行 / 清空。
//
// 注意：useWorkflowEditor 必须在 setup 顶层调用，所以不能用 computed 包装。
// 流程：setup 时构造占位 editor → onMounted 异步 load → 用 editor.loadFromYaml 覆盖。

import { ref, onMounted, computed, watch } from 'vue'
import yaml from 'js-yaml'
import ThreeViewLayout from './ThreeViewLayout.vue'
import type { EditorDefinition } from '../composables/editor-types'
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

const loading = ref(false)
const error = ref<string | null>(null)
const ready = ref(false)

// 占位 editor（空 definition）；load 完成后用 loadFromYaml 覆盖
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
      const def = (await client.get(props.workflowId)) as unknown as Record<
        string,
        unknown
      >
      editor.loadFromYaml(serializeRawToYaml(def))
    } else {
      // dev mock：建一个最小 demo
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

onMounted(() => {
  void load()
})

watch(
  () => props.workflowId,
  () => {
    void load()
  },
)

function serializeRawToYaml(d: Record<string, unknown>): string {
  // 用 useYamlSync 的序列化逻辑：从对象转 YAML
  // 但 loadFromYaml 接受 YAML 字符串。我们把 Rust 端的 JSON 串行化为 YAML 字符串。
  // 简化处理：直接 dump 整个对象（与 Rust schema 字段对齐）。
  // 实际生产中应该走 client.export(id, 'yaml')，但 dev 时用此近似。
  const obj = {
    id: d.id,
    name: d.name,
    version: d.version,
    description: d.description,
    category: d.category ?? 'custom',
    nodes: (d.nodes as Array<Record<string, unknown>>) ?? [],
    edges: (d.edges as Array<Record<string, unknown>>) ?? [],
  }
  // 在 setup 顶层 import js-yaml（ESM），避免 require 在 Vite ESM 环境下 "require is not defined"。
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
  editor.definition.value = {
    ...editor.definition.value,
    nodes: [],
    edges: [],
  }
  editor.refreshYaml()
  emit('toast', '已清空（请保存以持久化）', 'info')
}

// 三入口回调：直接写到 editor 内部
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
      @update:definition="onDefinitionUpdate"
      @update:selected-node-id="onSelectNode"
      @update:yaml-text="onYamlUpdate"
      @drop:node="onDropNode"
    />
  </div>
</template>

<style scoped>
.workflow-editor-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f8fafc;
}
.editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: white;
  border-bottom: 1px solid #e2e8f0;
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
  color: #1e293b;
}
.editor-version {
  font-size: 11px;
  color: #94a3b8;
  font-family: ui-monospace, SFMono-Regular, monospace;
}
.toolbar-right {
  display: flex;
  gap: 6px;
}
.toolbar-btn {
  padding: 5px 12px;
  border: 1px solid #cbd5e1;
  background: white;
  border-radius: 4px;
  font-size: 12px;
  color: #1e293b;
  cursor: pointer;
  font-family: inherit;
}
.toolbar-btn:hover {
  background: #f1f5f9;
}
.toolbar-btn.primary {
  background: #2563eb;
  border-color: #2563eb;
  color: white;
}
.toolbar-btn.primary:hover {
  background: #1d4ed8;
}
.toolbar-btn.danger {
  border-color: #fca5a5;
  color: #dc2626;
}
.toolbar-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.editor-error {
  padding: 8px 16px;
  background: #fee2e2;
  color: #b91c1c;
  font-size: 12px;
  border-bottom: 1px solid #fecaca;
}
</style>
