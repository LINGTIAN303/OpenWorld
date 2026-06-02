import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkflow } from '../composables/useWorkflow'

describe('useWorkflow — workflow-list events', () => {
  beforeEach(() => {
    // 触发清理事件,让 useWorkflow 重新拉取(但测试中我们改用本地更新)
    window.dispatchEvent(new CustomEvent('worldsmith:test-cleanup'))
  })

  it('adds workflow to list on action:create', () => {
    const { workflowList, addWorkflow } = useWorkflow()
    const before = workflowList.length
    addWorkflow({
      id: 'new-wf-1',
      latestVersion: 1,
      name: '新流程',
      category: 'custom',
      description: null,
      updatedAt: Date.now(),
    })
    expect(workflowList.length).toBe(before + 1)
    expect(workflowList[workflowList.length - 1]!.id).toBe('new-wf-1')
  })

  it('updates existing workflow on action:create with same id', () => {
    const { workflowList, addWorkflow } = useWorkflow()
    addWorkflow({
      id: 'dup-id',
      latestVersion: 1,
      name: 'first',
      category: 'custom',
      description: null,
      updatedAt: 1000,
    })
    const firstCount = workflowList.length
    addWorkflow({
      id: 'dup-id',
      latestVersion: 2,
      name: 'second',
      category: 'custom',
      description: null,
      updatedAt: 2000,
    })
    expect(workflowList.length).toBe(firstCount) // 不增加
    const found = workflowList.find((w) => w.id === 'dup-id')
    expect(found?.name).toBe('second')
    expect(found?.latestVersion).toBe(2)
  })

  it('removes workflow on action:delete', () => {
    const { workflowList, addWorkflow, removeWorkflow } = useWorkflow()
    addWorkflow({
      id: 'to-remove',
      latestVersion: 1,
      name: 'r',
      category: 'custom',
      description: null,
      updatedAt: 0,
    })
    const before = workflowList.length
    expect(workflowList.some((w) => w.id === 'to-remove')).toBe(true)
    removeWorkflow('to-remove')
    expect(workflowList.length).toBe(before - 1)
    expect(workflowList.some((w) => w.id === 'to-remove')).toBe(false)
  })

  it('dispatches worldsmith:workflow-list addWorkflow updates list', () => {
    const { workflowList } = useWorkflow()
    const before = workflowList.length
    window.dispatchEvent(
      new CustomEvent('worldsmith:workflow-list', {
        detail: {
          action: 'create',
          definition: {
            id: 'evt-wf',
            name: '事件创建',
            nodes: [],
            edges: [],
          },
        },
      }),
    )
    expect(workflowList.length).toBe(before + 1)
    expect(workflowList.some((w) => w.id === 'evt-wf')).toBe(true)
  })

  it('dispatches worldsmith:workflow-list delete removes from list', () => {
    const { workflowList, addWorkflow } = useWorkflow()
    addWorkflow({
      id: 'evt-del',
      latestVersion: 1,
      name: 'd',
      category: 'custom',
      description: null,
      updatedAt: 0,
    })
    expect(workflowList.some((w) => w.id === 'evt-del')).toBe(true)
    window.dispatchEvent(
      new CustomEvent('worldsmith:workflow-list', {
        detail: { action: 'delete', id: 'evt-del' },
      }),
    )
    expect(workflowList.some((w) => w.id === 'evt-del')).toBe(false)
  })

  it('exposes refreshList as a function', () => {
    const { refreshList } = useWorkflow()
    expect(typeof refreshList).toBe('function')
  })
})
