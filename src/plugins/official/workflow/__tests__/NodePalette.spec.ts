import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type { NodeMetadata } from '@/plugins/official/workflow/composables/useNodeMetadata'

// dev mode 下 useNodeMetadata cache 默认是空。
// 我们 mock useNodeMetadata 模块,在 mount 前注入测试 fixture。
const sampleNodes: NodeMetadata[] = [
  {
    type: 'skill', category: 'builtin', label: '调用 Skill', icon: 'box',
    color: '#3b82f6', pluginId: '', description: '调用一个 Skill',
    configSchema: {},
  },
  {
    type: 'start', category: 'builtin', label: '开始', icon: 'play',
    color: '#10b981', pluginId: '', description: '工作流入口',
    configSchema: {},
  },
]

vi.mock('@/plugins/official/workflow/composables/useNodeMetadata', () => ({
  useNodeMetadata: () => ({
    list: { value: sampleNodes },
    loading: { value: false },
    error: { value: null },
    load: vi.fn().mockResolvedValue(sampleNodes),
    clear: vi.fn(),
    get: vi.fn(),
    byCategory: (cat: string) => sampleNodes.filter(n => n.category === cat),
  }),
}))

import NodePalette from '@/plugins/official/workflow/components/NodePalette.vue'

describe('NodePalette', () => {
  beforeEach(() => {
    // 重置 mock 状态
  })

  it('renders palette entries with data-testid for each node type', async () => {
    const w = mount(NodePalette)
    await flushPromises()
    expect(w.find('[data-testid="palette-entry-skill"]').exists()).toBe(true)
    expect(w.find('[data-testid="palette-entry-start"]').exists()).toBe(true)
  })

  it('emits add-node with type on palette entry click', async () => {
    const w = mount(NodePalette)
    await flushPromises()
    await w.find('[data-testid="palette-entry-skill"]').trigger('click')
    expect(w.emitted('add-node')).toBeTruthy()
    expect(w.emitted('add-node')![0]).toEqual(['skill'])
  })

  it('palette entry has draggable=true', async () => {
    const w = mount(NodePalette)
    await flushPromises()
    const entry = w.find('[data-testid="palette-entry-start"]')
    expect(entry.attributes('draggable')).toBe('true')
  })

  it('dragstart sets application/workflow-node-type data on dataTransfer', async () => {
    const w = mount(NodePalette)
    await flushPromises()
    const entry = w.find('[data-testid="palette-entry-skill"]')
    let captured: Record<string, string> = {}
    const ev = {
      dataTransfer: {
        setData: (k: string, v: string) => { captured[k] = v },
        effectAllowed: '',
      },
    }
    await entry.trigger('dragstart', ev)
    expect(captured['application/workflow-node-type']).toBe('skill')
  })
})
