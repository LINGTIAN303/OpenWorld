import type { WorkflowDefinition, ValidationResult } from './types'

export function validateWorkflow(def: WorkflowDefinition): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  const nodeIds = new Set(def.nodes.map(n => n.id))
  const startNodes = def.nodes.filter(n => n.type === 'start')
  const endNodes = def.nodes.filter(n => n.type === 'end')

  if (startNodes.length === 0) errors.push('缺少 start 节点')
  if (startNodes.length > 1) errors.push('只能有一个 start 节点')
  if (endNodes.length === 0) errors.push('缺少 end 节点')

  for (const node of def.nodes) {
    if (!node.id) errors.push(`节点缺少 id: ${JSON.stringify(node)}`)
  }

  const duplicateIds = def.nodes.map(n => n.id).filter((id, i, arr) => arr.indexOf(id) !== i)
  for (const id of [...new Set(duplicateIds)]) {
    errors.push(`重复的节点 ID: "${id}"`)
  }

  for (const edge of def.edges) {
    if (!nodeIds.has(edge.from)) {
      errors.push(`边的 from 节点不存在: "${edge.from}"`)
    }
    if (!nodeIds.has(edge.to)) {
      errors.push(`边的 to 节点不存在: "${edge.to}"`)
    }
  }

  const cycleResult = detectCycles(def)
  if (cycleResult.hasCycle) {
    errors.push(`检测到循环引用: ${cycleResult.cyclePath.join(' → ')}`)
  }

  const reachableFromStart = findReachable(def, startNodes[0]?.id)
  for (const node of def.nodes) {
    if (node.type !== 'start' && !reachableFromStart.has(node.id)) {
      warnings.push(`节点 "${node.id}" 从 start 不可达`)
    }
  }

  const nodesWithNoOutgoing = def.nodes.filter(n =>
    n.type !== 'end' && !def.edges.some(e => e.from === n.id)
  )
  for (const node of nodesWithNoOutgoing) {
    if (node.type !== 'end') {
      warnings.push(`节点 "${node.id}" 没有出边（非 end 节点）`)
    }
  }

  for (const node of def.nodes) {
    if (node.type === 'loop' || node.type === 'iterate') {
      if (!node.sub_graph) {
        errors.push(`${node.type} 节点 "${node.id}" 缺少 sub_graph 定义`)
      }
    }
    if (node.type === 'skip') {
      if (!node.config.target) {
        errors.push(`skip 节点 "${node.id}" 缺少 config.target`)
      } else if (!nodeIds.has(node.config.target as string)) {
        errors.push(`skip 节点 "${node.id}" 的 target "${node.config.target}" 不存在`)
      }
    }
    if (node.type === 'condition') {
      if (!node.config.expression) {
        errors.push(`condition 节点 "${node.id}" 缺少 config.expression`)
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

function findReachable(def: WorkflowDefinition, startId: string | undefined): Set<string> {
  if (!startId) return new Set()
  const visited = new Set<string>()
  const queue = [startId]
  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)
    for (const edge of def.edges) {
      if (edge.from === current && !visited.has(edge.to)) {
        queue.push(edge.to)
      }
    }
  }
  return visited
}

function detectCycles(def: WorkflowDefinition): { hasCycle: boolean; cyclePath: string[] } {
  const WHITE = 0
  const color: Map<string, number> = new Map()
  const parent: Map<string, string | null> = new Map()

  for (const node of def.nodes) {
    color.set(node.id, WHITE)
    parent.set(node.id, null)
  }

  const adj: Map<string, string[]> = new Map()
  for (const node of def.nodes) {
    adj.set(node.id, [])
  }
  for (const edge of def.edges) {
    const neighbors = adj.get(edge.from)
    if (neighbors) neighbors.push(edge.to)
  }

  for (const node of def.nodes) {
    if (color.get(node.id) === WHITE) {
      const cyclePath = dfs(node.id, adj, color, parent)
      if (cyclePath) return { hasCycle: true, cyclePath }
    }
  }

  return { hasCycle: false, cyclePath: [] }
}

function dfs(
  nodeId: string,
  adj: Map<string, string[]>,
  color: Map<string, number>,
  parent: Map<string, string | null>,
): string[] | null {
  color.set(nodeId, 1)

  const neighbors = adj.get(nodeId) || []
  for (const neighbor of neighbors) {
    if (color.get(neighbor) === 1) {
      const path: string[] = [neighbor]
      let current: string | null = nodeId
      while (current !== null && current !== neighbor) {
        path.unshift(current)
        current = parent.get(current) ?? null
      }
      path.unshift(neighbor)
      return path
    }
    if (color.get(neighbor) === 0) {
      parent.set(neighbor, nodeId)
      const result = dfs(neighbor, adj, color, parent)
      if (result) return result
    }
  }

  color.set(nodeId, 2)
  return null
}
