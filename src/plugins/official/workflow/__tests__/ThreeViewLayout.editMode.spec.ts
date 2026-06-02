import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ThreeViewLayout from '@/plugins/official/workflow/components/ThreeViewLayout.vue'
import type { EditorDefinition } from '@/plugins/official/workflow/composables/editor-types'

const sampleDef: EditorDefinition = {
  id: 'wf1', name: 'test', version: 1, description: null, category: 'test',
  nodes: [], edges: [], schemaVersion: 1,
}

describe('ThreeViewLayout — edit method switching', () => {
  it('sidebar mode shows inspector slot, hides inline/hover', () => {
    const w = mount(ThreeViewLayout, {
      props: { editMethod: 'sidebar', definition: sampleDef, selectedNodeId: null, yamlText: '' },
      slots: { palette: '<div class="p">p</div>', canvas: '<div class="c">c</div>', inspector: '<div class="i">i</div>' },
    })
    expect(w.find('.layout__inspector').exists()).toBe(true)
    expect(w.find('.layout__inline-editor').exists()).toBe(false)
    expect(w.find('.layout__hover-layer').exists()).toBe(false)
  })

  it('inline mode shows inline-editor slot, hides inspector/hover', () => {
    const w = mount(ThreeViewLayout, {
      props: { editMethod: 'inline', definition: sampleDef, selectedNodeId: null, yamlText: '' },
      slots: { palette: '<div>p</div>', canvas: '<div>c</div>', inline: '<div class="ie">ie</div>' },
    })
    expect(w.find('.layout__inspector').exists()).toBe(false)
    expect(w.find('.layout__inline-editor').exists()).toBe(true)
    expect(w.find('.layout__hover-layer').exists()).toBe(false)
  })

  it('hover mode shows hover-layer slot, hides inspector/inline', () => {
    const w = mount(ThreeViewLayout, {
      props: { editMethod: 'hover', definition: sampleDef, selectedNodeId: null, yamlText: '' },
      slots: { palette: '<div>p</div>', canvas: '<div>c</div>', hover: '<div class="hl">hl</div>' },
    })
    expect(w.find('.layout__inspector').exists()).toBe(false)
    expect(w.find('.layout__inline-editor').exists()).toBe(false)
    expect(w.find('.layout__hover-layer').exists()).toBe(true)
  })

  it('palette and canvas slots are always rendered', () => {
    const w = mount(ThreeViewLayout, {
      props: { editMethod: 'sidebar', definition: sampleDef, selectedNodeId: null, yamlText: '' },
      slots: { palette: '<div class="p">p</div>', canvas: '<div class="c">c</div>', inspector: '<div>i</div>' },
    })
    expect(w.find('.layout__palette').exists()).toBe(true)
    expect(w.find('.layout__canvas').exists()).toBe(true)
  })
})
