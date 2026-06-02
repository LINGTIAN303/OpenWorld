// useYamlSync — YAML ↔ Graph 双向同步
//
// Phase 3.7：
//   * 5s debounce：YAML 改动 5s 内反映到 Graph
//   * Graph 改动立即反映到 YAML
//   * parse 错误时保留旧 Graph（不让 UI 崩）
//
// 设计：watch YAML 文本 → debounce 5s → parse → emit def update。
// 单独方向：Graph 改动 → 立即 serialize → emit yamlText update。

import yaml from 'js-yaml'
import { ref, watch, type Ref } from 'vue'
import type { EditorDefinition, EditorNode, EditorEdge } from './editor-types'

export const YAML_DEBOUNCE_MS = 5_000

export function parseYamlToDefinition(src: string): EditorDefinition | null {
  try {
    const obj = yaml.load(src) as Record<string, unknown> | null
    if (!obj || typeof obj !== 'object') return null

    const id = String(obj.id ?? '')
    const name = String(obj.name ?? '')
    const version = Number(obj.version ?? 1)
    if (!id) throw new Error('definition.id 缺失')

    const nodes = Array.isArray(obj.nodes) ? obj.nodes : []
    const edges = Array.isArray(obj.edges) ? obj.edges : []

    return {
      id,
      name,
      version,
      description: typeof obj.description === 'string' ? obj.description : undefined,
      category: String(obj.category ?? 'custom'),
      nodes: nodes.map((n: unknown, i: number): EditorNode => {
      const nn = (n ?? {}) as Record<string, unknown>
      return {
        id: String(nn.id ?? `n${i}`),
        type: String(nn.type_ ?? nn.type ?? 'skill'),
        config: (nn.config as Record<string, unknown>) ?? {},
        position: nn.position as { x: number; y: number } | undefined,
      }
    }),
    edges: edges.map((e: unknown): EditorEdge => {
      const ee = (e ?? {}) as Record<string, unknown>
      return {
        from: String(ee.from ?? ''),
        to: String(ee.to ?? ''),
        label: typeof ee.label === 'string' ? ee.label : undefined,
        condition: typeof ee.condition === 'string' ? ee.condition : undefined,
      }
    }),
    }
  } catch (e) {
    console.warn('[useYamlSync] parse 失败:', e)
    return null
  }
}

export function serializeDefinitionToYaml(def: EditorDefinition): string {
  return yaml.dump({
    id: def.id,
    name: def.name,
    version: def.version,
    description: def.description,
    category: def.category,
    nodes: def.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      config: n.config,
      position: n.position,
    })),
    edges: def.edges.map((e) => ({
      from: e.from,
      to: e.to,
      label: e.label,
      condition: e.condition,
    })),
  })
}

/** useYamlSync — 给 ThreeViewLayout 父组件用 */
export function useYamlSync(
  defRef: Ref<EditorDefinition>,
  yamlRef: Ref<string>,
  onUpdateFromYaml: (next: EditorDefinition) => void,
) {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  // 监听 yaml 文本：debounce 5s → parse → update def
  watch(yamlRef, (text) => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      const parsed = parseYamlToDefinition(text)
      if (parsed && parsed.id === defRef.value.id) {
        onUpdateFromYaml(parsed)
      }
    }, YAML_DEBOUNCE_MS)
  })

  // 监听 def：立即 serialize → update yaml
  watch(
    defRef,
    (def) => {
      const text = serializeDefinitionToYaml(def)
      if (text !== yamlRef.value) {
        yamlRef.value = text
      }
    },
    { deep: true },
  )

  return {
    serialize: () => serializeDefinitionToYaml(defRef.value),
    parse: (src: string) => parseYamlToDefinition(src),
  }
}

// ─── 单元测试辅助 ───
export const __test__ = { YAML_DEBOUNCE_MS, ref, watch }
