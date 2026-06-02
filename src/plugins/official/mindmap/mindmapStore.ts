import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

export interface Section {
  id: string
  name: string
  color: string
  childNodeIds: string[]
  isEntity: boolean
  entityId?: string
}

export interface CustomNode {
  id: string
  parentId: string
  type: 'textbox' | 'image' | 'note' | 'link'
  name: string
  content: string
  position: { x: number; y: number }
  style: Record<string, unknown>
}

export interface EdgeStyleOverride {
  lineStyle: 'bezier' | 'straight' | 'taxi' | 'unbundled-bezier'
}

const STORAGE_PREFIX = 'worldsmith_mindmap_'

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key)
    return raw ? JSON.parse(raw) : fallback
  } catch { return fallback }
}

function saveToStorage(key: string, value: unknown) {
  try { localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value)) } catch { /* noop */ }
}

export const useMindmapStore = defineStore('mindmap', () => {
  const navigationStack = ref<string[]>([])
  const currentRootId = ref<string | null>(null)

  const sections = ref<Record<string, Section>>(loadFromStorage('sections', {}))
  const customNodes = ref<Record<string, CustomNode>>(loadFromStorage('customNodes', {}))
  const edgeStyleOverrides = ref<Record<string, EdgeStyleOverride>>(loadFromStorage('edgeStyleOverrides', {}))

  const keySequence = ref('')
  const keySequenceTimer = ref<ReturnType<typeof setTimeout> | null>(null)

  const detailPanelVisible = ref(false)
  const detailPanelAutoMode = ref(true)

  const breadcrumb = computed(() => {
    const items: { id: string | null; name: string }[] = [{ id: null, name: '全局图' }]
    for (const eid of navigationStack.value) {
      items.push({ id: eid, name: eid })
    }
    return items
  })

  function enterNode(id: string) {
    navigationStack.value.push(id)
    currentRootId.value = id
  }

  function exitNode() {
    navigationStack.value.pop()
    currentRootId.value = navigationStack.value.length > 0
      ? navigationStack.value[navigationStack.value.length - 1]
      : null
  }

  function exitToGlobal() {
    navigationStack.value = []
    currentRootId.value = null
  }

  function jumpTo(id: string | null) {
    if (id === null) { exitToGlobal(); return }
    const idx = navigationStack.value.indexOf(id)
    if (idx >= 0) {
      navigationStack.value = navigationStack.value.slice(0, idx + 1)
      currentRootId.value = id
    }
  }

  function addSection(section: Section) {
    sections.value[section.id] = section
  }

  function removeSection(id: string) {
    delete sections.value[id]
  }

  function updateSection(id: string, patch: Partial<Section>) {
    if (sections.value[id]) {
      sections.value[id] = { ...sections.value[id], ...patch }
    }
  }

  function addCustomNode(node: CustomNode) {
    customNodes.value[node.id] = node
  }

  function removeCustomNode(id: string) {
    delete customNodes.value[id]
  }

  function setEdgeStyleOverride(edgeId: string, style: EdgeStyleOverride) {
    edgeStyleOverrides.value[edgeId] = style
  }

  function removeEdgeStyleOverride(edgeId: string) {
    delete edgeStyleOverrides.value[edgeId]
  }

  function showDetailPanel() {
    detailPanelVisible.value = true
    detailPanelAutoMode.value = true
  }

  function hideDetailPanel() {
    detailPanelVisible.value = false
    detailPanelAutoMode.value = false
  }

  function toggleDetailPanel() {
    if (detailPanelVisible.value) {
      hideDetailPanel()
    } else {
      showDetailPanel()
    }
  }

  watch(sections, (v) => saveToStorage('sections', v), { deep: true })
  watch(customNodes, (v) => saveToStorage('customNodes', v), { deep: true })
  watch(edgeStyleOverrides, (v) => saveToStorage('edgeStyleOverrides', v), { deep: true })

  return {
    navigationStack, currentRootId, breadcrumb,
    sections, customNodes, edgeStyleOverrides,
    keySequence, keySequenceTimer,
    detailPanelVisible, detailPanelAutoMode,
    enterNode, exitNode, exitToGlobal, jumpTo,
    addSection, removeSection, updateSection,
    addCustomNode, removeCustomNode,
    setEdgeStyleOverride, removeEdgeStyleOverride,
    showDetailPanel, hideDetailPanel, toggleDetailPanel,
  }
})
