import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import WsButton from '../../WsButton.vue'

describe('WsButton — regression on existing types', () => {
  it('applies primary class by default', () => {
    const wrapper = mount(WsButton, { slots: { default: '保存' } })
    expect(wrapper.find('.ws-button').classes()).toContain('ws-button--primary')
  })

  it('applies secondary class', () => {
    const wrapper = mount(WsButton, { props: { type: 'secondary' }, slots: { default: 'x' } })
    expect(wrapper.find('.ws-button').classes()).toContain('ws-button--secondary')
  })

  it('applies ghost class', () => {
    const wrapper = mount(WsButton, { props: { type: 'ghost' }, slots: { default: 'x' } })
    expect(wrapper.find('.ws-button').classes()).toContain('ws-button--ghost')
  })

  it('applies danger class', () => {
    const wrapper = mount(WsButton, { props: { type: 'danger' }, slots: { default: 'x' } })
    expect(wrapper.find('.ws-button').classes()).toContain('ws-button--danger')
  })

  it('applies text class', () => {
    const wrapper = mount(WsButton, { props: { type: 'text' }, slots: { default: 'x' } })
    expect(wrapper.find('.ws-button').classes()).toContain('ws-button--text')
  })
})

describe('WsButton — new types and props', () => {
  it('applies primary-gradient class', () => {
    const wrapper = mount(WsButton, { props: { type: 'primary-gradient' }, slots: { default: '运行' } })
    expect(wrapper.find('.ws-button').classes()).toContain('ws-button--primary-gradient')
  })

  it('applies accent class', () => {
    const wrapper = mount(WsButton, { props: { type: 'accent' }, slots: { default: '新建' } })
    expect(wrapper.find('.ws-button').classes()).toContain('ws-button--accent')
  })

  it('applies icon-only class when iconOnly is true', () => {
    const wrapper = mount(WsButton, {
      props: { iconOnly: true },
      slots: { icon: '⚙' },
    })
    expect(wrapper.find('.ws-button').classes()).toContain('ws-button--icon-only')
  })

  it('does not apply icon-only class by default', () => {
    const wrapper = mount(WsButton, { slots: { default: '保存' } })
    expect(wrapper.find('.ws-button').classes()).not.toContain('ws-button--icon-only')
  })

  it('hides content visually when iconOnly is true', () => {
    const wrapper = mount(WsButton, {
      props: { iconOnly: true },
      slots: { default: '保存', icon: '⚙' },
    })
    const content = wrapper.find('.ws-button__content')
    expect(content.exists()).toBe(true)
    expect(content.classes()).toContain('ws-button__content--sr-only')
  })
})
