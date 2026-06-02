import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { useNewWorkflow } from '../composables/useNewWorkflow'
import { useWorkflow } from '../composables/useWorkflow'
import WorkflowView from '../WorkflowView.vue'

// 用更完整的 stub 捕获 workflows 列表
const StubList = defineComponent({
  name: 'WorkflowList',
  props: ['workflows'],
  emits: ['edit', 'launch', 'delete'],
  setup(props, { emit }) {
    return () =>
      h(
        'div',
        { 'data-testid': 'workflow-list-stub' },
        props.workflows.map((wf: { id: string; name: string }) =>
          h(
            'div',
            {
              key: wf.id,
              'data-testid': `card-${wf.id}`,
              'data-name': wf.name,
              onClick: () => emit('edit', wf.id),
            },
            wf.name,
          ),
        ),
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
  emits: ['pause', 'resume', 'cancel'],
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

describe('Manual create integration', () => {
  beforeEach(() => {
    useNewWorkflow().close()
  })

  it('click 新建 → 从空白开始 → workflow appears in list + editor opens', async () => {
    const w = mountView()
    const dropdown = w.findComponent({ name: 'NewWorkflowDropdown' })
    expect(dropdown.exists()).toBe(true)

    // 模拟 dropdown 的 create-blank emit
    await dropdown.vm.$emit('create-blank', '集成测试新流程')
    await flushPromises()

    // 1. workflowList 增长
    const { workflowList } = useWorkflow()
    const newWf = workflowList.find((wf) => wf.name === '集成测试新流程')
    expect(newWf).toBeTruthy()
    if (!newWf) return

    // 2. editor tab 打开,展示新 workflow id
    const editor = w.find('[data-testid="workflow-editor-stub"]')
    expect(editor.exists()).toBe(true)
    expect(editor.text()).toContain(newWf.id)
  })

  it('click 新建 → 从模板创建 → workflow appears + switches to editor', async () => {
    const w = mountView()
    const dropdown = w.findComponent({ name: 'NewWorkflowDropdown' })
    await dropdown.vm.$emit('create-template', { templateId: 'tpl-1', name: '模板创建' })
    await flushPromises()

    const { workflowList } = useWorkflow()
    const newWf = workflowList.find((wf) => wf.name === '模板创建')
    expect(newWf).toBeTruthy()

    const editor = w.find('[data-testid="workflow-editor-stub"]')
    expect(editor.exists()).toBe(true)
  })

  it('切回 list tab 看到新建的卡片', async () => {
    const w = mountView()
    const dropdown = w.findComponent({ name: 'NewWorkflowDropdown' })
    await dropdown.vm.$emit('create-blank', '可看见的卡片')
    await flushPromises()

    const newWf = useWorkflow().workflowList.find((wf) => wf.name === '可看见的卡片')
    expect(newWf).toBeTruthy()
    if (!newWf) return

    // WorkflowView 切到 editor 后,WorkflowList 不在 DOM。切回 list
    // 找 editor tab 按钮:它就是 tabs 数组里 id='editor' 的按钮
    const editorTab = w.findAll('.tab-btn').find((b) => b.text().includes('编辑器'))
    expect(editorTab).toBeTruthy()
    const listTab = w.findAll('.tab-btn').find((b) => b.text().includes('工作流'))
    expect(listTab).toBeTruthy()
    await listTab!.trigger('click')
    await nextTick()

    const card = w.find(`[data-testid="card-${newWf.id}"]`)
    expect(card.exists()).toBe(true)
    expect(card.text()).toContain('可看见的卡片')
  })

  it('multiple creates accumulate in list', async () => {
    const w = mountView()
    const dropdown = w.findComponent({ name: 'NewWorkflowDropdown' })
    const { workflowList } = useWorkflow()
    const startCount = workflowList.length
    await dropdown.vm.$emit('create-blank', 'a')
    await flushPromises()
    await dropdown.vm.$emit('create-template', { templateId: 'tpl', name: 'b' })
    await flushPromises()
    expect(workflowList.length).toBe(startCount + 2)
    expect(workflowList.some((wf) => wf.name === 'a')).toBe(true)
    expect(workflowList.some((wf) => wf.name === 'b')).toBe(true)
  })
})
