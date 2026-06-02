import { ref, watch } from 'vue'

const STORAGE_KEY = 'ws-outline-layout'

interface OutlineLayout {
  expandedIds: string[]
  selectedNodeId: string | null
}

export function useOutlineLayout() {
  const expandedIds = ref<Set<string>>(new Set())
  const selectedNodeId = ref<string | null>(null)

  function saveLayout() {
    const data: OutlineLayout = {
      expandedIds: [...expandedIds.value],
      selectedNodeId: selectedNodeId.value,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }

  function loadLayout() {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    try {
      const data: OutlineLayout = JSON.parse(raw)
      if (data.expandedIds) expandedIds.value = new Set(data.expandedIds)
      if (data.selectedNodeId) selectedNodeId.value = data.selectedNodeId
    } catch {}
  }

  function toggleExpanded(id: string) {
    const next = new Set(expandedIds.value)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    expandedIds.value = next
  }

  function isExpanded(id: string): boolean {
    return expandedIds.value.has(id)
  }

  watch([expandedIds, selectedNodeId], () => {
    saveLayout()
  }, { deep: true })

  return {
    expandedIds,
    selectedNodeId,
    loadLayout,
    toggleExpanded,
    isExpanded,
  }
}
