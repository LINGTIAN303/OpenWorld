// 编辑器类型 — 独立 .ts 文件，避免跨模块 import Vue SFC 类型

export interface EditorNode {
  id: string
  type: string
  config: Record<string, unknown>
  position?: { x: number; y: number }
}

export interface EditorEdge {
  from: string
  to: string
  label?: string
  condition?: string
}

export interface EditorDefinition {
  id: string
  name: string
  version: number
  description?: string
  category: string
  nodes: EditorNode[]
  edges: EditorEdge[]
}
