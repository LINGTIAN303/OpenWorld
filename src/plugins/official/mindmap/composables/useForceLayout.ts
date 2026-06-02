import { ref } from 'vue'
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, type SimulationNodeDatum, type SimulationLinkDatum } from 'd3-force'
import type { CanvasNode, CanvasEdge } from './canvasTypes'

interface SimNode extends SimulationNodeDatum {
  id: string
  width: number
  height: number
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  id: string
}

export type LayoutType = 'force' | 'radial' | 'tree' | 'compact'

export function useForceLayout() {
  const isComputing = ref(false)
  let simulation: ReturnType<typeof forceSimulation<SimNode, SimLink>> | null = null

  function applyLayout(
    nodes: CanvasNode[],
    _edges: CanvasEdge[],
    layout: LayoutType = 'force',
    onTick?: () => void,
  ): void {
    if (nodes.length === 0) return
    isComputing.value = true
    stopSimulation()

    const simNodes: SimNode[] = nodes.filter(n => !n.hidden).map(n => ({
      id: n.id,
      x: n.x || 0,
      y: n.y || 0,
      width: n.width,
      height: n.height,
    }))

    const nodeMap = new Map(simNodes.map(n => [n.id, n]))
    const simLinks: SimLink[] = _edges
      .filter(e => !e.hidden && nodeMap.has(e.source as string) && nodeMap.has(e.target as string))
      .map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
      }))

    const centerX = nodes.reduce((s, n) => s + (n.x || 0), 0) / nodes.length || 400
    const centerY = nodes.reduce((s, n) => (n.y || 0), 0) / nodes.length || 300

    simulation = forceSimulation<SimNode, SimLink>(simNodes)

    switch (layout) {
      case 'force':
        simulation
          .force('link', forceLink<SimNode, SimLink>(simLinks).id(d => d.id).distance(120).strength(0.5))
          .force('charge', forceManyBody().strength(-300))
          .force('center', forceCenter(centerX, centerY))
          .force('collide', forceCollide<SimNode>().radius(d => Math.max(d.width, d.height) / 2 + 20))
        break
      case 'radial':
        simulation
          .force('link', forceLink<SimNode, SimLink>(simLinks).id(d => d.id).distance(100).strength(0.3))
          .force('charge', forceManyBody().strength(-200))
          .force('center', forceCenter(centerX, centerY).strength(0.8))
          .force('collide', forceCollide<SimNode>().radius(d => Math.max(d.width, d.height) / 2 + 15))
        break
      case 'tree':
        simulation
          .force('link', forceLink<SimNode, SimLink>(simLinks).id(d => d.id).distance(80).strength(0.8))
          .force('charge', forceManyBody().strength(-150))
          .force('center', forceCenter(centerX, centerY))
          .force('collide', forceCollide<SimNode>().radius(d => Math.max(d.width, d.height) / 2 + 10))
        break
      case 'compact':
        simulation
          .force('link', forceLink<SimNode, SimLink>(simLinks).id(d => d.id).distance(60).strength(0.6))
          .force('charge', forceManyBody().strength(-100))
          .force('center', forceCenter(centerX, centerY).strength(0.5))
          .force('collide', forceCollide<SimNode>().radius(d => Math.max(d.width, d.height) / 2 + 8))
        break
    }

    simulation.on('tick', () => {
      for (const sn of simNodes) {
        const node = nodes.find(n => n.id === sn.id)
        if (node && sn.x != null && sn.y != null) {
          node.x = sn.x
          node.y = sn.y
        }
      }
      onTick?.()
    })

    simulation.on('end', () => {
      isComputing.value = false
    })

    simulation.alpha(1).restart()
  }

  function stopSimulation(): void {
    if (simulation) {
      simulation.stop()
      simulation = null
    }
    isComputing.value = false
  }

  function pinNode(node: CanvasNode): void {
    node.fx = node.x
    node.fy = node.y
  }

  function unpinNode(node: CanvasNode): void {
    node.fx = null
    node.fy = null
  }

  return {
    isComputing,
    applyLayout,
    stopSimulation,
    pinNode,
    unpinNode,
  }
}
