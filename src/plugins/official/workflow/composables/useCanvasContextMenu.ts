// useCanvasContextMenu
//
// P3 新增 add method:"contextmenu" 右键菜单添加节点。
// 当 preferences.addMethods 包含 'contextmenu' 时,右键点击 canvas 打开菜单。
// 否则 openAt 早返回(无菜单)。
//
// isOpen / position 是 module-level 状态,确保组件 + 测试 + 调用方
// 共享同一 ref(否则组件内 useCanvasContextMenu() 拿到的是新 ref,
// 看不到 openAt 的设置)。
//
// 用法:
//   const { openAt, close } = useCanvasContextMenu()
//   <div @contextmenu.prevent="(e) => openAt(e.clientX, e.clientY)" />
//   <CanvasContextMenu @close="close" />

import { ref, type Ref } from 'vue'
import { useEditorPreferences } from './useEditorPreferences'

export interface MenuPosition {
  x: number
  y: number
}

const _isOpen: Ref<boolean> = ref(false)
const _position: Ref<MenuPosition> = ref({ x: 0, y: 0 })

export function useCanvasContextMenu() {
  const prefs = useEditorPreferences()

  function openAt(x: number, y: number): void {
    if (!prefs.isAddMethodEnabled('contextmenu')) return
    _position.value = { x, y }
    _isOpen.value = true
  }

  function close(): void {
    _isOpen.value = false
  }

  return { isOpen: _isOpen, position: _position, openAt, close }
}
