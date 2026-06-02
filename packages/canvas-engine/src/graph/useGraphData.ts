import { computed } from 'vue'
import { useEntityStore, useRelationStore } from '@worldsmith/entity-core'
import { deduplicateEdges } from '@worldsmith/entity-core/composables'
import { relationSchemaRegistry } from '@worldsmith/entity-core'
import { getNodeTypeInfo, getEdgeTypeInfo } from '@worldsmith/entity-core'

export interface GraphNode {
  id: string
  name: string
  type: string
  label: string
  icon: string
  shape: string
  coolColor: string
  warmColor: string
  tags: string[]
  description: string
  degree: number
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  relType: string
  relLabel: string
  bidirectional: boolean
  symmetric: boolean
  relationIds: string[]
  coolColor: string
  warmColor: string
  dashed: boolean
  noArrow: boolean
  curveStyle: 'bezier' | 'straight' | 'taxi'
}

export function useGraphData() {
  const entityStore = useEntityStore()
  const relationStore = useRelationStore()

  const nodes = computed<GraphNode[]>(() => {
    const degreeMap = new Map<string, number>()
    for (const r of relationStore.relations) {
      degreeMap.set(r.sourceId, (degreeMap.get(r.sourceId) || 0) + 1)
      degreeMap.set(r.targetId, (degreeMap.get(r.targetId) || 0) + 1)
    }
    return entityStore.entities.map(e => {
      const info = getNodeTypeInfo(e.type)
      return {
        id: e.id,
        name: e.name,
        type: e.type,
        label: info.label,
        icon: info.icon,
        shape: info.shape,
        coolColor: info.coolColor,
        warmColor: info.warmColor,
        tags: e.tags || [],
        description: e.description || '',
        degree: degreeMap.get(e.id) || 0,
      }
    })
  })

  const edges = computed<GraphEdge[]>(() => {
    const merged = deduplicateEdges(
      relationStore.relations,
      (type) => relationSchemaRegistry.get(type)?.label || type
    )
    return merged.map(me => {
      const info = getEdgeTypeInfo(me.relType)
      return {
        id: me.id,
        source: me.source,
        target: me.target,
        relType: me.relType,
        relLabel: me.relLabel,
        bidirectional: me.bidirectional,
        symmetric: me.symmetric,
        relationIds: me.relationIds,
        coolColor: info.coolColor,
        warmColor: info.warmColor,
        dashed: info.dashed,
        noArrow: info.noArrow,
        curveStyle: info.curveStyle,
      }
    })
  })

  const nodeCount = computed(() => nodes.value.length)
  const edgeCount = computed(() => edges.value.length)

  const nodeMap = computed(() => {
    const m = new Map<string, GraphNode>()
    for (const n of nodes.value) m.set(n.id, n)
    return m
  })

  const edgeMap = computed(() => {
    const m = new Map<string, GraphEdge>()
    for (const e of edges.value) m.set(e.id, e)
    return m
  })

  function getNode(id: string): GraphNode | undefined {
    return nodeMap.value.get(id)
  }

  function getEdge(id: string): GraphEdge | undefined {
    return edgeMap.value.get(id)
  }

  return {
    nodes,
    edges,
    nodeCount,
    edgeCount,
    nodeMap,
    edgeMap,
    getNode,
    getEdge,
  }
}
