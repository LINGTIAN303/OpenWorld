import { storage } from './StorageBackend'
import type { Relation } from '@worldsmith/entity-core'

export class GraphEngine {
  async getConnected(entityId: string): Promise<Relation[]> {
    return storage.getRelationsByEntity(entityId)
  }

  async traverse(
    entityId: string,
    depth: number = 2
  ): Promise<Map<string, Relation[]>> {
    const visited = new Set<string>()
    const result = new Map<string, Relation[]>()
    let current = new Set([entityId])

    for (let d = 0; d < depth; d++) {
      const next = new Set<string>()
      for (const nodeId of current) {
        if (visited.has(nodeId)) continue
        visited.add(nodeId)
        const relations = await this.getConnected(nodeId)
        result.set(nodeId, relations)
        for (const rel of relations) {
          const otherId =
            rel.sourceId === nodeId ? rel.targetId : rel.sourceId
          if (!visited.has(otherId)) next.add(otherId)
        }
      }
      current = next
      if (current.size === 0) break
    }
    return result
  }

  async findPath(
    fromId: string,
    toId: string,
    maxDepth: number = 5
  ): Promise<Relation[] | null> {
    interface QueueItem {
      nodeId: string
      path: Relation[]
    }
    const visited = new Set<string>()
    const queue: QueueItem[] = [{ nodeId: fromId, path: [] }]

    while (queue.length > 0) {
      const { nodeId, path } = queue.shift()!
      if (nodeId === toId) return path
      if (path.length >= maxDepth) continue
      if (visited.has(nodeId)) continue
      visited.add(nodeId)

      const relations = await this.getConnected(nodeId)
      for (const rel of relations) {
        const otherId =
          rel.sourceId === nodeId ? rel.targetId : rel.sourceId
        if (!visited.has(otherId)) {
          queue.push({ nodeId: otherId, path: [...path, rel] })
        }
      }
    }
    return null
  }
}

export const graphEngine = new GraphEngine()
