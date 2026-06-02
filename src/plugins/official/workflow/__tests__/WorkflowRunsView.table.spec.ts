import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import WorkflowRunsView from '@/plugins/official/workflow/components/WorkflowRunsView.vue'
import type { RunSummary } from '@/plugins/official/workflow/composables/useWorkflowRuns'

const sampleRuns: RunSummary[] = [
  {
    run_id: 'r1', workflow_id: 'wf-a', workflow_version: 1, status: 'completed',
    triggered_by: 'user:ling', params: {},
    started_at: 1_700_000_000_000, finished_at: 1_700_000_005_000,
    error: null, current_node_id: null,
  },
  {
    run_id: 'r2', workflow_id: 'wf-b', workflow_version: 2, status: 'failed',
    triggered_by: 'agent:planner', params: {},
    started_at: 1_700_000_010_000, finished_at: 1_700_000_011_500,
    error: 'timeout', current_node_id: 'n3',
  },
]

describe('WorkflowRunsView — WsTable', () => {
  it('renders 7 columns: time / workflow / trigger / status / duration / node count / actions', () => {
    const w = mount(WorkflowRunsView, { props: { runs: sampleRuns } })
    const headers = w.findAll('th')
    const texts = headers.map(h => h.text())
    for (const expected of ['时间', '工作流', '触发人', '状态', '耗时', '节点数', '操作']) {
      expect(texts).toContain(expected)
    }
  })

  it('renders a row per run', () => {
    const w = mount(WorkflowRunsView, { props: { runs: sampleRuns } })
    const rows = w.findAll('tbody tr')
    expect(rows.length).toBe(2)
  })

  it('emits view on 查看 button click', async () => {
    const w = mount(WorkflowRunsView, { props: { runs: sampleRuns } })
    const btn = w.find('[data-testid="run-view"]')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    expect(w.emitted('view')).toBeTruthy()
    expect(w.emitted('view')![0]).toEqual(['r1'])
  })

  it('emits rerun on 重跑 button click', async () => {
    const w = mount(WorkflowRunsView, { props: { runs: sampleRuns } })
    const btn = w.find('[data-testid="run-rerun"]')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    expect(w.emitted('rerun')).toBeTruthy()
    expect(w.emitted('rerun')![0]).toEqual(['r1'])
  })

  it('shows empty state when no runs', () => {
    const w = mount(WorkflowRunsView, { props: { runs: [] } })
    expect(w.text()).toContain('暂无数据')
  })
})
