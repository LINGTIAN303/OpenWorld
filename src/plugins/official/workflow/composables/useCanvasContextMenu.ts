// useCanvasContextMenu
//
// P3 新增 add method:"contextmenu" 右键菜单添加节点。
// 当 preferences.addMethods 包含 'contextmenu' 时,右键点击 canvas 打开菜单。
// 否则 openAt 早返回(无菜单)。
//
// 用法:
//   const { isOpen, position, openAt, close } = useCanvasContextMenu()
//   <div @contextmenu.prevent="(e) => openAt(e.clientX, e.clientY)" />
//   <CanvasContextMenu v-if="isOpen" :position="position" @close="close" />

import { ref, type Ref } from 'vue'
import { useEditorPreferences } from './useEditorPreferences'

export interface MenuPosition {
  x: number
  y: number
}

export function useCanvasContextMenu() {
  const prefs = useEditorPreferences()
  const isOpen: Ref<boolean> = ref(false)
  const position: Ref<MenuPosition> = ref({ x: 0, y: 0 })

  function openAt(x: number, y: number): void {
    if (!prefs.isAddMethodEnabled('contextmenu')) return
    position.value = { x, y }
    isOpen.value = true
  }

  function close(): void {
    isOpen.value = false
  }

  return { isOpen, position, openAt, close }
}
