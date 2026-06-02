import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import WsSegmentedControl from '../../WsSegmentedControl.vue'

const options = [
  { value: 'sidebar', label: '侧边栏' },
  { value: 'inline', label: '内联' },
  { value: 'hover', label: '悬浮' },
]

describe('WsSegmentedControl', () => {
  it('renders all options', () => {
    const wrapper = mount(WsSegmentedControl, {
      props: { modelValue: 'sidebar', options },
    })
    const opts = wrapper.findAll('.ws-segmented__option')
    expect(opts).toHaveLength(3)
    expect(opts[0].text()).toBe('侧边栏')
    expect(opts[1].text()).toBe('内联')
    expect(opts[2].text()).toBe('悬浮')
  })

  it('marks the active option', () => {
    const wrapper = mount(WsSegmentedControl, {
      props: { modelValue: 'inline', options },
    })
    const opts = wrapper.findAll('.ws-segmented__option')
    expect(opts[0].classes()).not.toContain('ws-segmented__option--active')
    expect(opts[1].classes()).toContain('ws-segmented__option--active')
    expect(opts[2].classes()).not.toContain('ws-segmented__option--active')
  })

  it('emits update:modelValue on click', async () => {
    const wrapper = mount(WsSegmentedControl, {
      props: { modelValue: 'sidebar', options },
    })
    await wrapper.findAll('.ws-segmented__option')[2].trigger('click')
    const updates = wrapper.emitted('update:modelValue')
    expect(updates).toBeTruthy()
    expect(updates![0]).toEqual(['hover'])
  })

  it('does not emit when clicking already-active option', async () => {
    const wrapper = mount(WsSegmentedControl, {
      props: { modelValue: 'sidebar', options },
    })
    await wrapper.findAll('.ws-segmented__option')[0].trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeFalsy()
  })

  it('sets aria-selected correctly', () => {
    const wrapper = mount(WsSegmentedControl, {
      props: { modelValue: 'hover', options },
    })
    const opts = wrapper.findAll('.ws-segmented__option')
    expect(opts[0].attributes('aria-selected')).toBe('false')
    expect(opts[2].attributes('aria-selected')).toBe('true')
  })

  it('applies size class', () => {
    const wrapper = mount(WsSegmentedControl, {
      props: { modelValue: 'sidebar', options, size: 'md' },
    })
    expect(wrapper.find('.ws-segmented').classes()).toContain('ws-segmented--md')
  })

  it('renders icons when provided', () => {
    const optsWithIcons = [
      { value: 'a', label: 'A', icon: '🅰' },
      { value: 'b', label: 'B', icon: '🅱' },
    ]
    const wrapper = mount(WsSegmentedControl, {
      props: { modelValue: 'a', options: optsWithIcons },
    })
    const icons = wrapper.findAll('.ws-segmented__icon')
    expect(icons).toHaveLength(2)
    expect(icons[0].text()).toBe('🅰')
  })
})
