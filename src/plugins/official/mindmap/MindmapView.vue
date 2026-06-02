<template>
  <div class="mindmap-view">
    <MindmapToolbar
      :search-query="searchQuery"
      :layout="layoutName"
      :enabled-types="visibleTypes"
      :edit-mode="editMode"
      :free-draw-mode="freeDrawing.isFreeDrawMode.value"
      :zoom-level="zoomLevel"
      :can-go-back="!!mindmapStore.currentRootId"
      :detail-panel-visible="mindmapStore.detailPanelVisible"
      @update:search-query="searchQuery = $event; onSearchInput()"
      @update:layout="layoutName = $event; applyLayout()"
      @update:enabled-types="visibleTypes = $event; rebuildGraph()"
      @toggle-edit-mode="toggleEditMode"
      @toggle-free-draw="toggleFreeDrawMode"
      @toggle-ai-suggest="aiSuggestions.toggle()"
      @add-textbox="ctxAddTextbox"
      @add-image="ctxAddImage"
      @add-note="ctxAddNote"
      @add-link="ctxAddLink"
      @add-group="ctxAddGroup"
      @add-center="ctxAddCenter"
      @fit="fitView"
      @zoom-in="zoomIn"
      @zoom-out="zoomOut"
      @go-back="exitNested"
      @toggle-detail="mindmapStore.toggleDetailPanel()"
    />

    <MindmapBreadcrumb :breadcrumb="breadcrumb" @jump="jumpTo" />

    <EmptyState v-if="!entityStore.entities.length" icon="map" message="还没有实体" hint="创建第一个实体吧" actionText="创建实体" @action="ctxCreateNode" />

    <div class="mm-main-area">
      <div ref="containerRef" class="mm-canvas"></div>

      <MindmapDetailPanel
        :visible="mindmapStore.detailPanelVisible"
        :node-id="selectedNodeId"
        :node-name="selectedNodeName"
        :node-type="selectedNodeType"
        :node-tags="selectedNodeTags"
        :node-desc="selectedNodeDesc"
        :node-properties="selectedNodeProperties"
        @close="mindmapStore.hideDetailPanel()"
        @edit="ctxEditName"
        @enter="enterSelectedNode"
        @delete="ctxDeleteNode"
        @navigate="navigateToEntity"
      />
    </div>

    <MindmapKeyHint :current-sequence="currentSequence" :available-next="availableNext" :is-active="keyHintActive" />

    <div v-if="freeDrawing.isFreeDrawMode.value" class="mm-freedraw-bar">
      <span class="mm-freedraw-label"><WsIcon name="brush" size="xs" /> 绘图</span>
      <button
        v-for="c in freeDrawing.colorPresets" :key="c"
        class="mm-freedraw-color"
        :class="{ active: freeDrawing.drawColor.value === c }"
        :style="{ background: c }"
        @click="freeDrawing.drawColor.value = c"
      ></button>
      <select class="mm-freedraw-width" :value="freeDrawing.drawWidth.value" @change="freeDrawing.drawWidth.value = Number(($event.target as HTMLSelectElement).value)">
        <option value="2">细</option>
        <option value="3">中</option>
        <option value="5">粗</option>
        <option value="8">超粗</option>
      </select>
      <button class="mm-btn-sm" @click="undoFreeDrawStroke">撤销</button>
      <button class="mm-btn-sm" @click="clearFreeDrawStrokes"><WsIcon name="delete" size="xs" /> 清除</button>
      <button class="mm-btn-sm" @click="toggleFreeDrawMode"><WsIcon name="close" size="xs" /> 退出</button>
    </div>

    <AISuggestionPanel
      :visible="aiSuggestions.isVisible.value"
      :items="aiSuggestions.suggestions.value"
      :loading="aiSuggestions.isLoading.value"
      :ai-analyzing="aiSuggestions.isAIAnalyzing.value"
      @close="aiSuggestions.toggle()"
      @analyze="onAISuggestionAnalyze"
      @analyze-ai="onAISuggestionAnalyzeWithAI"
      @clear="aiSuggestions.clear()"
      @dismiss="aiSuggestions.dismiss($event)"
      @accept="onAISuggestionAccept($event)"
    />

    <input ref="imageInputRef" type="file" accept="image/*" class="hidden-input" @change="onImageFileSelected" />

    <div v-if="ctxMenu.show" class="mm-ctx-menu" :style="ctxMenuStyle">
      <button v-if="ctxMenu.nodeId" class="mm-ctx-item" @click="ctxEditName"><WsIcon name="edit" size="xs" /> 编辑名称</button>
      <button v-if="ctxMenu.nodeId && !ctxNodeIsCustom" class="mm-ctx-item" @click="ctxEditDescription"><WsIcon name="edit" size="xs" /> 编辑描述</button>
      <button v-if="ctxMenu.nodeId && !ctxNodeIsCustom" class="mm-ctx-item" @click="ctxEditTags"><WsIcon name="tag" size="xs" /> 编辑标签</button>
      <button v-if="ctxMenu.nodeId" class="mm-ctx-item" @click="startEdgeConnect"><WsIcon name="link" size="xs" /> 连接</button>
      <button v-if="ctxMenu.nodeId && selectedNodes.size >= 2" class="mm-ctx-item" @click="createSectionFromSelection"><WsIcon name="item" size="xs" /> 创建分组框</button>
      <button v-if="ctxMenu.nodeId && selectedNodes.size >= 2" class="mm-ctx-item" @click="onAISuggestionAnalyzeSelection"><WsIcon name="search" size="xs" /> 分析关系</button>
      <button v-if="ctxMenu.nodeId && selectedNodes.size >= 2" class="mm-ctx-item" @click="onAISuggestionAnalyzeSelectionWithAI"><WsIcon name="concept" size="xs" /> AI 分析关系</button>
      <button v-if="ctxMenu.nodeId && !ctxNodeIsCustom" class="mm-ctx-item" @click="ctxToggleCollapse">
        <WsIcon name="folder" size="xs" /> {{ isNodeCollapsed(ctxMenu.nodeId) ? '展开子节点' : '折叠子节点' }}
      </button>
      <button v-if="ctxMenu.nodeId && ctxMenu.nodeType === 'section'" class="mm-ctx-item" @click="sectionMgr.promoteToEntity(ctxMenu.nodeId)"><WsIcon name="arrow-up" size="xs" /> 提升为实体分组</button>
      <button v-if="ctxMenu.nodeId && ctxMenu.nodeType === 'section'" class="mm-ctx-item danger" @click="sectionMgr.removeSection(ctxMenu.nodeId)"><WsIcon name="delete" size="xs" /> 删除分组框</button>
      <button v-if="ctxMenu.nodeId" class="mm-ctx-item" @click="ctxDeleteNode"><WsIcon name="delete" size="xs" /> 删除</button>
      <div v-if="ctxMenu.nodeId" class="mm-ctx-divider"></div>
      <button v-if="ctxMenu.edgeId" class="mm-ctx-item" @click="editEdgeLabel"><WsIcon name="tag" size="xs" /> 编辑标签</button>
      <button v-if="ctxMenu.edgeId" class="mm-ctx-item" @click="editEdgeType"><WsIcon name="refresh" size="xs" /> 更改关系类型</button>
      <button v-if="ctxMenu.edgeId" class="mm-ctx-item" @click="deleteEdge"><WsIcon name="delete" size="xs" /> 删除关系</button>
      <div v-if="ctxMenu.edgeId" class="mm-ctx-divider"></div>
      <div v-if="ctxMenu.edgeId" class="mm-ctx-submenu-wrap">
        <button class="mm-ctx-item"><WsIcon name="outline" size="xs" /> 连线样式 ▸</button>
        <div class="mm-ctx-submenu">
          <button class="mm-ctx-item" @click="setEdgeStyle('bezier')">贝塞尔曲线</button>
          <button class="mm-ctx-item" @click="setEdgeStyle('straight')">— 直线</button>
          <button class="mm-ctx-item" @click="setEdgeStyle('taxi')">∟ 折线</button>
        </div>
      </div>
      <div v-if="ctxMenu.nodeId" class="mm-ctx-divider"></div>
      <button v-if="ctxMenu.nodeId" class="mm-ctx-item" @click="ctxSetCenter"><WsIcon name="target" size="xs" /> 设为中心节点</button>
      <button v-if="ctxMenu.nodeId && !ctxNodeIsCustom && ctxMenu.nodeType !== 'section'" class="mm-ctx-item" @click="enterSelectedNode"><WsIcon name="search" size="xs" /> 进入子图</button>
      <div v-if="ctxMenu.isCenter" class="mm-ctx-submenu-wrap">
        <button class="mm-ctx-item"><WsIcon name="palette" size="xs" /> 样式 ▸</button>
        <div class="mm-ctx-submenu">
          <button class="mm-ctx-item" @click="ctxSetCenterStyle('default')">默认</button>
          <button class="mm-ctx-item" @click="ctxSetCenterStyle('gold')">金色</button>
          <button class="mm-ctx-item" @click="ctxSetCenterStyle('flame')">火焰</button>
          <button class="mm-ctx-item" @click="ctxSetCenterStyle('ocean')">海洋</button>
          <button class="mm-ctx-item" @click="ctxSetCenterStyle('forest')">森林</button>
        </div>
      </div>
      <div v-if="ctxMenu.nodeType === 'textbox'" class="mm-ctx-submenu-wrap">
        <button class="mm-ctx-item"><WsIcon name="outline" size="xs" /> 大小 ▸</button>
        <div class="mm-ctx-submenu">
          <button class="mm-ctx-item" @click="ctxSetTextboxSize('small')">小</button>
          <button class="mm-ctx-item" @click="ctxSetTextboxSize('medium')">中</button>
          <button class="mm-ctx-item" @click="ctxSetTextboxSize('large')">大</button>
          <button class="mm-ctx-item" @click="ctxSetTextboxSize('wide')">宽</button>
        </div>
      </div>
      <div v-if="ctxMenu.nodeType === 'textbox'" class="mm-ctx-submenu-wrap">
        <button class="mm-ctx-item"><WsIcon name="palette" size="xs" /> 样式 ▸</button>
        <div class="mm-ctx-submenu">
          <button class="mm-ctx-item" @click="ctxSetTextboxStyle('default')">默认</button>
          <button class="mm-ctx-item" @click="ctxSetTextboxStyle('blue')">蓝色</button>
          <button class="mm-ctx-item" @click="ctxSetTextboxStyle('green')">绿色</button>
          <button class="mm-ctx-item" @click="ctxSetTextboxStyle('pink')">粉色</button>
        </div>
      </div>
      <button v-if="ctxMenu.nodeType === 'image'" class="mm-ctx-item" @click="ctxEditImage"><WsIcon name="image" size="xs" /> 编辑图片</button>
      <button v-if="ctxMenu.nodeType === 'note'" class="mm-ctx-item" @click="ctxEditNoteContent"><WsIcon name="edit" size="xs" /> 编辑内容</button>
      <div v-if="!ctxMenu.nodeId && !ctxMenu.edgeId" class="mm-ctx-item" @click="ctxCreateNode">＋ 新建节点</div>
      <div v-if="!ctxMenu.nodeId && !ctxMenu.edgeId" class="mm-ctx-divider"></div>
      <div v-if="!ctxMenu.nodeId && !ctxMenu.edgeId" class="mm-ctx-item" @click="ctxAddTextbox"><WsIcon name="edit" size="xs" /> 文本框</div>
      <div v-if="!ctxMenu.nodeId && !ctxMenu.edgeId" class="mm-ctx-item" @click="ctxAddImage"><WsIcon name="image" size="xs" /> 图片</div>
      <div v-if="!ctxMenu.nodeId && !ctxMenu.edgeId" class="mm-ctx-item" @click="ctxAddNote"><WsIcon name="outline" size="xs" /> 备注</div>
      <div v-if="!ctxMenu.nodeId && !ctxMenu.edgeId" class="mm-ctx-item" @click="ctxAddLink"><WsIcon name="link" size="xs" /> 链接</div>
      <div v-if="!ctxMenu.nodeId && !ctxMenu.edgeId" class="mm-ctx-item" @click="ctxAddGroup"><WsIcon name="item" size="xs" /> 分组</div>
      <template v-if="ctxMenuStrokeId">
        <div class="mm-ctx-divider"></div>
        <div class="mm-ctx-item" role="button" tabindex="0" @click="deleteCtxStroke" @keydown.enter="deleteCtxStroke"><WsIcon name="delete" size="xs" /> 删除笔迹</div>
      </template>
    </div>

    <div v-if="edgeConnecting" class="mm-connect-bar"><WsIcon name="link" size="xs" /> 点击另一个节点完成连接，点击空白处取消</div>

    <div v-if="showInlineEdit" class="mm-inline-edit" :style="inlineEditStyle">
      <input ref="inlineInputRef" v-model="inlineEditText" class="mm-inline-input" aria-label="编辑名称" @keyup.enter="commitInlineEdit" @keyup.esc="cancelInlineEdit" />
      <button class="mm-btn-sm" @click="commitInlineEdit"><WsIcon name="check" size="xs" /></button>
      <button class="mm-btn-sm" @click="cancelInlineEdit"><WsIcon name="close" size="xs" /></button>
    </div>

    <Transition name="ws-scale-fade">
      <div v-if="showTypePicker" class="mm-modal-backdrop" @click.self="showTypePicker = false">
        <div class="mm-modal">
          <h4>选择实体类型</h4>
          <div class="mm-modal-grid">
            <button v-for="t in activeTypes" :key="t.type" class="mm-type-card" @click="onPickType(t.type)">
              <WsIcon :name="resolveIcon(t.icon)" size="lg" :fallback="t.icon" />
              <span>{{ t.label }}</span>
            </button>
          </div>
          <button class="mm-btn" @click="showTypePicker = false">取消</button>
        </div>
      </div>
    </Transition>

    <Transition name="ws-scale-fade">
      <div v-if="showRelationPicker" class="mm-modal-backdrop" @click.self="showRelationPicker = false">
        <div class="mm-modal">
          <h4>选择关系类型</h4>
          <div class="mm-modal-grid">
            <button v-for="rt in availableRelationTypes" :key="rt.type" class="mm-type-card" @click="onPickRelation(rt)">
              <span>{{ rt.label }}</span>
            </button>
          </div>
          <button class="mm-btn" @click="showRelationPicker = false">取消</button>
        </div>
      </div>
    </Transition>

    <Transition name="ws-scale-fade">
      <div v-if="showTagEditor" class="mm-modal-backdrop" @click.self="showTagEditor = false">
        <div class="mm-modal">
          <h4>编辑标签</h4>
          <textarea v-model="tagEditorText" class="mm-textarea" placeholder="每行一个标签" rows="6"></textarea>
          <div style="margin-top:8px;display:flex;gap:8px;">
            <button class="mm-btn" @click="saveTags">保存</button>
            <button class="mm-btn" @click="showTagEditor = false">取消</button>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="ws-scale-fade">
      <div v-if="showDescEditor" class="mm-modal-backdrop" @click.self="showDescEditor = false">
        <div class="mm-modal">
          <h4>编辑描述</h4>
          <textarea v-model="descEditorText" class="mm-textarea" placeholder="输入描述" rows="8"></textarea>
          <div style="margin-top:8px;display:flex;gap:8px;">
            <button class="mm-btn" @click="saveDescription">保存</button>
            <button class="mm-btn" @click="showDescEditor = false">取消</button>
          </div>
        </div>
      </div>
    </Transition>

    <div v-if="selectedNodes.size >= 1" class="mm-batch-bar">
      已选 {{ selectedNodes.size }} 个节点
      <button class="mm-btn-sm" @click="deleteSelectedNodes"><WsIcon name="delete" size="xs" /> 删除</button>
      <button class="mm-btn-sm" @click="clearNodeSelection"><WsIcon name="close" size="xs" /> 取消</button>
    </div>

    <div v-if="imageViewer.show" class="mm-img-viewer" @click="imageViewer.show = false">
      <img :src="imageViewer.url" class="mm-img-viewer-img" />
    </div>

    <EntityFormModal v-model="showEntityForm" :title="editingEntity ? '编辑实体' : '新建实体'" :entity="editingEntity" :fields="getFormFields(entityFormType)" :entity-type="entityFormType" @save="onEntityFormSave" />

    <Transition name="ws-scale-fade">
      <div v-if="showColorPicker" class="mm-modal-backdrop" @click.self="showColorPicker = false">
        <div class="mm-modal">
          <h4>选择颜色</h4>
          <div class="mm-color-grid">
            <button v-for="c in presetColors" :key="c" class="mm-color-btn" :style="{ background: c }" @click="onPickColor(c)"></button>
          </div>
          <div style="margin-top:8px;display:flex;gap:8px;align-items:center;">
            <input v-model="customColor" type="color" class="mm-color-input" aria-label="自定义颜色" />
            <button class="mm-btn" @click="onPickColor(customColor)">自定义</button>
            <button class="mm-btn" @click="onPickColor('')">清除</button>
            <button class="mm-btn" @click="showColorPicker = false">取消</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import WsIcon from '../../../ui/WsIcon.vue'
import { useEntityStore, useRelationStore } from '@worldsmith/entity-core'
import type { Entity, Relation } from '@worldsmith/entity-core'
import { EmptyState, EntityFormModal, type FormFieldDef, deduplicateEdges, useShortcuts, useUndoRedo, useGraphData, useTypeMapping } from '@worldsmith/ui-kit'
import MindmapToolbar from './components/MindmapToolbar.vue'
import { nodeSize, guessRelType, getViewIdForEntity } from './mindmapConfig'
import { relationSchemaRegistry } from '@worldsmith/entity-core'
import { useMindmapStore } from './mindmapStore'
import { useSection } from './composables/useSection'
import { useKeySequence } from './composables/useKeySequence'
import { edgeLineStyle, KEY_SEQUENCES } from './mindmapConfig'
import MindmapBreadcrumb from './MindmapBreadcrumb.vue'
import MindmapDetailPanel from './MindmapDetailPanel.vue'
import MindmapKeyHint from './MindmapKeyHint.vue'
import AISuggestionPanel from './components/AISuggestionPanel.vue'
import { useCanvasRenderer } from './composables/useCanvasRenderer'
import { useForceLayout, type LayoutType } from './composables/useForceLayout'
import { useCanvasInteraction, type CanvasInteractionCallbacks } from './composables/useCanvasInteraction'
import type { CanvasNode, CanvasEdge } from './composables/canvasTypes'
import { useFreeDrawing } from './composables/useFreeDrawing'
import { useAISuggestions, type Suggestion } from './composables/useAISuggestions'
import { getEdgeColor } from '@worldsmith/entity-core'
import { useAgentPluginBridge } from '../../../composables/useAgentPluginBridge'

const entityStore = useEntityStore()
const relationStore = useRelationStore()
const mindmapStore = useMindmapStore()
const undoRedo = useUndoRedo()
const { nodes: graphNodes, edges: graphEdges } = useGraphData()
const { getColor, getIcon, getLabel } = useTypeMapping()

const emojiToIcon: Record<string, string> = {
  '📋': 'outline', '🏷️': 'tag', '📝': 'edit', '🎨': 'palette',
  '📐': 'outline', '🔗': 'link', '✨': 'magic', '📂': 'folder',
  '📁': 'folder', '🔍': 'search', '🗑️': 'delete', '⭐': 'star',
  '🏠': 'home', '⚔️': 'war', '📜': 'manuscript', '📍': 'location',
  '💡': 'inspiration', '🎭': 'culture', '🐉': 'species', '🧠': 'concept',
  '🧬': 'species', '🐣': 'character', '🌱': 'plant', '⚡': 'lightning',
  '💀': 'skull', '🛡️': 'shield', '🔮': 'magic', '💍': 'tag',
  '🧪': 'magic', '🔧': 'settings', '🚢': 'trade', '🎵': 'music',
  '🏺': 'item', '🍷': 'item', '👘': 'apparel', '📦': 'item',
  '✅': 'check', '📌': 'pin', '🌿': 'plant', '🗡️': 'weapon',
  '🏗️': 'building', '📄': 'manuscript', '🧩': 'puzzle', '👤': 'user',
  '🖼️': 'image', '⬆️': 'arrow-up', '🔄': 'refresh', '🎯': 'target',
  '🖌️': 'brush',
}

function resolveIcon(emoji: string): string {
  return emojiToIcon[emoji] || emoji
}

const containerRef = ref<HTMLDivElement | null>(null)
const imageInputRef = ref<HTMLInputElement>()
const inlineInputRef = ref<HTMLInputElement>()

const canvasNodes = ref<CanvasNode[]>([])
const canvasEdges = ref<CanvasEdge[]>([])

const renderer = useCanvasRenderer(
  containerRef,
  () => canvasNodes.value,
  () => canvasEdges.value,
)

const forceLayout = useForceLayout()

const interactionCallbacks: CanvasInteractionCallbacks = {
  onNodeClick: (node, e) => {
    ctxMenu.show = false
    if (edgeConnecting.value) {
      if (node.id === connectSourceId.value) return
      _edgeSrcId = connectSourceId.value
      _edgeTgtId = node.id
      _relTypId = ''
      const srcNode = canvasNodes.value.find(n => n.id === connectSourceId.value)
      const srcType = srcNode?.type || ''
      const tgtType = node.type
      const guessed = guessRelType(srcType, tgtType)
      const rels = relationSchemaRegistry.getAll().filter(rt => {
        return (rt.sourceType === srcType || rt.sourceType === '*') &&
               (rt.targetType === tgtType || rt.targetType === '*')
      })
      if (rels.length > 0) {
        _relTypId = rels[0].type
        availableRelationTypes.value = rels.map(r => ({ type: r.type, label: r.label || r.type }))
        if (rels.find(r => r.type === guessed)) _relTypId = guessed
      }
      edgeConnecting.value = false
      if (_relTypId) createRelationEdge(_edgeSrcId, _edgeTgtId, _relTypId)
      else {
        availableRelationTypes.value = rels.map(r => ({ type: r.type, label: r.label || r.type }))
        showRelationPicker.value = true
      }
      return
    }
    selectedNodeId.value = node.id
    if (e.shiftKey) {
      if (selectedNodes.has(node.id)) selectedNodes.delete(node.id)
      else selectedNodes.add(node.id)
    }
  },
  onNodeDoubleClick: (node, e) => {
    if (e.ctrlKey || e.metaKey) {
      const type = node.type
      if (!['textbox', 'image', 'note', 'link', 'group', 'center', 'section'].includes(type)) {
        enterNestedNode(node.id)
      }
    } else if (node.type === 'image') {
      imageViewer.url = node.imageUrl || ''
      imageViewer.show = true
    } else if (node.type === 'link') {
      if (node.linkUrl) window.open(node.linkUrl, '_blank')
    } else {
      ctxEditName()
    }
  },
  onNodeRightClick: (node, e) => {
    ctxMenu.x = e.clientX
    ctxMenu.y = e.clientY
    ctxMenu.nodeId = node.id
    ctxMenu.edgeId = ''
    ctxMenu.nodeType = node.type
    ctxMenu.isCenter = node.type === 'center'
    ctxMenu.show = true
  },
  onNodeHover: (node) => {
    renderer.hoveredNodeId.value = node?.id || null
  },
  onEdgeClick: () => {},
  onEdgeRightClick: (edge, e) => {
    ctxMenu.x = e.clientX
    ctxMenu.y = e.clientY
    ctxMenu.nodeId = ''
    ctxMenu.edgeId = edge.id
    ctxMenu.nodeType = ''
    ctxMenu.isCenter = false
    ctxMenu.show = true
  },
  onBackgroundClick: () => {
    ctxMenu.show = false
    ctxMenuStrokeId.value = ''
    selectedNodes.clear()
    selectedNodeId.value = ''
    if (edgeConnecting.value) {
      edgeConnecting.value = false
      connectSourceId.value = ''
    }
  },
  onBackgroundRightClick: (e) => {
    ctxMenu.x = e.clientX
    ctxMenu.y = e.clientY
    ctxMenu.nodeId = ''
    ctxMenu.edgeId = ''
    ctxMenu.nodeType = ''
    ctxMenu.isCenter = false
    const rect = containerRef.value?.getBoundingClientRect()
    if (rect) {
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const { x: wx, y: wy } = renderer.screenToWorld(sx, sy)
      const hitStroke = freeDrawing.hitTestStroke(wx, wy)
      ctxMenuStrokeId.value = hitStroke?.id || ''
    } else {
      ctxMenuStrokeId.value = ''
    }
    ctxMenu.show = true
  },
  onNodeDrag: (node, dx, dy) => {
    node.x += dx
    node.y += dy
    node.fx = node.x
    node.fy = node.y
    renderer.markDirty()
  },
  onNodeDragEnd: (node) => {
    forceLayout.pinNode(node)
  },
  onZoom: (k) => {
    zoomLevel.value = Math.round(k * 100)
    renderer.markDirty()
  },
  onPan: () => {
    renderer.markDirty()
  },
}

const canvasInteraction = useCanvasInteraction(
  renderer.canvas,
  () => renderer.camera.value,
  (c) => { renderer.camera.value = c },
  renderer.hitTestNode,
  renderer.hitTestEdge,
  renderer.screenToWorld,
  interactionCallbacks,
)
canvasInteraction.setGetAllNodes(() => canvasNodes.value)

const freeDrawing = useFreeDrawing()

function updateFreeDrawInterceptor(): void {
  if (freeDrawing.isFreeDrawMode.value) {
    canvasInteraction.setInterceptor({
      onMouseDown: (e, wx, wy) => {
        if (e.button !== 0) return false
        freeDrawing.startStroke(wx, wy, mindmapStore.currentRootId)
        renderer.markDirty()
        return true
      },
      onMouseMove: (_e, wx, wy) => {
        if (freeDrawing.isDrawing.value) {
          freeDrawing.continueStroke(wx, wy)
          renderer.markDirty()
          return true
        }
        return false
      },
      onMouseUp: () => {
        if (freeDrawing.isDrawing.value) {
          freeDrawing.endStroke()
          renderer.markDirty()
          return true
        }
        return false
      },
    })
  } else {
    canvasInteraction.setInterceptor(null)
  }
}

watch(freeDrawing.isFreeDrawMode, () => {
  updateFreeDrawInterceptor()
})

function toggleFreeDrawMode(): void {
  freeDrawing.toggleFreeDrawMode()
}

function undoFreeDrawStroke(): void {
  freeDrawing.undoStroke()
}

function clearFreeDrawStrokes(): void {
  freeDrawing.clearStrokes(mindmapStore.currentRootId)
}

const aiSuggestions = useAISuggestions()

function onAISuggestionAnalyze(): void {
  aiSuggestions.analyze(canvasNodes.value)
}

function onAISuggestionAnalyzeWithAI(): void {
  aiSuggestions.analyzeWithAI(canvasNodes.value)
}

function onAISuggestionAnalyzeSelection(): void {
  aiSuggestions.analyzeSelection(canvasNodes.value, selectedNodes)
}

function onAISuggestionAnalyzeSelectionWithAI(): void {
  aiSuggestions.analyzeSelectionWithAI(canvasNodes.value, selectedNodes)
}

function onAISuggestionAccept(sug: Suggestion): void {
  createRelationEdge(sug.sourceId, sug.targetId, sug.relType)
  aiSuggestions.dismiss(sug.id)
}

function deleteCtxStroke(): void {
  ctxMenu.show = false
  if (ctxMenuStrokeId.value) {
    freeDrawing.deleteStroke(ctxMenuStrokeId.value)
    ctxMenuStrokeId.value = ''
  }
}

const zoomLevel = ref(100)
const layoutName = ref<LayoutType>('force')
const searchQuery = ref('')
const editMode = ref(false)

const visibleTypes = ref(new Set(['character', 'region', 'event', 'organization', 'concept', 'item', 'textbox', 'image', 'note', 'link', 'group']))

const ctxMenu = reactive({ show: false, x: 0, y: 0, nodeId: '', edgeId: '', nodeType: '', isCenter: false })
const ctxMenuStrokeId = ref('')
const CTX_MENU_W = 180
const CTX_MENU_H = 320
const ctxMenuStyle = computed(() => {
  let left = ctxMenu.x
  let top = ctxMenu.y
  if (left + CTX_MENU_W > window.innerWidth - 8) left = ctxMenu.x - CTX_MENU_W
  if (top + CTX_MENU_H > window.innerHeight - 8) top = ctxMenu.y - CTX_MENU_H
  left = Math.max(8, left)
  top = Math.max(8, top)
  return { left: left + 'px', top: top + 'px' }
})
const ctxNodeIsCustom = computed(() => {
  const types = ['textbox', 'image', 'note', 'link', 'group', 'center']
  return types.includes(ctxMenu.nodeType)
})

const edgeConnecting = ref(false)
const connectSourceId = ref('')
const collapsedNodes = reactive(new Set<string>())
const selectedNodes = reactive(new Set<string>())
const nodeCustomColors = reactive(new Map<string, string>())
const searchMatches = ref<string[]>([])

const sectionMgr = useSection({
  getNodes: () => canvasNodes.value,
  getEdges: () => canvasEdges.value,
})

const breadcrumb = ref<{ id: string; name: string }[]>([])

function enterNestedNode(nodeId: string) {
  const node = canvasNodes.value.find(n => n.id === nodeId)
  if (node) {
    breadcrumb.value.push({ id: nodeId, name: node.name })
    mindmapStore.currentRootId = nodeId
    rebuildGraph()
  }
}

function exitNested() {
  if (breadcrumb.value.length > 0) {
    breadcrumb.value.pop()
    mindmapStore.currentRootId = breadcrumb.value.length > 0 ? breadcrumb.value[breadcrumb.value.length - 1].id : null
    rebuildGraph()
  }
}

function jumpTo(idx: number) {
  breadcrumb.value = breadcrumb.value.slice(0, idx + 1)
  mindmapStore.currentRootId = breadcrumb.value.length > 0 ? breadcrumb.value[breadcrumb.value.length - 1].id : null
  rebuildGraph()
}

function handleKeySequence(seq: string) {
  switch (seq) {
    case 'n c': entityFormType.value = 'character'; showTypePicker.value = false; showEntityForm.value = true; break
    case 'n r': entityFormType.value = 'region'; showTypePicker.value = false; showEntityForm.value = true; break
    case 'n e': entityFormType.value = 'event'; showTypePicker.value = false; showEntityForm.value = true; break
    case 'n t': ctxAddTextbox(); break
    case 'e n': ctxEditName(); break
    case 'e d': ctxEditDescription(); break
    case 'c l': startEdgeConnect(); break
    case 'd n': ctxDeleteNode(); break
    case 'g s': createSectionFromSelection(); break
    case 'f n': focusSelectedNode(); break
    case 'j i': enterSelectedNode(); break
  }
}

const { currentSequence, availableNext, isActive: keyHintActive } = useKeySequence({
  sequences: KEY_SEQUENCES.map(ks => ({
    sequence: ks.sequence,
    description: ks.description,
    action: () => handleKeySequence(ks.sequence),
  })),
  singleKeys: {
    delete: () => deleteSelectedNodes(),
    escape: () => { if (mindmapStore.currentRootId) exitNested(); ctxMenu.show = false },
    i: () => mindmapStore.toggleDetailPanel(),
    f: () => fitView(),
  },
})

const shortcuts = useShortcuts()
onMounted(() => {
  shortcuts.register({ id: 'mindmap.toggleDetail', keys: ['i'], description: '切换详情侧栏', scope: 'view', handler: () => mindmapStore.toggleDetailPanel() })
  shortcuts.register({ id: 'mindmap.fitView', keys: ['f'], description: '适应视图', scope: 'view', handler: () => fitView() })
  shortcuts.register({ id: 'mindmap.exitNested', keys: ['escape'], description: '返回上层', scope: 'view', handler: () => { if (mindmapStore.currentRootId) exitNested(); ctxMenu.show = false } })
  shortcuts.register({ id: 'mindmap.deleteNode', keys: ['delete'], description: '删除节点', scope: 'view', handler: () => deleteSelectedNodes() })
  shortcuts.register({ id: 'mindmap.undo', keys: ['ctrl', 'z'], description: '撤销', scope: 'view', handler: () => undoRedo.undo(entityStore, relationStore) })
  shortcuts.register({ id: 'mindmap.redo', keys: ['ctrl', 'y'], description: '重做', scope: 'view', handler: () => undoRedo.redo(entityStore, relationStore) })
  shortcuts.register({ id: 'mindmap.freeDraw', keys: ['d'], description: '自由绘图', scope: 'view', handler: () => toggleFreeDrawMode() })
  shortcuts.register({ id: 'mindmap.aiSuggest', keys: ['ctrl', 'j'], description: 'AI 关系建议', scope: 'view', handler: () => aiSuggestions.toggle() })
})
onBeforeUnmount(() => {
  shortcuts.unregister('mindmap.toggleDetail')
  shortcuts.unregister('mindmap.fitView')
  shortcuts.unregister('mindmap.exitNested')
  shortcuts.unregister('mindmap.deleteNode')
  shortcuts.unregister('mindmap.undo')
  shortcuts.unregister('mindmap.redo')
  shortcuts.unregister('mindmap.freeDraw')
  shortcuts.unregister('mindmap.aiSuggest')
})

const selectedNodeId = ref('')
const selectedNodeName = computed(() => {
  const n = canvasNodes.value.find(n => n.id === selectedNodeId.value)
  return n?.name || ''
})
const selectedNodeType = computed(() => {
  const n = canvasNodes.value.find(n => n.id === selectedNodeId.value)
  return n?.type || ''
})
const selectedNodeTags = computed(() => {
  const n = canvasNodes.value.find(n => n.id === selectedNodeId.value)
  return n?.tags?.join(', ') || ''
})
const selectedNodeDesc = computed(() => {
  const n = canvasNodes.value.find(n => n.id === selectedNodeId.value)
  return n?.description || ''
})
const selectedNodeProperties = computed(() => {
  if (!selectedNodeId.value) return {}
  const entity = entityStore.entities.find(e => e.id === selectedNodeId.value)
  return entity?.properties || {}
})

const showInlineEdit = ref(false)
const inlineEditText = ref('')
const inlineEditTarget = ref<string>('')
const inlineEditStyle = ref({ left: '0px', top: '0px' })

const showTypePicker = ref(false)
const showRelationPicker = ref(false)
const showTagEditor = ref(false)
const showDescEditor = ref(false)
const showColorPicker = ref(false)
const tagEditorText = ref('')
const tagEditorTargetId = ref('')
const descEditorText = ref('')
const descEditorTargetId = ref('')

const showEntityForm = ref(false)
const editingEntity = ref<Entity | null>(null)
const entityFormType = ref('character')
const availableRelationTypes = ref<{ type: string; label: string }[]>([])

const imageViewer = reactive<{ show: boolean; url: string }>({ show: false, url: '' })

const customColor = ref('#4f46e5')
const presetColors = ['#ef4444', '#f97316', '#f59e0b', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#78716c', '#000000', '#ffffff']

let _relTypId = ''
let _edgeSrcId = ''
let _edgeTgtId = ''

const activeTypes = computed(() => {
  const customTypes = new Set(['textbox', 'image', 'note', 'link', 'group', 'center', 'section'])
  const used = new Set(entityStore.entities.map(e => e.type))
  return graphNodes.value
    .filter(n => used.has(n.type) && !customTypes.has(n.type))
    .reduce((acc, n) => {
      if (!acc.find(a => a.type === n.type)) {
        acc.push({ type: n.type, label: n.label, icon: n.icon })
      }
      return acc
    }, [] as { type: string; label: string; icon: string }[])
})

function getFormFields(type: string): FormFieldDef[] {
  return [
    { key: 'name', label: '名称', type: 'text', required: true, placeholder: '名称' },
    { key: 'description', label: '描述', type: 'textarea' },
    { key: 'tags', label: '标签', type: 'tags' },
  ]
}

function toggleEditMode() {
  editMode.value = !editMode.value
  if (!editMode.value && edgeConnecting.value) {
    edgeConnecting.value = false
    connectSourceId.value = ''
  }
}

function isNodeCollapsed(id: string): boolean { return collapsedNodes.has(id) }

function buildCanvasData(): void {
  const nodes: CanvasNode[] = []
  const edges: CanvasEdge[] = []
  const rootId = mindmapStore.currentRootId
  const saved = loadPositions()

  if (rootId === null) {
    for (const e of graphNodes.value) {
      if (!visibleTypes.value.has(e.type)) continue
      const color = getColor(e.type, 'warm')
      const size = nodeSize(e.degree)
      const pos = saved[e.id]
      nodes.push({
        id: e.id, name: e.name, type: e.type,
        x: pos?.x ?? Math.random() * 800, y: pos?.y ?? Math.random() * 600,
        vx: 0, vy: 0, fx: pos?.x ?? null, fy: pos?.y ?? null,
        width: size * 2.5, height: size * 1.5,
        color, icon: e.icon, label: e.label,
        tags: e.tags, description: e.description, degree: e.degree,
        customColor: nodeCustomColors.get(e.id) || '',
        isRoot: false, isCollapsed: collapsedNodes.has(e.id),
        childCount: 0, centerStyle: '', textboxSize: '', textboxStyle: '',
        imageUrl: '', linkUrl: '', hidden: false,
        selected: selectedNodeId.value === e.id,
        highlighted: false, searchHighlight: searchMatches.value.includes(e.id),
        sectionColor: '',
      })
    }
    const nodeIds = new Set(nodes.map(n => n.id))
    for (const me of graphEdges.value) {
      if (!nodeIds.has(me.source) || !nodeIds.has(me.target)) continue
      const override = mindmapStore.edgeStyleOverrides[me.id]
      const defaultStyle = edgeLineStyle(me.relType)
      edges.push({
        id: me.id, source: me.source, target: me.target,
        relType: me.relType, relLabel: me.relLabel,
        bidirectional: me.bidirectional, symmetric: me.symmetric,
        color: getEdgeColor(me.relType, 'warm'),
        curveStyle: override ? override.lineStyle as any : defaultStyle,
        dashed: false, noArrow: me.symmetric,
        hidden: false, selected: false,
      })
    }
  } else {
    const rootEntity = entityStore.entities.find(e => e.id === rootId)
    if (!rootEntity) { canvasNodes.value = []; canvasEdges.value = []; return }

    const rootColor = getColor(rootEntity.type, 'warm')
    nodes.push({
      id: rootEntity.id, name: rootEntity.name, type: rootEntity.type,
      x: 400, y: 300, vx: 0, vy: 0, fx: 400, fy: 300,
      width: 120, height: 120,
      color: rootColor, icon: getIcon(rootEntity.type), label: getLabel(rootEntity.type),
      tags: rootEntity.tags || [], description: rootEntity.description || '', degree: 0,
      customColor: nodeCustomColors.get(rootEntity.id) || '',
      isRoot: true, isCollapsed: false, childCount: 0,
      centerStyle: '', textboxSize: '', textboxStyle: '',
      imageUrl: '', linkUrl: '', hidden: false,
      selected: false, highlighted: false, searchHighlight: false, sectionColor: '',
    })

    const directRels = relationStore.relations.filter(r => r.sourceId === rootId || r.targetId === rootId)
    const neighborIds = new Set<string>()
    for (const r of directRels) {
      const neighborId = r.sourceId === rootId ? r.targetId : r.sourceId
      neighborIds.add(neighborId)
    }
    for (const nid of neighborIds) {
      const entity = entityStore.entities.find(e => e.id === nid)
      if (!entity || !visibleTypes.value.has(entity.type)) continue
      const color = getColor(entity.type, 'warm')
      nodes.push({
        id: entity.id, name: entity.name, type: entity.type,
        x: 400 + (Math.random() - 0.5) * 300, y: 300 + (Math.random() - 0.5) * 300,
        vx: 0, vy: 0, fx: null, fy: null,
        width: 80, height: 50,
        color, icon: getIcon(entity.type), label: getLabel(entity.type),
        tags: entity.tags || [], description: entity.description || '', degree: 0,
        customColor: nodeCustomColors.get(entity.id) || '',
        isRoot: false, isCollapsed: false, childCount: 0,
        centerStyle: '', textboxSize: '', textboxStyle: '',
        imageUrl: '', linkUrl: '', hidden: false,
        selected: false, highlighted: false, searchHighlight: false, sectionColor: '',
      })
    }

    const visitedIds = new Set(nodes.map(n => n.id))
    const visibleRels = directRels.filter(r => visitedIds.has(r.sourceId) && visitedIds.has(r.targetId))
    const merged = deduplicateEdges(visibleRels, (type) => type)
    for (const me of merged) {
      const override = mindmapStore.edgeStyleOverrides[me.id]
      const defaultStyle = edgeLineStyle(me.relType)
      edges.push({
        id: me.id, source: me.source, target: me.target,
        relType: me.relType, relLabel: me.relLabel,
        bidirectional: me.bidirectional, symmetric: me.symmetric,
        color: getEdgeColor(me.relType, 'warm'),
        curveStyle: override ? override.lineStyle as any : defaultStyle,
        dashed: false, noArrow: me.symmetric,
        hidden: false, selected: false,
      })
    }

    for (const [cnId, cn] of Object.entries(mindmapStore.customNodes)) {
      if (cn.parentId === rootId) {
        nodes.push({
          id: cnId, name: cn.name, type: cn.type,
          x: cn.position?.x || 500, y: cn.position?.y || 400,
          vx: 0, vy: 0, fx: cn.position?.x || null, fy: cn.position?.y || null,
          width: 80, height: 50,
          color: '#78909c', icon: 'edit', label: cn.type,
          tags: [], description: '', degree: 0, customColor: '',
          isRoot: false, isCollapsed: false, childCount: 0,
          centerStyle: '', textboxSize: '', textboxStyle: '',
          imageUrl: '', linkUrl: '', hidden: false,
          selected: false, highlighted: false, searchHighlight: false, sectionColor: '',
          ...cn.style,
        })
      }
    }
  }

  canvasNodes.value = nodes
  canvasEdges.value = edges
}

function applyLayout() {
  forceLayout.applyLayout(canvasNodes.value, canvasEdges.value, layoutName.value as LayoutType)
}

function rebuildGraph() {
  forceLayout.stopSimulation()
  buildCanvasData()
  applyLayout()
  renderer.markDirty()
  nextTick(() => renderer.fitView(canvasNodes.value))
}

function zoomIn() { renderer.zoomIn() }
function zoomOut() { renderer.zoomOut() }
function fitView() { renderer.fitView(canvasNodes.value) }

let searchTimer: ReturnType<typeof setTimeout> | null = null

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchMatches.value = []
    if (!searchQuery.value) {
      canvasNodes.value.forEach(n => n.searchHighlight = false)
      return
    }
    const q = searchQuery.value.toLowerCase()
    canvasNodes.value.forEach(n => {
      n.searchHighlight = n.name.toLowerCase().includes(q)
      if (n.searchHighlight) searchMatches.value.push(n.id)
    })
    renderer.markDirty()
  }, 300)
}

function createRelationEdge(srcId: string, tgtId: string, relType: string) {
  const edgeId = `rel-${Date.now()}`
  const rt = relationSchemaRegistry.getAll().find(r => r.type === relType)
  const srcNode = canvasNodes.value.find(n => n.id === srcId)
  const tgtNode = canvasNodes.value.find(n => n.id === tgtId)
  canvasEdges.value.push({
    id: edgeId, source: srcId, target: tgtId,
    relType, relLabel: rt?.label || relType,
    bidirectional: false, symmetric: false,
    color: getEdgeColor(relType, 'warm'),
    curveStyle: edgeLineStyle(relType) as any,
    dashed: false, noArrow: false, hidden: false, selected: false,
  })
  const newRel: Relation = {
    id: edgeId, type: relType, name: rt?.label || relType,
    sourceId: srcId, targetId: tgtId,
    sourceType: srcNode?.type || '', targetType: tgtNode?.type || '',
    createdAt: new Date().toISOString(),
  }
  relationStore.add(newRel)
}

function ctxCreateNode() {
  ctxMenu.show = false
  showTypePicker.value = true
}

function onPickType(type: string) {
  showTypePicker.value = false
  entityFormType.value = type
  editingEntity.value = null
  showEntityForm.value = true
}

function onPickRelation(rt: { type: string; label: string }) {
  showRelationPicker.value = false
  _relTypId = rt.type
  createRelationEdge(_edgeSrcId, _edgeTgtId, _relTypId)
}

async function onEntityFormSave(data: { name: string; description: string; properties: Record<string, any>; tags: string[] }) {
  const now = new Date().toISOString()
  if (editingEntity.value) {
    await entityStore.update(editingEntity.value.id, { name: data.name, description: data.description, properties: data.properties, tags: data.tags })
  } else {
    const entity: Entity = {
      id: `${entityFormType.value.slice(0, 4)}-${Date.now()}`,
      type: entityFormType.value, name: data.name, description: data.description,
      properties: data.properties, tags: data.tags, createdAt: now, updatedAt: now,
    }
    await entityStore.add(entity)
  }
  showEntityForm.value = false
  await entityStore.loadAll()
  rebuildGraph()
}

function ctxEditName() {
  ctxMenu.show = false
  const targetId = ctxMenu.nodeId || selectedNodeId.value
  if (!targetId) return
  const node = canvasNodes.value.find(n => n.id === targetId)
  if (!node) return
  inlineEditTarget.value = targetId
  inlineEditText.value = node.name
  const rect = containerRef.value?.getBoundingClientRect()
  if (rect) {
    const world = renderer.screenToWorld(node.x - rect.width / 2, node.y - rect.height / 2)
    inlineEditStyle.value = { left: (node.x * renderer.camera.value.k + rect.width / 2 - renderer.camera.value.x * renderer.camera.value.k) + 'px', top: (node.y * renderer.camera.value.k + rect.height / 2 - renderer.camera.value.y * renderer.camera.value.k) + 'px' }
  }
  showInlineEdit.value = true
  nextTick(() => inlineInputRef.value?.focus())
}

function commitInlineEdit() {
  if (!inlineEditTarget.value) return
  const node = canvasNodes.value.find(n => n.id === inlineEditTarget.value)
  if (node) node.name = inlineEditText.value
  const entity = entityStore.entities.find(e => e.id === inlineEditTarget.value)
  if (entity) entityStore.update(entity.id, { name: inlineEditText.value })
  showInlineEdit.value = false
}

function cancelInlineEdit() { showInlineEdit.value = false }

function ctxEditDescription() {
  ctxMenu.show = false
  if (!ctxMenu.nodeId) return
  descEditorTargetId.value = ctxMenu.nodeId
  const entity = entityStore.entities.find(e => e.id === ctxMenu.nodeId)
  descEditorText.value = entity?.description || ''
  showDescEditor.value = true
}

async function saveDescription() {
  if (!descEditorTargetId.value) return
  await entityStore.update(descEditorTargetId.value, { description: descEditorText.value })
  showDescEditor.value = false
  await entityStore.loadAll()
  rebuildGraph()
}

function ctxEditTags() {
  ctxMenu.show = false
  if (!ctxMenu.nodeId) return
  tagEditorTargetId.value = ctxMenu.nodeId
  const entity = entityStore.entities.find(e => e.id === ctxMenu.nodeId)
  tagEditorText.value = entity?.tags?.join('\n') || ''
  showTagEditor.value = true
}

async function saveTags() {
  if (!tagEditorTargetId.value) return
  const tags = tagEditorText.value.split('\n').map(s => s.trim()).filter(Boolean)
  await entityStore.update(tagEditorTargetId.value, { tags })
  showTagEditor.value = false
  await entityStore.loadAll()
  rebuildGraph()
}

function ctxToggleCollapse() {
  ctxMenu.show = false
  if (!ctxMenu.nodeId) return
  if (collapsedNodes.has(ctxMenu.nodeId)) collapsedNodes.delete(ctxMenu.nodeId)
  else collapsedNodes.add(ctxMenu.nodeId)
  rebuildGraph()
}

function ctxDeleteNode() {
  ctxMenu.show = false
  if (!ctxMenu.nodeId) return
  canvasNodes.value = canvasNodes.value.filter(n => n.id !== ctxMenu.nodeId)
  canvasEdges.value = canvasEdges.value.filter(e => e.source !== ctxMenu.nodeId && e.target !== ctxMenu.nodeId)
  const entity = entityStore.entities.find(e => e.id === ctxMenu.nodeId)
  if (entity) entityStore.remove(ctxMenu.nodeId)
}

function startEdgeConnect() {
  ctxMenu.show = false
  edgeConnecting.value = true
  connectSourceId.value = ctxMenu.nodeId
}

function editEdgeLabel() {
  ctxMenu.show = false
  if (!ctxMenu.edgeId) return
  const edge = canvasEdges.value.find(e => e.id === ctxMenu.edgeId)
  if (!edge) return
  inlineEditTarget.value = ctxMenu.edgeId
  inlineEditText.value = edge.relLabel || ''
  showInlineEdit.value = true
  nextTick(() => inlineInputRef.value?.focus())
}

function editEdgeType() {
  ctxMenu.show = false
  if (!ctxMenu.edgeId) return
  const edge = canvasEdges.value.find(e => e.id === ctxMenu.edgeId)
  if (!edge) return
  _edgeSrcId = edge.source
  _edgeTgtId = edge.target
  _relTypId = edge.relType
  availableRelationTypes.value = relationSchemaRegistry.getAll().map(r => ({ type: r.type, label: r.label || r.type }))
  showRelationPicker.value = true
}

function deleteEdge() {
  ctxMenu.show = false
  if (!ctxMenu.edgeId) return
  canvasEdges.value = canvasEdges.value.filter(e => e.id !== ctxMenu.edgeId)
}

function setEdgeStyle(style: string) {
  ctxMenu.show = false
  if (!ctxMenu.edgeId) return
  mindmapStore.setEdgeStyleOverride(ctxMenu.edgeId, { lineStyle: style as any })
  const edge = canvasEdges.value.find(e => e.id === ctxMenu.edgeId)
  if (edge) edge.curveStyle = style as any
}

function onPickColor(color: string) {
  showColorPicker.value = false
  if (!ctxMenu.nodeId) return
  const node = canvasNodes.value.find(n => n.id === ctxMenu.nodeId)
  if (color) {
    nodeCustomColors.set(ctxMenu.nodeId, color)
    if (node) node.customColor = color
  } else {
    nodeCustomColors.delete(ctxMenu.nodeId)
    if (node) node.customColor = ''
  }
}

function ctxSetCenter() {
  ctxMenu.show = false
  if (!ctxMenu.nodeId) return
  const node = canvasNodes.value.find(n => n.id === ctxMenu.nodeId)
  if (node) {
    node.type = 'center'
    node.width = 120
    node.height = 120
    node.isRoot = true
  }
}

function ctxSetCenterStyle(style: string) {
  ctxMenu.show = false
  if (!ctxMenu.nodeId) return
  const node = canvasNodes.value.find(n => n.id === ctxMenu.nodeId)
  if (node) node.centerStyle = style === 'default' ? '' : style
}

function ctxAddCenter() {
  ctxMenu.show = false
  const id = `center-${Date.now()}`
  canvasNodes.value.push({
    id, name: '中心', type: 'center',
    x: 400, y: 300, vx: 0, vy: 0, fx: 400, fy: 300,
    width: 120, height: 120,
    color: '#a78bfa', icon: 'star', label: '中心',
    tags: [], description: '', degree: 0, customColor: '',
    isRoot: true, isCollapsed: false, childCount: 0,
    centerStyle: '', textboxSize: '', textboxStyle: '',
    imageUrl: '', linkUrl: '', hidden: false,
    selected: false, highlighted: false, searchHighlight: false, sectionColor: '',
  })
}

function ctxAddTextbox() {
  ctxMenu.show = false
  const id = `textbox-${Date.now()}`
  canvasNodes.value.push({
    id, name: '文本框', type: 'textbox',
    x: 500, y: 350, vx: 0, vy: 0, fx: 500, fy: 350,
    width: 160, height: 80,
    color: '#eab308', icon: 'edit', label: '文本框',
    tags: [], description: '', degree: 0, customColor: '',
    isRoot: false, isCollapsed: false, childCount: 0,
    centerStyle: '', textboxSize: '', textboxStyle: '',
    imageUrl: '', linkUrl: '', hidden: false,
    selected: false, highlighted: false, searchHighlight: false, sectionColor: '',
  })
}

function ctxAddImage() {
  ctxMenu.show = false
  imageInputRef.value?.click()
}

function onImageFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const id = `image-${Date.now()}`
    canvasNodes.value.push({
      id, name: file.name, type: 'image',
      x: 500, y: 400, vx: 0, vy: 0, fx: 500, fy: 400,
      width: 150, height: 120,
      color: '#999', icon: 'image', label: '图片',
      tags: [], description: '', degree: 0, customColor: '',
      isRoot: false, isCollapsed: false, childCount: 0,
      centerStyle: '', textboxSize: '', textboxStyle: '',
      imageUrl: reader.result as string, linkUrl: '', hidden: false,
      selected: false, highlighted: false, searchHighlight: false, sectionColor: '',
    })
    input.value = ''
  }
  reader.readAsDataURL(file)
}

function ctxEditImage() {
  ctxMenu.show = false
  imageInputRef.value?.click()
}

function ctxAddNote() {
  ctxMenu.show = false
  const id = `note-${Date.now()}`
  canvasNodes.value.push({
    id, name: '备注', type: 'note',
    x: 500, y: 400, vx: 0, vy: 0, fx: 500, fy: 400,
    width: 140, height: 60,
    color: '#ca8a04', icon: 'outline', label: '备注',
    tags: [], description: '', degree: 0, customColor: '',
    isRoot: false, isCollapsed: false, childCount: 0,
    centerStyle: '', textboxSize: '', textboxStyle: '',
    imageUrl: '', linkUrl: '', hidden: false,
    selected: false, highlighted: false, searchHighlight: false, sectionColor: '',
  })
}

function ctxEditNoteContent() {
  ctxMenu.show = false
  ctxEditName()
}

function ctxAddLink() {
  ctxMenu.show = false
  const id = `link-${Date.now()}`
  canvasNodes.value.push({
    id, name: '链接', type: 'link',
    x: 500, y: 450, vx: 0, vy: 0, fx: 500, fy: 450,
    width: 140, height: 40,
    color: '#3b82f6', icon: 'link', label: '链接',
    tags: [], description: '', degree: 0, customColor: '',
    isRoot: false, isCollapsed: false, childCount: 0,
    centerStyle: '', textboxSize: '', textboxStyle: '',
    imageUrl: '', linkUrl: '', hidden: false,
    selected: false, highlighted: false, searchHighlight: false, sectionColor: '',
  })
}

function ctxAddGroup() {
  ctxMenu.show = false
  const id = `group-${Date.now()}`
  canvasNodes.value.push({
    id, name: '分组', type: 'group',
    x: 500, y: 400, vx: 0, vy: 0, fx: 500, fy: 400,
    width: 300, height: 200,
    color: '#999', icon: 'item', label: '分组',
    tags: [], description: '', degree: 0, customColor: '',
    isRoot: false, isCollapsed: false, childCount: 0,
    centerStyle: '', textboxSize: '', textboxStyle: '',
    imageUrl: '', linkUrl: '', hidden: false,
    selected: false, highlighted: false, searchHighlight: false, sectionColor: '',
  })
}

function ctxSetTextboxSize(size: string) {
  ctxMenu.show = false
  if (!ctxMenu.nodeId) return
  const node = canvasNodes.value.find(n => n.id === ctxMenu.nodeId)
  if (node) {
    node.textboxSize = size === 'medium' ? '' : size
    switch (size) {
      case 'small': node.width = 120; node.height = 60; break
      case 'large': node.width = 220; node.height = 110; break
      case 'wide': node.width = 280; node.height = 80; break
      default: node.width = 160; node.height = 80; break
    }
  }
}

function ctxSetTextboxStyle(style: string) {
  ctxMenu.show = false
  if (!ctxMenu.nodeId) return
  const node = canvasNodes.value.find(n => n.id === ctxMenu.nodeId)
  if (node) node.textboxStyle = style === 'default' ? '' : style
}

function deleteSelectedNodes() {
  for (const id of selectedNodes) {
    canvasNodes.value = canvasNodes.value.filter(n => n.id !== id)
    canvasEdges.value = canvasEdges.value.filter(e => e.source !== id && e.target !== id)
    const entity = entityStore.entities.find(e => e.id === id)
    if (entity) entityStore.remove(id)
  }
  selectedNodes.clear()
}

function clearNodeSelection() { selectedNodes.clear() }

function createSectionFromSelection() {
  if (selectedNodes.size === 0) return
  sectionMgr.createFromSelection([...selectedNodes])
  selectedNodes.clear()
}

function enterSelectedNode() {
  if (!selectedNodeId.value) return
  const node = canvasNodes.value.find(n => n.id === selectedNodeId.value)
  if (node && !['textbox', 'image', 'note', 'link', 'group', 'center', 'section'].includes(node.type)) {
    enterNestedNode(node.id)
  }
}

function focusSelectedNode() {
  if (!selectedNodeId.value) return
  const node = canvasNodes.value.find(n => n.id === selectedNodeId.value)
  if (node) {
    renderer.camera.value = { x: node.x, y: node.y, k: 1.5 }
  }
}

function navigateToEntity(entityId: string) {
  const node = canvasNodes.value.find(n => n.id === entityId)
  if (node) {
    renderer.camera.value = { x: node.x, y: node.y, k: 1.5 }
    selectedNodeId.value = entityId
  }
}

const POSITION_STORAGE_KEY = 'worldsmith-mindmap-positions'

function savePositions() {
  const positions: Record<string, { x: number; y: number }> = {}
  for (const n of canvasNodes.value) {
    positions[n.id] = { x: n.x, y: n.y }
  }
  try { localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(positions)) } catch { /* quota */ }
}

function loadPositions(): Record<string, { x: number; y: number }> {
  try {
    const raw = localStorage.getItem(POSITION_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

onMounted(async () => {
  await entityStore.loadAll()
  await relationStore.loadAll()
  await nextTick()
  buildCanvasData()
  renderer.init()
  canvasInteraction.bindEvents()
  applyLayout()
  renderer.setFreehandDrawFn((ctx, camera) => {
    freeDrawing.drawFreehandStrokes(ctx, camera, mindmapStore.currentRootId)
  })
  nextTick(() => renderer.fitView(canvasNodes.value))
})

onBeforeUnmount(() => {
  savePositions()
  forceLayout.stopSimulation()
  canvasInteraction.unbindEvents()
  renderer.destroy()
})

watch([graphNodes, graphEdges], () => {
  rebuildGraph()
}, { deep: true })

useAgentPluginBridge('mindmap', (event) => {
  console.log(`[Agent→${event.pluginId}] ${event.action}`, event.payload)
})
</script>

<style scoped>
.mindmap-view { display: flex; flex-direction: column; height: 100%; position: relative; overflow: hidden; }
.mm-canvas { flex: 1; min-height: 0; }
.mm-main-area { display: flex; flex: 1; min-height: 0; overflow: hidden; }
.hidden-input { display: none; }
.mm-ctx-menu { position: fixed; z-index: var(--z-detail); background: var(--card-bg); border: 1px solid var(--border-color); border-radius: var(--radius-lg); box-shadow: var(--shadow-xl); padding: 4px 0; min-width: 160px; }
.mm-ctx-item { display: block; width: 100%; padding: 6px 14px; text-align: left; border: none; background: none; font-size: var(--font-size-sm); cursor: pointer; color: var(--text-color); white-space: nowrap; transition: background var(--transition-fast); }
.mm-ctx-item:hover { background: var(--hover-bg); }
.mm-ctx-divider { height: 1px; background: var(--border-color); margin: 4px 0; }
.mm-ctx-submenu-wrap { position: relative; }
.mm-ctx-submenu { display: none; position: absolute; left: 100%; top: 0; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: var(--radius-lg); box-shadow: var(--shadow-xl); padding: 4px 0; min-width: 80px; }
.mm-ctx-submenu-wrap:hover .mm-ctx-submenu { display: block; }
.mm-connect-bar { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); background: var(--primary); color: white; padding: 6px 16px; border-radius: var(--radius-md); font-size: var(--font-size-sm); z-index: var(--z-detail); }
.mm-inline-edit { position: absolute; z-index: var(--z-detail); display: flex; gap: 4px; background: var(--card-bg); padding: 4px; border-radius: var(--radius-md); box-shadow: var(--shadow-lg); border: 1px solid var(--border-color); }
.mm-inline-input { border: none; border-bottom: 1px solid var(--border-color); background: transparent; color: var(--text-color); padding: 2px 6px; font-size: var(--font-size-sm); outline: none; }
.mm-inline-input:focus { border-bottom-color: var(--primary); }
.mm-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: var(--z-overlay); display: flex; align-items: center; justify-content: center; }
.mm-modal { background: var(--card-bg); border-radius: var(--radius-xl); padding: 20px; min-width: 280px; max-width: 480px; box-shadow: var(--shadow-xl); }
.mm-modal h4 { margin-bottom: 12px; }
.mm-modal-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 8px; margin-bottom: 12px; }
.mm-type-card { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 12px; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: none; cursor: pointer; font-size: var(--font-size-sm); transition: all var(--transition-fast); }
.mm-type-card:hover { border-color: var(--primary); background: var(--primary-light); }
.mm-textarea { width: 100%; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 8px; font-size: var(--font-size-sm); resize: vertical; background: var(--bg); color: var(--text-color); }
.mm-batch-bar { position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); background: var(--card-bg); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 6px 16px; box-shadow: var(--shadow-lg); display: flex; align-items: center; gap: 8px; font-size: var(--font-size-sm); z-index: 100; }
.mm-img-viewer { position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: calc(var(--z-overlay) + 1); display: flex; align-items: center; justify-content: center; cursor: pointer; }
.mm-img-viewer-img { max-width: 90vw; max-height: 90vh; border-radius: var(--radius-md); }
.mm-color-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; }
.mm-color-btn { width: 36px; height: 36px; border-radius: var(--radius-sm); border: 2px solid var(--border-color); cursor: pointer; }
.mm-color-input { width: 36px; height: 36px; border: none; cursor: pointer; padding: 0; border-radius: var(--radius-sm); }
.mm-btn { padding: 6px 12px; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: transparent; cursor: pointer; font-size: var(--font-size-sm); }
.mm-btn:hover { background: var(--hover-bg); }
.mm-btn.active { background: var(--primary-light); border-color: var(--primary); }
.mm-btn-sm { padding: 4px 8px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: transparent; cursor: pointer; font-size: var(--font-size-sm); }
.mm-btn-sm:hover { background: var(--hover-bg); }

.mm-freedraw-bar {
  position: absolute; top: 50px; left: 50%; transform: translateX(-50%);
  background: var(--card-bg); border: 1px solid var(--border-color);
  border-radius: var(--radius-lg); padding: 6px 12px;
  box-shadow: var(--shadow-xl); display: flex; align-items: center; gap: 6px;
  z-index: 100;
}
.mm-freedraw-label { font-size: var(--font-size-sm); color: var(--text-tertiary); white-space: nowrap; }
.mm-freedraw-color {
  width: 20px; height: 20px; border-radius: 50%; border: 2px solid transparent;
  cursor: pointer; transition: border-color 0.15s;
}
.mm-freedraw-color.active { border-color: #fff; }
.mm-freedraw-color:hover { border-color: rgba(255,255,255,0.5); }
.mm-freedraw-width {
  background: var(--bg); border: 1px solid var(--border-color); border-radius: var(--radius-sm);
  color: var(--text-color); font-size: var(--font-size-xs); padding: 2px 4px;
}
</style>
