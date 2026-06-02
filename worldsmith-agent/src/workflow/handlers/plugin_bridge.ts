// Plugin Bridge — 暴露 `registerSkillNode` 钩子给外部 plugin
//
// 用法（plugin 端）：
//   import { registerSkillNode } from '@worldsmith/agent/workflow/handlers/plugin_bridge'
//
//   registerSkillNode({
//     type: 'my_plugin.skill',
//     pluginId: 'my-plugin',
//     label: '我的 Skill',
//     configSchema: { ... },
//     execute: async (config, ctx, api) => { ... },
//   })
//
// 行为（Phase 4.6）：
//   * register 时调 `nodeRegistry.register(def)`（本地）
//   * 同步调 Rust 端 `workflow_register_node_type` 把 NodeMetadata 写入 AppState 内存表
//     → 让 listNodeTypes / getNodeSchema 自动合并返回
//   * 反注册时 `nodeRegistry.unregister(type)` + 通知 Rust `workflow_unregister_node_type`
//
// 注意：
//   * 不主动清前端 useNodeMetadata 缓存 —
//     正常启动流：plugin 在 `activate()` 里 register → useNodeMetadata 首次 load 时已包含。
//     Hot-reload 场景留作未来工作（届时发 'plugin-node-meta-changed' CustomEvent 通知）。

import { invoke } from '@tauri-apps/api/core'

import { nodeRegistry } from '../node-registry'
import type { NodeTypeDefinition } from '../types'

/** 注册一个 Skill 节点（外部 plugin 使用） */
export function registerSkillNode(def: NodeTypeDefinition): void {
  // 1. 本地注册（dispatch_listener 直接查）
  nodeRegistry.register(def)
  // 2. 通知 Rust 端（写入 AppState.plugin_node_metas）
  invoke('workflow_register_node_type', { payload: serializeNodeMeta(def) }).catch((err) => {
    console.warn('[plugin_bridge] 通知 Rust 端失败:', err)
  })
}

/** 反注册某类型 */
export function unregisterSkillNode(type: string): boolean {
  const ok = nodeRegistry.unregister(type)
  invoke('workflow_unregister_node_type', { type }).catch((err) =>
    console.warn('[plugin_bridge] 反注册 Rust 端失败:', err),
  )
  return ok
}

/** 反注册某 plugin 的所有节点 */
export function unregisterSkillNodesByPlugin(pluginId: string): number {
  const n = nodeRegistry.unregisterByPlugin(pluginId)
  // 逐个通知 Rust 端反注册
  const types = nodeRegistry.typesByPlugin(pluginId)
  for (const t of types) {
    invoke('workflow_unregister_node_type', { type: t }).catch((err) =>
      console.warn('[plugin_bridge] 反注册 Rust 端失败:', err),
    )
  }
  return n
}

/**
 * 把 NodeTypeDefinition 序列化为 RegisterNodeTypePayload 传给 Rust。
 *
 * 不传 `execute`（不可序列化）。
 * `configSchema` 内部每个 field 的 type 限定为 'string' | 'number' | 'boolean'
 * （与 Rust 端 NodeConfigFieldSchema 一致；其他类型如 'select' / 'array' 暂被忽略 → 降级为 'string'）。
 */
function serializeNodeMeta(def: NodeTypeDefinition): {
  type: string
  pluginId: string
  label: string
  category: 'builtin' | 'plugin'
  icon: string
  color: string
  description: string
  configSchema: Record<
    string,
    {
      type: 'string' | 'number' | 'boolean'
      required?: boolean
      default?: unknown
      description?: string
      options?: string[]
      label?: string
    }
  >
} {
  const configSchema: Record<
    string,
    {
      type: 'string' | 'number' | 'boolean'
      required?: boolean
      default?: unknown
      description?: string
      options?: string[]
      label?: string
    }
  > = {}
  for (const [k, v] of Object.entries(def.configSchema ?? {})) {
    const t: 'string' | 'number' | 'boolean' =
      v.type === 'number' || v.type === 'boolean' ? v.type : 'string'
    configSchema[k] = {
      type: t,
      required: v.required,
      default: v.default,
      description: v.description,
      options: v.options,
      label: v.label,
    }
  }
  return {
    type: def.type,
    pluginId: def.pluginId,
    label: def.label,
    category: def.category,
    icon: def.icon,
    color: def.color,
    description: def.description,
    configSchema,
  }
}
