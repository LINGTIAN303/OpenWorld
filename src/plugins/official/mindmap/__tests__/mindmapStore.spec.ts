/**
 * mindmapStore 单元测试
 *
 * 覆盖：导航、选择、样式、UI 切换、持久化
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Mock external dependencies that the store imports internally
vi.mock('@worldsmith/entity-core', () => {
  const mockEntityStore = () => ({
    entities: [],
    loadAll: vi.fn(),
    add: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  })
  const mockRelationStore = () => ({
    relations: [],
    loadAll: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
  })
  let _entityStore: ReturnType<typeof mockEntityStore>
  let _relationStore: ReturnType<typeof mockRelationStore>
  return {
    useEntityStore: () => {
      if (!_entityStore) _entityStore = mockEntityStore()
      return _entityStore
    },
    useRelationStore: () => {
      if (!_relationStore) _relationStore = mockRelationStore()
      return _relationStore
    },
    relationSchemaRegistry: { getAll: () => [] },
    getEdgeColor: () => '#888',
    getNodeColor: () => '#667799',
    getNodeTypeInfo: () => ({ shape: 'rect', label: '测试', icon: 'cube' }),
    getRelationLabel: (t: string) => t,
  }
})

vi.mock('@worldsmith/canvas-engine', () => ({
  useGraphData: () => ({
    nodes: [],
    edges: [],
  }),
}))

// Ensure localStorage is clean between tests
function clearStorage() {
  const keys = Object.keys(localStorage).filter(k => k.startsWith('worldsmith_mindmap_') || k === 'worldsmith-mindmap-positions')
  for (const k of keys) localStorage.removeItem(k)
}

import { useMindmapStore } from '../mindmapStore'

describe('mindmapStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    clearStorage()
  })

  // ========================================================================
  // 导航
  // ========================================================================
  describe('navigation', () => {
    it('初始化时 currentRootId 为 null，breadcrumb 仅含全局图', () => {
      const store = useMindmapStore()
      expect(store.currentRootId).toBeNull()
      expect(store.breadcrumb).toEqual([{ id: null, name: '全局图' }])
    })

    it('enterNode 推入导航栈', () => {
      const store = useMindmapStore()
      store.enterNode('char-001')
      expect(store.currentRootId).toBe('char-001')
      expect(store.navigationStack).toEqual(['char-001'])
      expect(store.breadcrumb.length).toBe(2)
      expect(store.breadcrumb[1].id).toBe('char-001')
    })

    it('exitNode 弹出导航栈', () => {
      const store = useMindmapStore()
      store.enterNode('char-001')
      store.exitNode()
      expect(store.currentRootId).toBeNull()
      expect(store.navigationStack).toEqual([])
    })

    it('jumpToBreadcrumb 跳转到指定层级', () => {
      const store = useMindmapStore()
      store.enterNode('char-001')
      store.enterNode('region-002')
      store.jumpToBreadcrumb('char-001')
      expect(store.currentRootId).toBe('char-001')
      expect(store.navigationStack).toEqual(['char-001'])
    })

    it('jumpToBreadcrumb(null) 回到全局图', () => {
      const store = useMindmapStore()
      store.enterNode('char-001')
      store.jumpToBreadcrumb(null)
      expect(store.currentRootId).toBeNull()
      expect(store.navigationStack).toEqual([])
    })

    it('exitToGlobal 清空导航栈', () => {
      const store = useMindmapStore()
      store.enterNode('a')
      store.enterNode('b')
      store.exitToGlobal()
      expect(store.navigationStack).toEqual([])
      expect(store.currentRootId).toBeNull()
    })
  })

  // ========================================================================
  // 选择
  // ========================================================================
  describe('selection', () => {
    it('selectNode 单选替换', () => {
      const store = useMindmapStore()
      store.selectNode('n1')
      expect(store.selectedNodeIds.has('n1')).toBe(true)
      expect(store.focusedNodeId).toBe('n1')

      store.selectNode('n2')
      expect(store.selectedNodeIds.has('n1')).toBe(false)
      expect(store.selectedNodeIds.has('n2')).toBe(true)
    })

    it('selectNode multi 多选', () => {
      const store = useMindmapStore()
      store.selectNode('n1', true)
      store.selectNode('n2', true)
      expect(store.selectedNodeIds.has('n1')).toBe(true)
      expect(store.selectedNodeIds.has('n2')).toBe(true)

      // 再次点击取消
      store.selectNode('n1', true)
      expect(store.selectedNodeIds.has('n1')).toBe(false)
    })

    it('clearSelection 清空所有选择', () => {
      const store = useMindmapStore()
      store.selectNode('n1')
      store.selectNode('n2', true)
      store.clearSelection()
      expect(store.selectedNodeIds.size).toBe(0)
      expect(store.focusedNodeId).toBeNull()
    })

    it('selectAll 批量选择', () => {
      const store = useMindmapStore()
      store.selectAll(['a', 'b', 'c'])
      expect(store.selectedNodeIds.size).toBe(3)
      expect(store.focusedNodeId).toBe('c')
    })
  })

  // ========================================================================
  // 样式
  // ========================================================================
  describe('style', () => {
    it('setNodeColor / getNodeColor', () => {
      const store = useMindmapStore()
      store.setNodeColor('n1', '#ff0000')
      expect(store.getNodeColor('n1')).toBe('#ff0000')

      store.setNodeColor('n1', '')
      expect(store.getNodeColor('n1')).toBeUndefined()
    })

    it('toggleCollapsed / isCollapsed', () => {
      const store = useMindmapStore()
      expect(store.isCollapsed('n1')).toBe(false)
      store.toggleCollapsed('n1')
      expect(store.isCollapsed('n1')).toBe(true)
      store.toggleCollapsed('n1')
      expect(store.isCollapsed('n1')).toBe(false)
    })

    it('setEdgeStyle / removeEdgeStyle', () => {
      const store = useMindmapStore()
      store.setEdgeStyle('e1', { lineStyle: 'straight' })
      expect(store.edgeStyleOverrides['e1']?.lineStyle).toBe('straight')

      store.removeEdgeStyle('e1')
      expect(store.edgeStyleOverrides['e1']).toBeUndefined()
    })
  })

  // ========================================================================
  // Section / CustomNode
  // ========================================================================
  describe('sections & custom nodes', () => {
    it('addSection / removeSection', () => {
      const store = useMindmapStore()
      const section = { id: 's1', name: '测试组', color: '#6c5ce7', childNodeIds: ['a', 'b'], isEntity: false }
      store.addSection(section)
      expect(store.sections['s1']?.name).toBe('测试组')

      store.removeSection('s1')
      expect(store.sections['s1']).toBeUndefined()
    })

    it('addCustomNode / removeCustomNode', () => {
      const store = useMindmapStore()
      const node = { id: 'cn1', parentId: '', type: 'textbox' as const, name: '测试框', content: 'hello', position: { x: 100, y: 200 }, style: {} }
      store.addCustomNode(node)
      expect(store.customNodes['cn1']?.name).toBe('测试框')

      store.removeCustomNode('cn1')
      expect(store.customNodes['cn1']).toBeUndefined()
    })

    it('getCustomNodesForParent 按 parentId 过滤', () => {
      const store = useMindmapStore()
      store.addCustomNode({ id: 'cn1', parentId: 'parent-a', type: 'textbox', name: '', content: '', position: { x: 0, y: 0 }, style: {} })
      store.addCustomNode({ id: 'cn2', parentId: '', type: 'textbox', name: '', content: '', position: { x: 0, y: 0 }, style: {} })
      expect(store.getCustomNodesForParent('parent-a')).toHaveLength(1)
      expect(store.getCustomNodesForParent(null)).toHaveLength(1)
    })
  })

  // ========================================================================
  // UI 切换
  // ========================================================================
  describe('ui toggles', () => {
    it('toggleDetailPanel', () => {
      const store = useMindmapStore()
      expect(store.ui.detailPanelVisible).toBe(false)
      store.toggleDetailPanel()
      expect(store.ui.detailPanelVisible).toBe(true)
      store.toggleDetailPanel()
      expect(store.ui.detailPanelVisible).toBe(false)
    })

    it('toggleMinimap', () => {
      const store = useMindmapStore()
      expect(store.ui.minimapVisible).toBe(true)
      store.toggleMinimap()
      expect(store.ui.minimapVisible).toBe(false)
    })

    it('toggleEditMode', () => {
      const store = useMindmapStore()
      store.toggleEditMode()
      expect(store.ui.editMode).toBe(true)
    })

    it('toggleFreeDrawMode', () => {
      const store = useMindmapStore()
      store.toggleFreeDrawMode()
      expect(store.ui.freeDrawMode).toBe(true)
    })

    it('showContextMenu / hideContextMenu', () => {
      const store = useMindmapStore()
      store.showContextMenu({ x: 100, y: 200, nodeId: 'n1', nodeType: 'character' })
      expect(store.ui.contextMenu.show).toBe(true)
      expect(store.ui.contextMenu.nodeId).toBe('n1')
      store.hideContextMenu()
      expect(store.ui.contextMenu.show).toBe(false)
    })
  })

  // ========================================================================
  // 布局 / 筛选
  // ========================================================================
  describe('layout & filter', () => {
    it('setLayout 切换布局算法', () => {
      const store = useMindmapStore()
      store.setLayout('radial')
      expect(store.layoutAlgorithm).toBe('radial')
      store.setLayout('tree')
      expect(store.layoutAlgorithm).toBe('tree')
    })

    it('toggleEntityType 添加/移除可见类型', () => {
      const store = useMindmapStore()
      expect(store.visibleEntityTypes.has('character')).toBe(true)
      store.toggleEntityType('character')
      expect(store.visibleEntityTypes.has('character')).toBe(false)
      store.toggleEntityType('character')
      expect(store.visibleEntityTypes.has('character')).toBe(true)
    })
  })

  // ========================================================================
  // 搜索
  // ========================================================================
  describe('search', () => {
    it('setSearchQuery / setSearchMatches', () => {
      const store = useMindmapStore()
      store.setSearchQuery('测试')
      expect(store.searchQuery).toBe('测试')
      store.setSearchMatches(['a', 'b'])
      expect(store.searchMatches).toEqual(['a', 'b'])
      store.setSearchMatchIndex(1)
      expect(store.searchMatchIndex).toBe(1)
    })
  })

  // ========================================================================
  // AI 高亮
  // ========================================================================
  describe('highlight', () => {
    it('setHighlighted / clearHighlight', () => {
      const store = useMindmapStore()
      store.setHighlighted(['n1', 'n2'], { sourceId: 'n1', targetId: 'n2', path: ['n1', 'n2'] })
      expect(store.highlightedNodeIds.has('n1')).toBe(true)
      expect(store.highlightedNodeIds.has('n2')).toBe(true)
      expect(store.highlightedPath?.path).toEqual(['n1', 'n2'])

      store.clearHighlight()
      expect(store.highlightedNodeIds.size).toBe(0)
      expect(store.highlightedPath).toBeNull()
    })

    it('setAISuggestionHints / clearAISuggestionHints', () => {
      const store = useMindmapStore()
      const hints = [{ sourceId: 'a', targetId: 'b', relType: 'friend_of' }]
      store.setAISuggestionHints(hints)
      expect(store.aiSuggestionHints).toHaveLength(1)
      store.clearAISuggestionHints()
      expect(store.aiSuggestionHints).toHaveLength(0)
    })
  })

  // ========================================================================
  // 位置缓存
  // ========================================================================
  describe('positions', () => {
    it('setNodePosition / getNodePosition', () => {
      const store = useMindmapStore()
      store.setNodePosition('n1', 100, 200)
      expect(store.getNodePosition('n1')).toEqual({ x: 100, y: 200 })

      store.clearPositions()
      expect(store.getNodePosition('n1')).toBeUndefined()
    })
  })

  // ========================================================================
  // 连线创建
  // ========================================================================
  describe('edge connecting', () => {
    it('startEdgeConnect / cancelEdgeConnect', () => {
      const store = useMindmapStore()
      store.startEdgeConnect('src-id')
      expect(store.ui.edgeConnecting).toBe(true)
      expect(store.connectSourceId).toBe('src-id')

      store.cancelEdgeConnect()
      expect(store.ui.edgeConnecting).toBe(false)
      expect(store.connectSourceId).toBe('')
    })

    it('toggleEditMode 关闭编辑模式时取消连线', () => {
      const store = useMindmapStore()
      store.startEdgeConnect('src-id')
      store.toggleEditMode() // 开启编辑模式
      expect(store.ui.editMode).toBe(true)
      expect(store.ui.edgeConnecting).toBe(true) // 连线仍在

      store.toggleEditMode() // 关闭编辑模式
      expect(store.ui.editMode).toBe(false)
      expect(store.ui.edgeConnecting).toBe(false) // 连线被取消
    })
  })
})
