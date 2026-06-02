// useNodeMetadata — 从 Rust 端拉节点元数据
//
// Phase 3.1：
//   * 启动时一次性调 `workflow_list_node_types` 拿全量
//   * 单个节点元数据直接用 list 缓存（避免每次都 invoke）
//   * 后续 plugin 接入后，list 缓存会定期 invalidate（Phase 4）

import { invoke } from '@tauri-apps/api/core'
import { ref, type Ref } from 'vue'

// ─── 与 Rust 端 [node_meta.rs] 1:1 对齐 ───

export type NodeCategory = 'builtin' | 'plugin'

export interface NodeConfigFieldSchema {
  type: 'string' | 'number' | 'boolean'
  required?: boolean
  default?: unknown
  description?: string
  options?: string[]
}

export interface NodeMetadata {
  type: string
  category: NodeCategory
  label: string
  icon: string
  color: string
  pluginId: string
  description: string
  configSchema: Record<string, NodeConfigFieldSchema>
}

// ─── 单例 composable ───

let cache: NodeMetadata[] | null = null
let inflight: Promise<NodeMetadata[]> | null = null

const metadataRef: Ref<NodeMetadata[] | null> = ref(null)
const loadingRef: Ref<boolean> = ref(false)
const errorRef: Ref<string | null> = ref(null)

/** 主动拉一次全量（首次 / 刷新 plugin 注册后） */
export async function loadNodeMetadata(force = false): Promise<NodeMetadata[]> {
  if (cache && !force) {
    metadataRef.value = cache
    return cache
  }
  if (inflight) return inflight
  loadingRef.value = true
  errorRef.value = null
  inflight = invoke<NodeMetadata[]>('workflow_list_node_types')
    .then((list) => {
      cache = list
      metadataRef.value = list
      return list
    })
    .catch((e) => {
      const msg = e instanceof Error ? e.message : String(e)
      errorRef.value = msg
      throw e
    })
    .finally(() => {
      loadingRef.value = false
      inflight = null
    })
  return inflight
}

/** 清缓存（plugin 重新注册后调用） */
export function clearNodeMetadataCache(): void {
  cache = null
  metadataRef.value = null
}

/** 取单个节点元数据（先查 cache；miss 时回退到全量再查） */
export async function getNodeSchema(type: string): Promise<NodeMetadata | null> {
  if (!cache) await loadNodeMetadata()
  return cache?.find((n) => n.type === type) ?? null
}

/** 按 category 过滤（builtin / plugin） */
export function getByCategory(list: NodeMetadata[], category: NodeCategory): NodeMetadata[] {
  return list.filter((n) => n.category === category)
}

/** useNodeMetadata — 给 Vue 组件用 */
export function useNodeMetadata() {
  return {
    list: metadataRef,
    loading: loadingRef,
    error: errorRef,
    load: loadNodeMetadata,
    clear: clearNodeMetadataCache,
    get: getNodeSchema,
    byCategory: (category: NodeCategory) =>
      metadataRef.value ? getByCategory(metadataRef.value, category) : [],
  }
}

// ─── 兼容旧 dev mock（不接 Tauri 时返回空 list，避免 UI 崩） ───

if (typeof window !== 'undefined' && !(window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
  // dev mode: window.__TAURI_INTERNALS__ 不存在时，自动注入空 list
  // （让 WorkflowList / NodePalette 等组件能 mount）
  if (!cache) {
    cache = []
    metadataRef.value = []
  }
}
