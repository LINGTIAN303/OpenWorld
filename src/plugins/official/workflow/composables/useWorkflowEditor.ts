// useWorkflowEditor — 编辑器单一状态源
//
// Phase 3.8：替换旧的 `editorMode` + `nodeModeOverrides` 双模式。
// 单一状态：`definition` + `selectedNodeId` + `yamlText`，三入口共享。
// 所有"改"都走 `updateDefinition` / `updateConfig` / `selectNode`，
// 不再有"按当前 mode 决定怎么改"的分支。

import { ref, computed, type Ref, type ComputedRef } from 'vue'
import {
  parseYamlToDefinition,
  serializeDefinitionToYaml,
  useYamlSync,
} from './useYamlSync'
import type { EditorDefinition, EditorNode, EditorEdge } from './editor-types'

export interface UseWorkflowEditorOptions {
  initialDefinition: EditorDefinition
}

export function useWorkflowEditor(opts: UseWorkflowEditorOptions) {
  const definition: Ref<EditorDefinition> = ref(opts.initialDefinition)
  const selectedNodeId: Ref<string | null> = ref(null)
  const yamlText: Ref<string> = ref(serializeDefinitionToYaml(opts.initialDefinition))

  // 单一 sync 实例：监听 def ↔ yaml 双向同步
  const sync = useYamlSync(definition, yamlText, (next) => {
    definition.value = next
  })

  function updateDefinition(next: EditorDefinition): void {
    definition.value = next
  }

  function selectNode(id: string | null): void {
    selectedNodeId.value = id
  }

  function updateNodeConfig(nodeId: string, config: Record<string, unknown>): void {
    definition.value = {
      ...definition.value,
      nodes: definition.value.nodes.map((n) =>
        n.id === nodeId ? { ...n, config } : n,
      ),
    }
  }

  function addNode(
    type: string,
    position: { x: number; y: number },
    idHint?: string,
  ): string {
    const id = idHint ?? `n${definition.value.nodes.length + 1}_${Date.now().toString(36)}`
    definition.value = {
      ...definition.value,
      nodes: [
        ...definition.value.nodes,
        { id, type, config: {}, position },
      ],
    }
    return id
  }

  function removeNode(id: string): void {
    definition.value = {
      ...definition.value,
      nodes: definition.value.nodes.filter((n) => n.id !== id),
      edges: definition.value.edges.filter((e) => e.from !== id && e.to !== id),
    }
    if (selectedNodeId.value === id) selectedNodeId.value = null
  }

  function addEdge(from: string, to: string, label?: string): void {
    if (from === to) return
    if (definition.value.edges.some((e: EditorEdge) => e.from === from && e.to === to)) return
    definition.value = {
      ...definition.value,
      edges: [...definition.value.edges, { from, to, label }],
    }
  }

  /** 从 YAML 文本加载（覆盖当前 definition） */
  function loadFromYaml(text: string): boolean {
    const parsed = parseYamlToDefinition(text)
    if (!parsed) return false
    definition.value = parsed
    yamlText.value = text
    return true
  }

  /** 强制重新生成 YAML（用于外部修改 def 后） */
  function refreshYaml(): void {
    yamlText.value = serializeDefinitionToYaml(definition.value)
  }

  const selectedNode: ComputedRef<EditorDefinition['nodes'][number] | null> = computed(
    () => {
      if (!selectedNodeId.value) return null
      return (
        definition.value.nodes.find((n: EditorNode) => n.id === selectedNodeId.value) ?? null
      )
    },
  )

  return {
    // state
    definition,
    selectedNodeId,
    selectedNode,
    yamlText,
    // actions
    updateDefinition,
    selectNode,
    updateNodeConfig,
    addNode,
    removeNode,
    addEdge,
    loadFromYaml,
    refreshYaml,
    // internal
    sync,
  }
}
