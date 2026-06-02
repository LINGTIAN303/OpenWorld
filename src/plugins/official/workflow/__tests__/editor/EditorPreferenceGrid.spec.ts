import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EditorPreferenceGrid from '@/plugins/official/workflow/components/editor/EditorPreferenceGrid.vue'

describe('EditorPreferenceGrid', () => {
  it('renders 3 columns: sidebar / inline / hover', () => {
    const w = mount(EditorPreferenceGrid, { props: { value: 'sidebar' } })
    expect(w.findAll('[data-testid^="grid-"]').length).toBe(3)
  })

  it('marks active column with .active class', () => {
    const w = mount(EditorPreferenceGrid, { props: { value: 'inline' } })
    expect(w.find('[data-testid="grid-inline"]').classes()).toContain('active')
    expect(w.find('[data-testid="grid-sidebar"]').classes()).not.toContain('active')
  })

  it('emits change with method on column click', async () => {
    const w = mount(EditorPreferenceGrid, { props: { value: 'sidebar' } })
    await w.find('[data-testid="grid-hover"]').trigger('click')
    expect(w.emitted('change')).toBeTruthy()
    expect(w.emitted('change')![0]).toEqual(['hover'])
  })

  it('each cell shows label + description', () => {
    const w = mount(EditorPreferenceGrid, { props: { value: 'sidebar' } })
    expect(w.find('[data-testid="grid-sidebar"]').text()).toContain('侧边栏')
    expect(w.find('[data-testid="grid-inline"]').text()).toContain('内联')
    expect(w.find('[data-testid="grid-hover"]').text()).toContain('悬浮')
  })
})
