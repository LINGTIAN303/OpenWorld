import { defineStore } from 'pinia'
import { ref, shallowRef, watch } from 'vue'
import type { Component } from 'vue'
import { watchDebounced } from '@worldsmith/perf-kit/render'

const STORAGE_KEY = 'worldsmith_sidebar_order'

function loadOrder(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveOrder(order: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order))
  } catch { /* quota exceeded, 静默 */ }
}

export const useUIStore = defineStore('ui', () => {
  const currentView = ref<string | null>(null)
  const selectedEntityId = ref<string | null>(null)
  const sidebarCollapsed = ref(false)
  const menuOpen = ref(false)
  const viewComponent = shallowRef<Component | null>(null)
  const viewRefreshKey = ref(0)
  const _jumpBackViewId = ref<string | null>(null)

  const currentShell = ref<'space' | 'workbench'>(
    (localStorage.getItem('worldsmith_shell') as 'space' | 'workbench') || 'space'
  )

  watch(currentShell, (val) => {
    try { localStorage.setItem('worldsmith_shell', val) } catch {}
  })

  const sidebarOrder = ref<string[]>(loadOrder())

  // 自动持久化（防抖替代 deep watch）
  watchDebounced(() => sidebarOrder.value, () => saveOrder(sidebarOrder.value), { debounce: 100, deep: true })

  function setView(viewId: string) {
    currentView.value = viewId
    selectedEntityId.value = null
  }

  function selectEntity(id: string | null) {
    selectedEntityId.value = id
  }

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  function toggleMenu() {
    menuOpen.value = !menuOpen.value
  }

  /**
   * 将新视图 ID 加入排序末尾（如果尚未存在）
   */
  function ensureViewInOrder(viewId: string) {
    if (!sidebarOrder.value.includes(viewId)) {
      sidebarOrder.value.push(viewId)
    }
  }

  /**
   * 拖拽移动：将 fromIndex 位置的项移到 toIndex
   */
  function moveSidebarItemById(fromId: string, toId: string) {
    const order = [...sidebarOrder.value]
    // 确保两个 ID 都在 order 中
    if (!order.includes(fromId)) order.push(fromId)
    const fromIdx = order.indexOf(fromId)
    const toIdx = order.indexOf(toId)
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return
    const [moved] = order.splice(fromIdx, 1)
    order.splice(toIdx, 0, moved)
    sidebarOrder.value = order
  }

  return {
    currentView,
    selectedEntityId,
    sidebarCollapsed,
    menuOpen,
    viewComponent,
    viewRefreshKey,
    _jumpBackViewId,
    currentShell,
    setShell(shell: 'space' | 'workbench') { currentShell.value = shell },
    sidebarOrder,
    setView,
    selectEntity,
    toggleSidebar,
    toggleMenu,
    ensureViewInOrder,
    moveSidebarItemById,
  }
})
