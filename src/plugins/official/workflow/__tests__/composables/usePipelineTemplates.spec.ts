import { describe, it, expect, beforeEach, vi } from 'vitest'
import { usePipelineTemplates } from '../../composables/usePipelineTemplates'

// Mock usePipeline
vi.mock('../../composables/usePipeline', () => ({
  usePipeline: () => ({
    createPipeline: vi.fn().mockResolvedValue({ id: 'mock-pipeline-1' }),
  }),
}))

// Mock useEntityStore (Pinia store — requires active Pinia which we don't set up in unit tests)
const mockEntityStore = {
  entities: [],
  add: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
  loadByType: vi.fn().mockResolvedValue(undefined),
}
vi.mock('@worldsmith/entity-core', () => ({
  useEntityStore: () => mockEntityStore,
}))

describe('usePipelineTemplates', () => {
  beforeEach(() => {
    localStorage.clear()
    mockEntityStore.add.mockClear()
    mockEntityStore.remove.mockClear()
    mockEntityStore.loadByType.mockClear()
  })

  it('应包含内置模板', () => {
    const { builtin } = usePipelineTemplates()
    expect(builtin.value.length).toBeGreaterThanOrEqual(3)
  })

  it('内置模板应包含中世纪王国、魔法体系、角色关系网', () => {
    const { builtin } = usePipelineTemplates()
    const names = builtin.value.map(t => t.name)
    expect(names).toContain('中世纪王国')
    expect(names).toContain('魔法体系')
    expect(names).toContain('角色关系网')
  })

  it('allTemplates 应包含内置 + 用户自定义', async () => {
    const { allTemplates, saveAsTemplate } = usePipelineTemplates()

    const before = allTemplates.value.length
    await saveAsTemplate({
      name: '测试模板',
      steps: [],
      connections: [],
    })
    expect(allTemplates.value.length).toBe(before + 1)
  })

  it('saveAsTemplate 应调用 entityStore.add 保存', async () => {
    const { saveAsTemplate } = usePipelineTemplates()
    await saveAsTemplate({
      name: '持久化模板',
      steps: [],
      connections: [],
    })

    expect(mockEntityStore.add).toHaveBeenCalledTimes(1)
    const savedEntity = mockEntityStore.add.mock.calls[0][0]
    expect(savedEntity.name).toBe('持久化模板')
    expect(savedEntity.type).toBe('pipeline-template')
  })

  it('getTemplate 应正确查找模板', () => {
    const { getTemplate } = usePipelineTemplates()
    const tpl = getTemplate('medieval-kingdom')
    expect(tpl).toBeDefined()
    expect(tpl!.name).toBe('中世纪王国')
  })

  it('getTemplate 对不存在模板应返回 undefined', () => {
    const { getTemplate } = usePipelineTemplates()
    expect(getTemplate('nonexistent')).toBeUndefined()
  })

  it('deleteTemplate 应删除用户自定义模板', async () => {
    const { saveAsTemplate, deleteTemplate, custom } = usePipelineTemplates()
    const tpl = await saveAsTemplate({ name: '待删除', steps: [], connections: [] })
    expect(custom.value).toHaveLength(1)

    await deleteTemplate(tpl.id)
    expect(custom.value).toHaveLength(0)
  })

  it('applyTemplate 应从模板创建 Pipeline 并返回 id', async () => {
    const { applyTemplate } = usePipelineTemplates()
    const id = await applyTemplate('medieval-kingdom')
    expect(id).toBeTruthy()
    expect(typeof id).toBe('string')
  })

  it('所有内置模板的步骤应有有效结构', () => {
    const { builtin } = usePipelineTemplates()
    for (const tpl of builtin.value) {
      expect(tpl.id).toBeTruthy()
      expect(tpl.steps.length).toBeGreaterThan(0)
      for (const step of tpl.steps) {
        expect(step.type).toBeTruthy()
        expect(step.title).toBeTruthy()
        expect(step.config).toBeTruthy()
      }
    }
  })
})
