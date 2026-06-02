import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { useNewWorkflow } from '../composables/useNewWorkflow'
import { useWorkflow } from '../composables/useWorkflow'
import WorkflowView from '../WorkflowView.vue'

const StubList = defineComponent({
  name: 'WorkflowList',
  props: ['workflows'],
  setup(props) {
    return () =>
      h(
        'div',
        { 'data-testid': 'workflow-list-stub' },
        `list(${props.workflows?.length ?? 0})`,
      )
  },
})
const StubEditor = defineComponent({
  name: 'WorkflowEditorView',
  props: ['workflowId'],
  setup(props) {
    return () =>
      h(
        'div',
        { 'data-testid': 'workflow-editor-stub' },
        `editor(${props.workflowId ?? ''})`,
      )
  },
})
const StubProgress = defineComponent({
  name: 'WorkflowProgress',
  props: ['runs', 'activeRun'],
  setup() {
    return () => h('div', { 'data-testid': 'workflow-progress-stub' }, 'progress')
  },
})

function mountView() {
  return mount(WorkflowView, {
    global: {
      stubs: {
        WorkflowList: StubList,
        WorkflowEditorView: StubEditor,
        WorkflowProgress: StubProgress,
      },
    },
  })
}

describe('WorkflowView — toolbar / manual create', () => {
  beforeEach(() => {
    useNewWorkflow().close()
  })

  it('renders NewWorkflowDropdown in toolbar', () => {
    const w = mountView()
    expect(w.findComponent({ name: 'NewWorkflowDropdown' }).exists()).toBe(true)
  })

  it('create-blank triggers commit and adds to workflowList', async () => {
    const w = mountView()
    const dropdown = w.findComponent({ name: 'NewWorkflowDropdown' })
    expect(dropdown.exists()).toBe(true)
    const { workflowList } = useWorkflow()
    const before = workflowList.length
    await dropdown.vm.$emit('create-blank', 'test-blank-name')
    await flushPromises()
    expect(workflowList.length).toBe(before + 1)
    const newWf = workflowList.find((wf) => wf.name === 'test-blank-name')
    expect(newWf).toBeTruthy()
  })

  it('create-template triggers commit and adds to workflowList', async () => {
    const w = mountView()
    const dropdown = w.findComponent({ name: 'NewWorkflowDropdown' })
    const { workflowList } = useWorkflow()
    const before = workflowList.length
    await dropdown.vm.$emit('create-template', { templateId: 'tpl-x', name: '模板流程' })
    await flushPromises()
    expect(workflowList.length).toBe(before + 1)
    const newWf = workflowList.find((wf) => wf.name === '模板流程')
    expect(newWf).toBeTruthy()
  })

  it('import event does not add to list (placeholder)', async () => {
    const w = mountView()
    const dropdown = w.findComponent({ name: 'NewWorkflowDropdown' })
    const { workflowList } = useWorkflow()
    const before = workflowList.length
    await dropdown.vm.$emit('import')
    await flushPromises()
    expect(workflowList.length).toBe(before)
  })
})
