import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import NodeHoverLayer from '@/plugins/official/workflow/components/editor/NodeHoverLayer.vue'
import type { FormSchema } from '@/plugins/official/workflow/composables/useNodeSchema'

// NodeHoverLayer 用 <Teleport to="body"> 渲染到 body,
// 测试用 document.body.querySelector 跨 Teleport 查 DOM。

const sampleSchema: FormSchema = {
  fields: [{ name: 'label', label: '标签', type: 'text' }],
}

vi.mock('@/plugins/official/workflow/composables/useNodeSchema', () => ({
  useNodeSchema: () => ({
    getFor: vi.fn().mockReturnValue(sampleSchema),
  }),
}))

describe('NodeHoverLayer', () => {
  let origInnerWidth: number
  beforeEach(() => {
    document.body.innerHTML = ''
    origInnerWidth = window.innerWidth
  })
  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: origInnerWidth, configurable: true })
  })

  it('renders nothing when node is null', () => {
    const w = mount(NodeHoverLayer, { attachTo: document.body, props: { node: null, anchor: { x: 0, y: 0 } } })
    expect(document.body.querySelector('[data-testid="hover-layer"]')).toBeNull()
    w.unmount()
  })

  it('renders layer when node is provided', async () => {
    const w = mount(NodeHoverLayer, {
      attachTo: document.body,
      props: { node: { id: 'n1', type: 'skill', config: {} }, anchor: { x: 100, y: 200 } },
    })
    await w.vm.$nextTick()
    const el = document.body.querySelector('[data-testid="hover-layer"]')
    expect(el).toBeTruthy()
    w.unmount()
  })

  it('flips to left when anchor.x + 280 > viewport', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
    const w = mount(NodeHoverLayer, {
      attachTo: document.body,
      props: { node: { id: 'n1', type: 'skill', config: {} }, anchor: { x: 900, y: 100 } },
    })
    await w.vm.$nextTick()
    const el = document.body.querySelector('[data-testid="hover-layer"]') as HTMLElement
    expect(el.getAttribute('data-flip')).toBe('left')
    w.unmount()
  })

  it('does not flip when anchor.x + 280 <= viewport', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
    const w = mount(NodeHoverLayer, {
      attachTo: document.body,
      props: { node: { id: 'n1', type: 'skill', config: {} }, anchor: { x: 100, y: 100 } },
    })
    await w.vm.$nextTick()
    const el = document.body.querySelector('[data-testid="hover-layer"]') as HTMLElement
    expect(el.getAttribute('data-flip')).toBe('right')
    w.unmount()
  })

  it('emits confirm on confirm button click', async () => {
    const w = mount(NodeHoverLayer, {
      attachTo: document.body,
      props: { node: { id: 'n1', type: 'skill', config: {} }, anchor: { x: 0, y: 0 } },
    })
    await w.vm.$nextTick()
    const btn = document.body.querySelector('[data-testid="hover-confirm"]') as HTMLButtonElement
    btn.click()
    expect(w.emitted('confirm')).toBeTruthy()
    w.unmount()
  })

  it('emits cancel on cancel button click', async () => {
    const w = mount(NodeHoverLayer, {
      attachTo: document.body,
      props: { node: { id: 'n1', type: 'skill', config: {} }, anchor: { x: 0, y: 0 } },
    })
    await w.vm.$nextTick()
    const btn = document.body.querySelector('[data-testid="hover-cancel"]') as HTMLButtonElement
    btn.click()
    expect(w.emitted('cancel')).toBeTruthy()
    w.unmount()
  })
})
