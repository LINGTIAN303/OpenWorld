import { describe, it, expect } from 'vitest'
import { useStepLibrary, STEP_TYPE_LABELS, STEP_TYPE_ICONS, STEP_TYPE_COLORS } from '../../composables/useStepLibrary'

describe('useStepLibrary', () => {
  it('应该包含 6 种步骤类型', () => {
    const { library } = useStepLibrary()
    expect(library.value).toHaveLength(6)
  })

  it('步骤类型标签应覆盖所有 6 种类型', () => {
    const types = ['agent-task', 'user-review', 'batch-create', 'template-apply', 'consistency-check', 'transform'] as const
    for (const t of types) {
      expect(STEP_TYPE_LABELS[t]).toBeDefined()
      expect(STEP_TYPE_ICONS[t]).toBeDefined()
      expect(STEP_TYPE_COLORS[t]).toBeDefined()
    }
  })

  it('filteredLibrary 无搜索时应返回全部', () => {
    const { filteredLibrary, searchQuery } = useStepLibrary()
    searchQuery.value = ''
    expect(filteredLibrary.value).toHaveLength(6)
  })

  it('filteredLibrary 应过滤结果', () => {
    const { filteredLibrary, searchQuery } = useStepLibrary()
    searchQuery.value = 'Agent'
    expect(filteredLibrary.value.length).toBeGreaterThanOrEqual(1)
    expect(filteredLibrary.value.length).toBeLessThan(6)
  })

  it('getLibraryItem 应返回正确的项', () => {
    const { getLibraryItem } = useStepLibrary()
    const item = getLibraryItem('agent-task')
    expect(item).toBeDefined()
    expect(item!.type).toBe('agent-task')
    expect(item!.label).toBe('Agent 创作任务')
  })

  it('getLibraryItem 对不存在类型应返回 undefined', () => {
    const { getLibraryItem } = useStepLibrary()
    expect(getLibraryItem('nonexistent' as any)).toBeUndefined()
  })

  it('getDefaultConfig 应返回默认配置的副本', () => {
    const { getDefaultConfig } = useStepLibrary()
    const config = getDefaultConfig('batch-create')
    expect(config).toHaveProperty('entityType', 'character')
    expect(config).toHaveProperty('count', 5)
  })

  it('getDefaultConfig 对无配置类型应返回兜底值', () => {
    const { getDefaultConfig } = useStepLibrary()
    const config = getDefaultConfig('nonexistent' as any)
    expect(config).toHaveProperty('prompt', '')
  })

  it('getStepDisplay 应返回正确的显示信息', () => {
    const { getStepDisplay } = useStepLibrary()
    const display = getStepDisplay('consistency-check')
    expect(display.label).toBe('一致性校验')
    expect(display.icon).toBe('🔍')
    expect(display.color).toBeDefined()
  })

  it('STEP_TYPE_LABELS 应为中文标签', () => {
    expect(STEP_TYPE_LABELS['agent-task']).toBe('Agent 任务')
    expect(STEP_TYPE_LABELS['user-review']).toBe('用户审阅')
    expect(STEP_TYPE_LABELS['batch-create']).toBe('批量创建')
    expect(STEP_TYPE_LABELS['template-apply']).toBe('套用模板')
    expect(STEP_TYPE_LABELS['consistency-check']).toBe('一致性校验')
    expect(STEP_TYPE_LABELS['transform']).toBe('数据转换')
  })

  it('所有步骤都应包含必需的字段', () => {
    const { library } = useStepLibrary()
    for (const item of library.value) {
      expect(item.type).toBeTruthy()
      expect(item.label).toBeTruthy()
      expect(item.icon).toBeTruthy()
      expect(item.description).toBeTruthy()
      expect(item.defaultConfig).toBeTruthy()
    }
  })
})
