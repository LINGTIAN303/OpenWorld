import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import WsStatusDot from '../../WsStatusDot.vue'

describe('WsStatusDot', () => {
  it('renders a dot with the status class', () => {
    const wrapper = mount(WsStatusDot, { props: { status: 'running' } })
    const dot = wrapper.find('.ws-status-dot')
    expect(dot.exists()).toBe(true)
    expect(dot.classes()).toContain('ws-status-dot--running')
  })

  it('shows pulse for running by default', () => {
    const wrapper = mount(WsStatusDot, { props: { status: 'running' } })
    expect(wrapper.find('.ws-status-dot').classes()).toContain('ws-status-dot--pulse')
  })

  it('does not pulse for completed by default', () => {
    const wrapper = mount(WsStatusDot, { props: { status: 'completed' } })
    expect(wrapper.find('.ws-status-dot').classes()).not.toContain('ws-status-dot--pulse')
  })

  it('respects explicit pulse prop', () => {
    const wrapper = mount(WsStatusDot, { props: { status: 'completed', pulse: true } })
    expect(wrapper.find('.ws-status-dot').classes()).toContain('ws-status-dot--pulse')
  })

  it('renders label when showLabel is true', () => {
    const wrapper = mount(WsStatusDot, {
      props: { status: 'failed', showLabel: true },
    })
    expect(wrapper.text()).toContain('失败')
  })

  it('respects custom label override', () => {
    const wrapper = mount(WsStatusDot, {
      props: { status: 'failed', showLabel: true, label: 'OOM' },
    })
    expect(wrapper.text()).toBe('OOM')
  })

  it('applies size class', () => {
    const wrapper = mount(WsStatusDot, { props: { status: 'idle', size: 'md' } })
    expect(wrapper.find('.ws-status-dot').classes()).toContain('ws-status-dot--md')
  })
})
