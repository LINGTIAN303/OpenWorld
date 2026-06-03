import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import InlineNodeEditor from '@/plugins/official/workflow/components/editor/InlineNodeEditor.vue'
import type { FormSchema } from '@/plugins/official/workflow/composables/useNodeSchema'

// mock getNodeSchema 返回简单的 1-字段 schema,让 NodeForm 渲染 input
const sampleSchema: FormSchema = {
  fields: [
    { name: 'label', label: '标签', type: 'text', default: '默认' },
  ],
}

vi.mock('@/plugins/official/workflow/composables/useNodeSchema', () => ({
  useNodeSchema: () => ({
    getFor: vi.fn().mockReturnValue(sampleSchema),
  }),
  useNodeSchemaSimple: () => ({
    getFor: vi.fn().mockReturnValue(sampleSchema),
  }),
}))

describe('InlineNodeEditor', () => {
  it('renders 3 collapsible sections: basic / config / advanced', () => {
    const w = mount(InlineNodeEditor, {
      props: { node: { id: 'n1', type: 'skill', config: {} } },
    })
    expect(w.text()).toContain('基本信息')
    expect(w.text()).toContain('配置')
    expect(w.text()).toContain('高级')
  })

  it('emits update:config when config input changes', async () => {
    const w = mount(InlineNodeEditor, {
      props: { node: { id: 'n1', type: 'skill', config: { label: 'old' } } },
    })
    await flushPromises()
    // config 段已默认展开
    // 找到 text input (label 字段)
    const input = w.find('input[type="text"]')
    expect(input.exists()).toBe(true)
    await input.setValue('new label')
    expect(w.emitted('update:config')).toBeTruthy()
    expect((w.emitted('update:config')![0]![0] as Record<string, unknown>).label).toBe('new label')
  })

  it('emits close on cancel button click', async () => {
    const w = mount(InlineNodeEditor, {
      props: { node: { id: 'n1', type: 'skill', config: {} } },
    })
    await w.find('[data-testid="inline-cancel"]').trigger('click')
    expect(w.emitted('close')).toBeTruthy()
  })

  it('emits save on save button click', async () => {
    const w = mount(InlineNodeEditor, {
      props: { node: { id: 'n1', type: 'skill', config: { label: 'x' } } },
    })
    await w.find('[data-testid="inline-save"]').trigger('click')
    expect(w.emitted('save')).toBeTruthy()
  })
})
