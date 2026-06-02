import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EditorPreferencesSection from '@/plugins/official/workflow/components/editor/EditorPreferencesSection.vue'

describe('EditorPreferencesSection', () => {
  it('renders title', () => {
    const w = mount(EditorPreferencesSection, {
      props: { title: '添加方式' },
      slots: { default: '<span>chips here</span>' },
    })
    expect(w.text()).toContain('添加方式')
  })

  it('renders description when provided', () => {
    const w = mount(EditorPreferencesSection, {
      props: { title: '编辑方式', description: '选择节点的编辑交互' },
    })
    expect(w.text()).toContain('编辑方式')
    expect(w.text()).toContain('选择节点的编辑交互')
  })

  it('renders default slot content', () => {
    const w = mount(EditorPreferencesSection, {
      props: { title: 'X' },
      slots: { default: '<p class="slot-marker">slot content</p>' },
    })
    expect(w.find('.slot-marker').exists()).toBe(true)
  })

  it('omits description paragraph when not provided', () => {
    const w = mount(EditorPreferencesSection, { props: { title: 'X' } })
    expect(w.find('.pref-section-desc').exists()).toBe(false)
  })
})
