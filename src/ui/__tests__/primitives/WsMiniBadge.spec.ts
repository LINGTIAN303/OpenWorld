import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import WsMiniBadge from '../../WsMiniBadge.vue'

describe('WsMiniBadge', () => {
  it('renders with default neutral variant', () => {
    const wrapper = mount(WsMiniBadge, { slots: { default: '数据处理' } })
    const badge = wrapper.find('.ws-mini-badge')
    expect(badge.exists()).toBe(true)
    expect(badge.classes()).toContain('ws-mini-badge--neutral')
    expect(badge.text()).toBe('数据处理')
  })

  it('applies variant class', () => {
    const wrapper = mount(WsMiniBadge, {
      props: { variant: 'success' },
      slots: { default: '运行中' },
    })
    expect(wrapper.find('.ws-mini-badge').classes()).toContain('ws-mini-badge--success')
  })

  it('applies size class', () => {
    const wrapper = mount(WsMiniBadge, {
      props: { size: 'md' },
      slots: { default: 'x' },
    })
    expect(wrapper.find('.ws-mini-badge').classes()).toContain('ws-mini-badge--md')
  })

  it('rounds with pill by default', () => {
    const wrapper = mount(WsMiniBadge, { slots: { default: 'x' } })
    expect(wrapper.find('.ws-mini-badge').classes()).toContain('ws-mini-badge--pill')
  })

  it('respects pill: false', () => {
    const wrapper = mount(WsMiniBadge, { props: { pill: false }, slots: { default: 'x' } })
    expect(wrapper.find('.ws-mini-badge').classes()).not.toContain('ws-mini-badge--pill')
  })

  it('renders icon prefix when provided', () => {
    const wrapper = mount(WsMiniBadge, {
      props: { icon: '🌅' },
      slots: { default: '晨间' },
    })
    expect(wrapper.find('.ws-mini-badge__icon').text()).toBe('🌅')
  })
})
