import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import WsCard from '../../WsCard.vue'

describe('WsCard — regression on existing API', () => {
  it('renders title', () => {
    const wrapper = mount(WsCard, { props: { title: '工作流' }, slots: { default: 'body' } })
    expect(wrapper.text()).toContain('工作流')
  })

  it('renders subtitle alongside title', () => {
    const wrapper = mount(WsCard, { props: { title: 'A', subtitle: 'B' }, slots: { default: 'x' } })
    expect(wrapper.text()).toContain('A')
    expect(wrapper.text()).toContain('B')
  })

  it('applies hoverable class', () => {
    const wrapper = mount(WsCard, { props: { hoverable: true }, slots: { default: 'x' } })
    expect(wrapper.find('.ws-card').classes()).toContain('ws-card--hoverable')
  })

  it('applies active class', () => {
    const wrapper = mount(WsCard, { props: { active: true }, slots: { default: 'x' } })
    expect(wrapper.find('.ws-card').classes()).toContain('ws-card--active')
  })

  it('applies compact class (legacy)', () => {
    const wrapper = mount(WsCard, { props: { compact: true }, slots: { default: 'x' } })
    expect(wrapper.find('.ws-card').classes()).toContain('ws-card--compact')
  })
})

describe('WsCard — new variant and padding', () => {
  it('applies flat variant by default', () => {
    const wrapper = mount(WsCard, { slots: { default: 'x' } })
    expect(wrapper.find('.ws-card').classes()).toContain('ws-card--flat')
  })

  it('applies elevated variant', () => {
    const wrapper = mount(WsCard, { props: { variant: 'elevated' }, slots: { default: 'x' } })
    expect(wrapper.find('.ws-card').classes()).toContain('ws-card--elevated')
  })

  it('applies outlined variant', () => {
    const wrapper = mount(WsCard, { props: { variant: 'outlined' }, slots: { default: 'x' } })
    expect(wrapper.find('.ws-card').classes()).toContain('ws-card--outlined')
  })

  it('applies padding: none', () => {
    const wrapper = mount(WsCard, { props: { padding: 'none' }, slots: { default: 'x' } })
    expect(wrapper.find('.ws-card').classes()).toContain('ws-card--p-none')
  })

  it('applies padding: sm', () => {
    const wrapper = mount(WsCard, { props: { padding: 'sm' }, slots: { default: 'x' } })
    expect(wrapper.find('.ws-card').classes()).toContain('ws-card--p-sm')
  })

  it('applies padding: lg', () => {
    const wrapper = mount(WsCard, { props: { padding: 'lg' }, slots: { default: 'x' } })
    expect(wrapper.find('.ws-card').classes()).toContain('ws-card--p-lg')
  })
})
