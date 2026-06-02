import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import NewWorkflowDropdown from '../../components/NewWorkflowDropdown.vue'
import { useNewWorkflow } from '../../composables/useNewWorkflow'

describe('NewWorkflowDropdown', () => {
  beforeEach(() => {
    // 不使用 vi.resetModules():它会让组件 re-import 拿到新 useNewWorkflow 实例,
    // 而下面 close() 操作的是测试文件 import 的旧实例,改不到组件。
    // 改为显式重置共享状态:
    useNewWorkflow().close()
  })

  it('renders a primary action button', () => {
    const w = mount(NewWorkflowDropdown)
    expect(w.find('[data-testid="new-wf-trigger"]').exists()).toBe(true)
  })

  it('does not show menu initially', () => {
    const w = mount(NewWorkflowDropdown)
    expect(w.find('[data-testid="new-wf-menu"]').exists()).toBe(false)
  })

  it('opens dropdown on trigger click', async () => {
    const w = mount(NewWorkflowDropdown)
    await w.find('[data-testid="new-wf-trigger"]').trigger('click')
    expect(w.find('[data-testid="new-wf-menu"]').exists()).toBe(true)
  })

  it('shows 3 options: blank / template / import', async () => {
    const w = mount(NewWorkflowDropdown)
    await w.find('[data-testid="new-wf-trigger"]').trigger('click')
    expect(w.text()).toContain('从空白开始')
    expect(w.text()).toContain('从模板创建')
    expect(w.text()).toContain('导入 JSON')
  })

  it('emits create-blank with name on blank option click', async () => {
    const w = mount(NewWorkflowDropdown)
    await w.find('[data-testid="new-wf-trigger"]').trigger('click')
    await w.find('[data-testid="new-wf-blank"]').trigger('click')
    expect(w.emitted('create-blank')).toBeTruthy()
    expect(w.emitted('create-blank')![0]).toEqual([expect.any(String)])
  })

  it('emits create-template with templateId on template option click', async () => {
    const w = mount(NewWorkflowDropdown)
    await w.find('[data-testid="new-wf-trigger"]').trigger('click')
    await w.find('[data-testid="new-wf-template"]').trigger('click')
    expect(w.emitted('create-template')).toBeTruthy()
    const detail = w.emitted('create-template')![0]![0] as { templateId: string; name: string }
    expect(detail.templateId).toBeTruthy()
  })

  it('emits import on import option click', async () => {
    const w = mount(NewWorkflowDropdown)
    await w.find('[data-testid="new-wf-trigger"]').trigger('click')
    await w.find('[data-testid="new-wf-import"]').trigger('click')
    expect(w.emitted('import')).toBeTruthy()
  })

  it('closes menu after option click', async () => {
    const w = mount(NewWorkflowDropdown, { attachTo: document.body })
    await w.find('[data-testid="new-wf-trigger"]').trigger('click')
    expect(w.find('[data-testid="new-wf-menu"]').exists()).toBe(true)
    await w.find('[data-testid="new-wf-blank"]').trigger('click')
    await nextTick()
    expect(w.find('[data-testid="new-wf-menu"]').exists()).toBe(false)
    w.unmount()
  })

  it('closes on outside click', async () => {
    const w = mount(NewWorkflowDropdown, { attachTo: document.body })
    await w.find('[data-testid="new-wf-trigger"]').trigger('click')
    expect(w.find('[data-testid="new-wf-menu"]').exists()).toBe(true)
    document.body.click()
    await nextTick()
    expect(w.find('[data-testid="new-wf-menu"]').exists()).toBe(false)
    w.unmount()
  })
})
