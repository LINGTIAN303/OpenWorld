import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import WsNodeChip from '../../WsNodeChip.vue'

describe('WsNodeChip', () => {
  it('renders label for known type', () => {
    const wrapper = mount(WsNodeChip, { props: { type: 'start' } })
    expect(wrapper.text()).toContain('开始')
  })

  it('applies group class for trigger', () => {
    const wrapper = mount(WsNodeChip, { props: { type: 'start' } })
    expect(wrapper.find('.ws-node-chip').classes()).toContain('ws-node-chip--trigger')
  })

  it('applies group class for end', () => {
    const wrapper = mount(WsNodeChip, { props: { type: 'end' } })
    expect(wrapper.find('.ws-node-chip').classes()).toContain('ws-node-chip--end')
  })

  it('applies group class for ai (agent_decision)', () => {
    const wrapper = mount(WsNodeChip, { props: { type: 'agent_decision' } })
    expect(wrapper.find('.ws-node-chip').classes()).toContain('ws-node-chip--ai')
  })

  it('applies group class for execute (skill)', () => {
    const wrapper = mount(WsNodeChip, { props: { type: 'skill' } })
    expect(wrapper.find('.ws-node-chip').classes()).toContain('ws-node-chip--execute')
  })

  it('applies group class for control (condition)', () => {
    const wrapper = mount(WsNodeChip, { props: { type: 'condition' } })
    expect(wrapper.find('.ws-node-chip').classes()).toContain('ws-node-chip--control')
  })

  it('applies group class for data (code)', () => {
    const wrapper = mount(WsNodeChip, { props: { type: 'code' } })
    expect(wrapper.find('.ws-node-chip').classes()).toContain('ws-node-chip--data')
  })

  it('renders icon glyph from metadata', () => {
    const wrapper = mount(WsNodeChip, { props: { type: 'start', showIcon: true } })
    expect(wrapper.find('.ws-node-chip__icon').exists()).toBe(true)
  })

  it('hides icon when showIcon is false', () => {
    const wrapper = mount(WsNodeChip, { props: { type: 'start', showIcon: false } })
    expect(wrapper.find('.ws-node-chip__icon').exists()).toBe(false)
  })

  it('respects custom label', () => {
    const wrapper = mount(WsNodeChip, { props: { type: 'start', label: '晨间开始' } })
    expect(wrapper.text()).toContain('晨间开始')
  })

  it('applies selected class', () => {
    const wrapper = mount(WsNodeChip, { props: { type: 'start', selected: true } })
    expect(wrapper.find('.ws-node-chip').classes()).toContain('ws-node-chip--selected')
  })

  it('applies disabled class', () => {
    const wrapper = mount(WsNodeChip, { props: { type: 'start', disabled: true } })
    expect(wrapper.find('.ws-node-chip').classes()).toContain('ws-node-chip--disabled')
  })

  it('applies size class', () => {
    const wrapper = mount(WsNodeChip, { props: { type: 'start', size: 'md' } })
    expect(wrapper.find('.ws-node-chip').classes()).toContain('ws-node-chip--md')
  })

  it('falls back gracefully for unknown type', () => {
    const wrapper = mount(WsNodeChip, { props: { type: 'unknown-type' as never } })
    expect(wrapper.find('.ws-node-chip').exists()).toBe(true)
    expect(wrapper.find('.ws-node-chip').classes()).toContain('ws-node-chip--neutral')
  })
})
