import { describe, it, expect, beforeEach } from 'vitest'
import { useCanvasContextMenu } from '@/plugins/official/workflow/composables/useCanvasContextMenu'
import { useEditorPreferences } from '@/plugins/official/workflow/composables/useEditorPreferences'

// 注意:不要 vi.resetModules — useEditorPreferences / useCanvasContextMenu 共享
// 同一模块实例(module-level state 跨测试共享)。每个 beforeEach 显式 reset()
// 让 addMethods 回到默认 ['click', 'drag'],确保测试隔离。

describe('useCanvasContextMenu', () => {
  beforeEach(() => {
    localStorage.clear()
    useEditorPreferences().reset()
  })

  it('openAt sets position and visible', () => {
    // 测试时启用 contextmenu,避免默认 disabled 早返回
    useEditorPreferences().toggleAddMethod('contextmenu')
    const { isOpen, openAt, position } = useCanvasContextMenu()
    expect(isOpen.value).toBe(false)
    openAt(120, 240)
    expect(isOpen.value).toBe(true)
    expect(position.value).toEqual({ x: 120, y: 240 })
  })

  it('close hides menu', () => {
    useEditorPreferences().toggleAddMethod('contextmenu')
    const { openAt, close, isOpen } = useCanvasContextMenu()
    openAt(10, 20)
    expect(isOpen.value).toBe(true)
    close()
    expect(isOpen.value).toBe(false)
  })

  it('does not open when contextmenu method disabled in preferences (default)', () => {
    // 默认 addMethods = ['click', 'drag'] — 不含 contextmenu
    const { isOpen, openAt } = useCanvasContextMenu()
    openAt(10, 20)
    expect(isOpen.value).toBe(false)
  })

  it('opens when contextmenu method enabled via preferences', () => {
    const prefs = useEditorPreferences()
    prefs.toggleAddMethod('contextmenu')  // 启用
    const { isOpen, openAt } = useCanvasContextMenu()
    openAt(50, 60)
    expect(isOpen.value).toBe(true)
  })

  it('re-open overwrites position', () => {
    useEditorPreferences().toggleAddMethod('contextmenu')
    const { openAt, position } = useCanvasContextMenu()
    openAt(10, 10)
    openAt(100, 200)
    expect(position.value).toEqual({ x: 100, y: 200 })
  })
})
