import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import CanvasContextMenu from '@/plugins/official/workflow/components/editor/CanvasContextMenu.vue'
import { useCanvasContextMenu } from '@/plugins/official/workflow/composables/useCanvasContextMenu'
import { useEditorPreferences } from '@/plugins/official/workflow/composables/useEditorPreferences'

// 注意:CanvasContextMenu 用 <Teleport to="body"> 把内容挂到 body 末尾,
// `w.find` 不会跨 Teleport 边界。所以查 DOM 用 document.body.querySelector。

describe('CanvasContextMenu', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
    useEditorPreferences().reset()
    // 启用 contextmenu add method,openAt 才会真打开
    useEditorPreferences().toggleAddMethod('contextmenu')
  })

  it('renders nothing when closed', () => {
    const w = mount(CanvasContextMenu, { attachTo: document.body })
    expect(document.body.querySelector('[data-testid="canvas-ctx-menu"]')).toBeNull()
    w.unmount()
  })

  it('renders menu container at position when open', async () => {
    const { openAt } = useCanvasContextMenu()
    openAt(100, 200)
    const w = mount(CanvasContextMenu, { attachTo: document.body })
    await w.vm.$nextTick()
    const menu = document.body.querySelector('[data-testid="canvas-ctx-menu"]') as HTMLElement | null
    expect(menu).toBeTruthy()
    expect(menu!.style.left).toBe('100px')
    expect(menu!.style.top).toBe('200px')
    w.unmount()
  })

  it('renders 7 direct options + 1 collapse entry when open', async () => {
    const { openAt } = useCanvasContextMenu()
    openAt(50, 50)
    const w = mount(CanvasContextMenu, { attachTo: document.body })
    await w.vm.$nextTick()
    const items = document.body.querySelectorAll('[data-testid^="ctx-item-"]')
    expect(items.length).toBe(8)  // 7 直显 + 1 折叠
    w.unmount()
  })

  it('emits pick with type on item click and closes menu', async () => {
    const { openAt, isOpen } = useCanvasContextMenu()
    openAt(50, 50)
    const w = mount(CanvasContextMenu, { attachTo: document.body })
    await w.vm.$nextTick()
    const startBtn = document.body.querySelector('[data-testid="ctx-item-start"]') as HTMLButtonElement
    expect(startBtn).toBeTruthy()
    startBtn.click()
    expect(w.emitted('pick')).toBeTruthy()
    expect(w.emitted('pick')![0]).toEqual(['start'])
    expect(isOpen.value).toBe(false)
    w.unmount()
  })

  it('emits pick on click of collapse entry (more)', async () => {
    const { openAt } = useCanvasContextMenu()
    openAt(50, 50)
    const w = mount(CanvasContextMenu, { attachTo: document.body })
    await w.vm.$nextTick()
    const more = document.body.querySelector('[data-testid="ctx-item-more"]') as HTMLButtonElement
    expect(more).toBeTruthy()
    more.click()
    expect(w.emitted('pick')).toBeTruthy()
    expect(w.emitted('pick')![0]).toEqual(['more'])
    w.unmount()
  })
})
