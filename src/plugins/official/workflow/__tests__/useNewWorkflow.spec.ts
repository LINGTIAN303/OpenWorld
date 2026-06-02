import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useNewWorkflow } from '../composables/useNewWorkflow'

describe('useNewWorkflow', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('creates a blank workflow definition', async () => {
    const mod = await import('../composables/useNewWorkflow')
    const { createBlank } = mod.useNewWorkflow()
    const def = mod.useNewWorkflow().createBlank('my-blank')
    expect(def.id).toBeTruthy()
    expect(def.name).toBe('my-blank')
    expect(def.nodes.length).toBe(2)
    expect(def.nodes[0]!.type).toBe('start')
    expect(def.nodes[1]!.type).toBe('end')
    expect(def.edges.length).toBe(1)
  })

  it('creates from template id', async () => {
    const { createFromTemplate } = useNewWorkflow()
    const def = createFromTemplate('tpl-onboarding', { name: '入职流程' })
    expect(def.templateId).toBe('tpl-onboarding')
    expect(def.name).toBe('入职流程')
    expect(def.id).toBeTruthy()
  })

  it('imports from JSON definition', async () => {
    const { importFromJson } = useNewWorkflow()
    const json = JSON.stringify({ id: 'x', name: 'i', nodes: [], edges: [] })
    const def = importFromJson(json)
    expect(def.id).toBe('x')
    expect(def.name).toBe('i')
  })

  it('throws on invalid JSON', () => {
    const { importFromJson } = useNewWorkflow()
    expect(() => importFromJson('{ broken')).toThrow()
  })

  it('emits worldsmith:workflow-list on commit', async () => {
    const handler = vi.fn()
    window.addEventListener('worldsmith:workflow-list', handler)
    const { createBlank, commit } = useNewWorkflow()
    const def = createBlank('a')
    commit(def)
    expect(handler).toHaveBeenCalledTimes(1)
    const event = handler.mock.calls[0]![0] as CustomEvent
    expect(event.detail).toMatchObject({ action: 'create' })
    expect(event.detail.definition.id).toBe(def.id)
    window.removeEventListener('worldsmith:workflow-list', handler)
  })

  it('showDropdown is reactive and toggles', () => {
    const { showDropdown, open, close } = useNewWorkflow()
    expect(showDropdown.value).toBe(false)
    open()
    expect(showDropdown.value).toBe(true)
    close()
    expect(showDropdown.value).toBe(false)
  })

  it('commit closes the dropdown', () => {
    const { showDropdown, createBlank, commit } = useNewWorkflow()
    showDropdown.value = true
    const def = createBlank('a')
    commit(def)
    expect(showDropdown.value).toBe(false)
  })
})
