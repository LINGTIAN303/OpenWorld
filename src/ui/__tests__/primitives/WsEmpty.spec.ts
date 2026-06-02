import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import WsEmpty from '../../WsEmpty.vue'

describe('WsEmpty — regression on existing presets', () => {
  it('renders no-data preset default title', () => {
    const wrapper = mount(WsEmpty, { props: { preset: 'no-data' } })
    expect(wrapper.text()).toContain('暂无数据')
  })

  it('renders no-result preset description', () => {
    const wrapper = mount(WsEmpty, { props: { preset: 'no-result' } })
    expect(wrapper.text()).toContain('未找到匹配项')
  })

  it('renders no-connection preset', () => {
    const wrapper = mount(WsEmpty, { props: { preset: 'no-connection' } })
    expect(wrapper.text()).toContain('连接已断开')
  })

  it('overrides title via prop', () => {
    const wrapper = mount(WsEmpty, { props: { preset: 'no-data', title: '自定义' } })
    expect(wrapper.text()).toContain('自定义')
    expect(wrapper.text()).not.toContain('暂无数据')
  })
})

describe('WsEmpty — new presets', () => {
  it('renders no-workflow preset', () => {
    const wrapper = mount(WsEmpty, { props: { preset: 'no-workflow' } })
    expect(wrapper.text()).toContain('工作流')
  })

  it('renders workflow-search-empty preset', () => {
    const wrapper = mount(WsEmpty, { props: { preset: 'workflow-search-empty' } })
    expect(wrapper.text()).toContain('搜索')
  })
})

describe('WsEmpty — illustration and extra slots', () => {
  it('renders illustration slot when provided', () => {
    const wrapper = mount(WsEmpty, {
      props: { preset: 'no-data' },
      slots: { illustration: '<div class="my-illustration">插画</div>' },
    })
    expect(wrapper.find('.my-illustration').exists()).toBe(true)
  })

  it('renders extra slot when provided', () => {
    const wrapper = mount(WsEmpty, {
      props: { preset: 'no-data' },
      slots: { extra: '<div class="my-extra">辅助链接</div>' },
    })
    expect(wrapper.find('.my-extra').exists()).toBe(true)
  })

  it('renders action slot independently', () => {
    const wrapper = mount(WsEmpty, {
      props: { preset: 'no-data' },
      slots: { action: '<button class="my-btn">立即创建</button>' },
    })
    expect(wrapper.find('.my-btn').exists()).toBe(true)
  })
})
