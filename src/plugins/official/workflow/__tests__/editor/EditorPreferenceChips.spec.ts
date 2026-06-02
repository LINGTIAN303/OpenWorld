import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EditorPreferenceChips from '@/plugins/official/workflow/components/editor/EditorPreferenceChips.vue'

describe('EditorPreferenceChips', () => {
  it('renders 3 chips for add methods', () => {
    const w = mount(EditorPreferenceChips, { props: { value: ['click'] } })
    expect(w.findAll('[data-testid^="chip-"]').length).toBe(3)
  })

  it('marks active chips based on value array', () => {
    const w = mount(EditorPreferenceChips, { props: { value: ['click', 'drag'] } })
    expect(w.find('[data-testid="chip-click"]').classes()).toContain('active')
    expect(w.find('[data-testid="chip-drag"]').classes()).toContain('active')
    expect(w.find('[data-testid="chip-contextmenu"]').classes()).not.toContain('active')
  })

  it('emits toggle with method on chip click', async () => {
    const w = mount(EditorPreferenceChips, { props: { value: ['click'] } })
    await w.find('[data-testid="chip-drag"]').trigger('click')
    expect(w.emitted('toggle')).toBeTruthy()
    expect(w.emitted('toggle')![0]).toEqual(['drag'])
  })

  it('aria-pressed reflects active state', () => {
    const w = mount(EditorPreferenceChips, { props: { value: ['drag'] } })
    expect(w.find('[data-testid="chip-drag"]').attributes('aria-pressed')).toBe('true')
    expect(w.find('[data-testid="chip-click"]').attributes('aria-pressed')).toBe('false')
  })
})
