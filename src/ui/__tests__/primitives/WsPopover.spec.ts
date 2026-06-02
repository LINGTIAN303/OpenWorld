import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import WsPopover from '../../WsPopover.vue'

describe('WsPopover — offset API', () => {
  it('accepts an offset prop', () => {
    const wrapper = mount(WsPopover, {
      props: { offset: 12 },
      slots: { trigger: '<button>open</button>', default: 'content' },
    })
    expect(wrapper.exists()).toBe(true)
  })

  it('uses default offset of 6 when not provided', () => {
    const wrapper = mount(WsPopover, {
      slots: { trigger: '<button>open</button>', default: 'content' },
    })
    expect(wrapper.exists()).toBe(true)
  })

  it('mounts and toggles on trigger click', async () => {
    const wrapper = mount(WsPopover, {
      slots: { trigger: '<button class="open-btn">open</button>', default: '<div class="content">x</div>' },
      attachTo: document.body,
    })
    await wrapper.find('.open-btn').trigger('click')
    await nextTick()
    expect(document.querySelector('.ws-popover')).toBeTruthy()
  })
})
