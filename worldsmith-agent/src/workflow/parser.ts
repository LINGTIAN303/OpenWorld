import yaml from 'js-yaml'
import type { WorkflowDefinition, WorkflowParam, NodeDefinition, EdgeDefinition, WorkflowGraph } from './types'

export function parseDefinition(input: string): WorkflowDefinition {
  let raw: unknown
  try {
    raw = yaml.load(input)
  } catch {
    try {
      raw = JSON.parse(input)
    } catch {
      throw new Error('工作流定义既不是有效的 YAML 也不是有效的 JSON')
    }
  }

  return validateAndNormalize(raw)
}

function validateAndNormalize(raw: unknown): WorkflowDefinition {
  if (!raw || typeof raw !== 'object') {
    throw new Error('工作流定义必须是一个对象')
  }

  const def = raw as Record<string, unknown>

  if (!def.id || typeof def.id !== 'string') {
    throw new Error('工作流定义缺少 id 字段')
  }
  if (!def.name || typeof def.name !== 'string') {
    throw new Error('工作流定义缺少 name 字段')
  }
  if (!Array.isArray(def.nodes) || def.nodes.length === 0) {
    throw new Error('工作流定义必须包含至少一个节点')
  }
  if (!Array.isArray(def.edges)) {
    def.edges = []
  }

  const nodes = (def.nodes as Array<Record<string, unknown>>).map(normalizeNode)
  const edges = (def.edges as Array<Record<string, unknown>>).map(normalizeEdge)

  return {
    id: def.id as string,
    name: def.name as string,
    version: (def.version as number) || 1,
    description: def.description as string | undefined,
    params: def.params as Record<string, WorkflowParam> | undefined,
    timeout: def.timeout as number | undefined,
    nodes,
    edges,
  }
}

function normalizeNode(raw: Record<string, unknown>): NodeDefinition {
  return {
    id: raw.id as string,
    type: raw.type as NodeDefinition['type'],
    config: (raw.config as Record<string, unknown>) || {},
    position: raw.position as NodeDefinition['position'],
    error_handling: raw.error_handling as NodeDefinition['error_handling'],
    timeout: raw.timeout as number | undefined,
    sub_graph: raw.sub_graph ? normalizeSubGraph(raw.sub_graph) : undefined,
  }
}

function normalizeEdge(raw: Record<string, unknown>): EdgeDefinition {
  return {
    from: raw.from as string,
    to: raw.to as string,
    label: raw.label as string | undefined,
    condition: raw.condition as string | undefined,
  }
}

function normalizeSubGraph(raw: unknown): WorkflowGraph {
  const g = raw as Record<string, unknown>
  return {
    nodes: (Array.isArray(g.nodes) ? g.nodes : []).map((n: Record<string, unknown>) => normalizeNode(n)),
    edges: (Array.isArray(g.edges) ? g.edges : []).map((e: Record<string, unknown>) => normalizeEdge(e)),
  }
}
