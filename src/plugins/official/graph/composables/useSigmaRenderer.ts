import { shallowRef, onBeforeUnmount, type Ref } from 'vue'
import Sigma from 'sigma'
import Graph from 'graphology'
import type { SigmaOptions } from 'sigma'

export function useSigmaRenderer(
  containerRef: Ref<HTMLElement | null>,
  getGraph: () => Graph,
) {
  const sigma = shallowRef<Sigma | null>(null)

  const SIGMA_SETTINGS: Partial<SigmaOptions> = {
    defaultNodeColor: '#4fc3f7',
    defaultEdgeColor: 'rgba(255,255,255,0.15)',
    defaultNodeSize: 6,
    defaultEdgeSize: 1,
    labelFont: 'Arial',
    labelSize: 12,
    labelColor: { color: '#e0e0e0' },
    labelWeight: 'normal',
    labelRenderedSizeThreshold: 8,
    renderEdgeLabels: false,
    enableEdgeClickEvents: true,
    enableEdgeHoverEvents: true,
    minCameraRatio: 0.05,
    maxCameraRatio: 10,
    hideEdgesOnMove: true,
    hideLabelsOnMove: true,
    nodeSizeRatio: 0.5,
    renderLabels: true,
    antiFlicker: true,
  }

  function createRenderer(options?: Partial<SigmaOptions>): Sigma | null {
    if (!containerRef.value) return null
    destroyRenderer()
    const graph = getGraph()
    if (graph.order === 0) return null
    const instance = new Sigma(graph, containerRef.value, {
      ...SIGMA_SETTINGS,
      ...options,
    })
    sigma.value = instance
    return instance
  }

  function destroyRenderer() {
    if (sigma.value) {
      sigma.value.kill()
      sigma.value = null
    }
  }

  function refresh() {
    sigma.value?.refresh()
  }

  onBeforeUnmount(() => {
    destroyRenderer()
  })

  return {
    sigma,
    createRenderer,
    destroyRenderer,
    refresh,
  }
}
