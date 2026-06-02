import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import EditorPreferencesCard from '@/plugins/official/workflow/components/editor/EditorPreferencesCard.vue'
import { useEditorPreferences } from '@/plugins/official/workflow/composables/useEditorPreferences'

describe('EditorPreferencesCard', () => {
  beforeEach(() => {
    localStorage.clear()
    useEditorPreferences().reset()
  })

  it('renders 3 sections: add methods / edit method / hover delay', () => {
    const w = mount(EditorPreferencesCard)
    expect(w.findAll('.pref-section').length).toBe(3)
    expect(w.text()).toContain('添加方式')
    expect(w.text()).toContain('编辑方式')
    expect(w.text()).toContain('悬停延迟')
  })

  it('reflects current editMethod from preferences (active class)', () => {
    const prefs = useEditorPreferences()
    prefs.setEditMethod('inline')
    const w = mount(EditorPreferencesCard)
    expect(w.find('[data-testid="grid-inline"]').classes()).toContain('active')
  })

  it('hover delay slider is disabled when editMethod is not hover', () => {
    const prefs = useEditorPreferences()
    prefs.setEditMethod('sidebar')
    const w = mount(EditorPreferencesCard)
    const slider = w.find('[data-testid="hover-delay"]')
    expect(slider.attributes('disabled')).toBeDefined()
  })

  it('hover delay slider is enabled when editMethod is hover', () => {
    const prefs = useEditorPreferences()
    prefs.setEditMethod('hover')
    const w = mount(EditorPreferencesCard)
    const slider = w.find('[data-testid="hover-delay"]')
    expect(slider.attributes('disabled')).toBeUndefined()
  })

  it('emits save on save button click', async () => {
    const w = mount(EditorPreferencesCard)
    await w.find('[data-testid="pref-save"]').trigger('click')
    expect(w.emitted('save')).toBeTruthy()
  })

  it('toggling add method via chip updates preferences', async () => {
    const w = mount(EditorPreferencesCard)
    // 默认 addMethods = ['click', 'drag'],contextmenu 缺
    const before = useEditorPreferences().isAddMethodEnabled('contextmenu')
    expect(before).toBe(false)
    await w.find('[data-testid="chip-contextmenu"]').trigger('click')
    const after = useEditorPreferences().isAddMethodEnabled('contextmenu')
    expect(after).toBe(true)
  })
})
