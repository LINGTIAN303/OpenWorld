<template>
  <div
    class="sidebar"
    :class="{ collapsed: uiStore.sidebarCollapsed, dragging: isDragging, 'sidebar-drag-mode': isCustomView }"
    role="navigation"
    aria-label="视图导航"
    ref="sidebarRef"
    @wheel.prevent="onWheel"
    @pointerdown="onPointerDown"
  >
    <div class="sidebar-inner">
      <div class="sidebar-carousel" ref="carouselRef">
        <div
          v-for="item in carouselItems"
          :key="item.realIndex"
          class="sidebar-btn"
          :class="{ active: item.view.id === settledViewId, 'sidebar-draggable': isCustomView }"
          :style="getItemStyle(item.offset)"
          :title="item.view.label"
          :data-offset="item.offset"
          :data-view-id="item.view.id"
          :draggable="isCustomView && item.view.id !== 'custom'"
          @dragstart="onSidebarDragStart(item.view, $event)"
        >
          <WsIcon v-if="hasIcon(item.view.icon)" :name="item.view.icon" size="md" class="sidebar-icon" />
          <span v-else class="sidebar-icon">{{ item.view.icon }}</span>
          <span v-if="!uiStore.sidebarCollapsed" class="sidebar-label">{{ item.view.label }}</span>
          <span v-if="!uiStore.sidebarCollapsed && entityCount(item.view.pluginId) > 0" class="sidebar-count">{{ entityCount(item.view.pluginId) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useUIStore } from '../stores/uiStore'
import { usePluginStore } from '@worldsmith/entity-core'
import { useSettingsStore } from '../stores/settingsStore'
import { useEntityStore, entitySchemaRegistry } from '@worldsmith/entity-core'
import type { PluginView } from '@worldsmith/entity-core/types'
import WsIcon from './WsIcon.vue'
import { hasIcon } from '../assets/iconRegistry'

const uiStore = useUIStore()
const pluginStore = usePluginStore()
const settingsStore = useSettingsStore()
const entityStore = useEntityStore()

const sidebarRef = ref<HTMLElement | null>(null)
const carouselRef = ref<HTMLElement | null>(null)

let pos = 0
let vel = 0
const renderTick = ref(0)
const isDragging = ref(false)

const isCustomView = computed(() => uiStore.currentView === 'custom')

function onSidebarDragStart(view: { id: string; label: string; icon: string }, e: DragEvent) {
  if (!isCustomView.value) return
  e.dataTransfer!.setData('application/worldsmith-view-id', view.id)
  e.dataTransfer!.setData('application/worldsmith-view-label', view.label)
  e.dataTransfer!.setData('application/worldsmith-view-icon', view.icon)
  e.dataTransfer!.effectAllowed = 'copy'
}

const FRICTION = 0.92
const IMPULSE = 0.32
const SNAP_SPRING = 0.22
const SNAP_DAMPING = 0.78
const SNAP_VEL_THRESHOLD = 0.15
const SETTLE_THRESHOLD = 0.0005
const DRAG_SENSITIVITY = 0.028
const FLING_MULTIPLIER = 6.5

const FALLBACK_TYPE_MAP: Record<string, string[]> = {
  'official.characters': ['character'],
  'official.regions': ['region'],
  'official.timeline': ['event'],
  'official.organizations': ['organization'],
  'official.concepts': ['concept'],
  'official.items': ['item'],
  'official.buildings': ['building'],
  'official.species': ['species'],
  'official.magic': ['magic'],
  'official.outline': ['outline_node'],
  'official.languages': ['language'],
  'official.culture': ['culture'],
  'official.conflict': ['conflict'],
  'official.inspiration': ['inspiration'],
  'official.plants': ['plant'],
  'official.combat_stats': ['combat_stat'],
  'official.weapons': ['weapon'],
  'official.apparel': ['apparel'],
  'official.tactical-board': ['tactical-board'],
  'official.notebook': ['notebook'],
  'official.manuscript': ['manuscript'],
  'official.workflow': ['workflow', 'workflow_run'],
}

const pluginEntityTypes = computed(() => {
  const map = new Map<string, string[]>()
  for (const schema of entitySchemaRegistry.getAll()) {
    if (schema.pluginId) {
      const list = map.get(schema.pluginId) || []
      list.push(schema.type)
      map.set(schema.pluginId, list)
    }
  }
  for (const [pid, types] of Object.entries(FALLBACK_TYPE_MAP)) {
    if (!map.has(pid)) {
      map.set(pid, types)
    }
  }
  return map
})

function entityCount(pluginId: string | undefined): number {
  if (!pluginId) return 0
  const types = pluginEntityTypes.value.get(pluginId)
  if (!types || types.length === 0) return 0
  let total = 0
  for (const t of types) {
    total += entityStore.allTypeCounts.get(t) || 0
  }
  return total
}

const sortedViews = computed(() => {
  const order = uiStore.sidebarOrder
  return pluginStore.views
    .filter(v => !v.pluginId || settingsStore.isActive(v.pluginId))
    .slice()
    .sort((a, b) => {
      const ia = order.indexOf(a.id)
      const ib = order.indexOf(b.id)
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
    })
})

const centerIdx = computed(() => {
  void renderTick.value
  return Math.round(pos)
})

const settledViewId = computed(() => {
  const views = sortedViews.value
  if (views.length === 0) return ''
  const idx = ((centerIdx.value % views.length) + views.length) % views.length
  return views[idx].id
})

interface CarouselItem {
  view: PluginView
  offset: number
  realIndex: number
}

const carouselItems = computed<CarouselItem[]>(() => {
  void renderTick.value
  const views = sortedViews.value
  const n = views.length
  if (n === 0) return []

  const center = Math.round(pos)
  const items: CarouselItem[] = []
  const seen = new Set<number>()
  const half = Math.min(Math.ceil(n / 2), 8)

  for (let offset = -half; offset <= half; offset++) {
    const realIdx = ((center + offset) % n + n) % n
    if (seen.has(realIdx)) continue
    seen.add(realIdx)
    items.push({
      view: views[realIdx],
      offset,
      realIndex: realIdx,
    })
  }

  return items
})

function getItemStyle(offset: number) {
  void renderTick.value
  const center = Math.round(pos)
  const fractional = pos - center
  const displayOffset = offset - fractional
  const absOffset = Math.abs(displayOffset)
  const opacity = Math.max(0, 1 - absOffset * 0.13)
  const scale = Math.max(0.6, 1 - absOffset * 0.04)

  return {
    opacity,
    transform: `scale(${scale})`,
    zIndex: 20 - Math.floor(absOffset),
  }
}

let physicsRaf: number | null = null
let isRunning = false
let lastSettledIdx = 0

function startPhysics() {
  if (isRunning) return
  isRunning = true
  tick()
}

function tick() {
  if (springTarget !== null) {
    const diff = springTarget - pos
    vel = vel * 0.72 + diff * 0.18
    pos += vel

    if (Math.abs(diff) < SETTLE_THRESHOLD && Math.abs(vel) < SETTLE_THRESHOLD) {
      pos = springTarget
      vel = 0
      springTarget = null
      isRunning = false
      physicsRaf = null
      renderTick.value++
      checkViewSwitch()
      return
    }
  } else {
    pos += vel

    if (Math.abs(vel) < SNAP_VEL_THRESHOLD) {
      const target = Math.round(pos)
      const diff = target - pos
      vel = vel * SNAP_DAMPING + diff * SNAP_SPRING

      if (Math.abs(diff) < SETTLE_THRESHOLD && Math.abs(vel) < SETTLE_THRESHOLD) {
        pos = target
        vel = 0
        isRunning = false
        physicsRaf = null
        renderTick.value++
        checkViewSwitch()
        return
      }
    } else {
      vel *= FRICTION
    }
  }

  renderTick.value++
  checkViewSwitch()
  physicsRaf = requestAnimationFrame(tick)
}

function checkViewSwitch() {
  const current = Math.round(pos)
  if (current !== lastSettledIdx) {
    lastSettledIdx = current
    const views = sortedViews.value
    if (views.length === 0) return
    const idx = ((current % views.length) + views.length) % views.length
    const view = views[idx]
    if (uiStore.currentView !== view.id) {
      uiStore.setView(view.id)
      uiStore.viewComponent = view.component
    }
  }
}

function onWheel(e: WheelEvent) {
  const views = sortedViews.value
  if (views.length === 0) return

  const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX
  const direction = delta > 0 ? 1 : -1

  springTarget = null
  vel += direction * IMPULSE
  startPhysics()
}

let dragStartY = 0
let dragStartPos = 0
let dragLastY = 0
let dragLastTime = 0
let dragVelSamples: number[] = []
let dragMoved = false
let pointerTarget: EventTarget | null = null
let springTarget: number | null = null

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  if (isCustomView.value) return
  e.preventDefault()

  if (physicsRaf !== null) {
    cancelAnimationFrame(physicsRaf)
    physicsRaf = null
    isRunning = false
  }
  vel = 0

  dragStartY = e.clientY
  dragStartPos = pos
  dragLastY = e.clientY
  dragLastTime = performance.now()
  dragVelSamples = []
  dragMoved = false
  pointerTarget = e.target
  springTarget = null
  isDragging.value = true

  const el = e.currentTarget as HTMLElement
  el.setPointerCapture(e.pointerId)

  el.addEventListener('pointermove', onPointerMove)
  el.addEventListener('pointerup', onPointerUp)
  el.addEventListener('pointercancel', onPointerUp)
}

function onPointerMove(e: PointerEvent) {
  const dy = e.clientY - dragLastY
  const now = performance.now()
  const dt = now - dragLastTime

  if (dt > 0) {
    dragVelSamples.push(dy / dt)
    if (dragVelSamples.length > 5) dragVelSamples.shift()
  }

  const totalDy = e.clientY - dragStartY
  if (Math.abs(totalDy) > 25) dragMoved = true

  pos = dragStartPos - dy * DRAG_SENSITIVITY
  dragLastY = e.clientY
  dragLastTime = now

  renderTick.value++
  checkViewSwitch()
}

function onPointerUp(e: PointerEvent) {
  isDragging.value = false

  const el = e.currentTarget as HTMLElement
  el.releasePointerCapture(e.pointerId)
  el.removeEventListener('pointermove', onPointerMove)
  el.removeEventListener('pointerup', onPointerUp)
  el.removeEventListener('pointercancel', onPointerUp)

  if (!dragMoved) {
    const btn = (pointerTarget as HTMLElement)?.closest('.sidebar-btn') as HTMLElement | null
    if (btn) {
      const offset = parseInt(btn.dataset.offset || '0', 10)
      if (offset !== 0) {
        springTarget = Math.round(pos) + offset
        startPhysics()
      }
    }
    pointerTarget = null
    return
  }

  let avgVel = 0
  if (dragVelSamples.length > 0) {
    const recent = dragVelSamples.slice(-3)
    avgVel = recent.reduce((a, b) => a + b, 0) / recent.length
  }

  springTarget = null
  vel = -avgVel * FLING_MULTIPLIER

  if (Math.abs(vel) < 0.05) {
    vel = 0
    const target = Math.round(pos)
    const diff = target - pos
    if (Math.abs(diff) > SETTLE_THRESHOLD) {
      vel = diff * 0.45
    }
  }

  startPhysics()
}

onMounted(() => {
  const views = sortedViews.value
  const currentId = uiStore.currentView
  const idx = views.findIndex(v => v.id === currentId)
  if (idx !== -1) {
    pos = idx
    lastSettledIdx = idx
  } else if (views.length > 0) {
    pos = 0
    lastSettledIdx = 0
    const view = views[0]
    uiStore.setView(view.id)
    uiStore.viewComponent = view.component
  }
  renderTick.value++
})

watch(() => sortedViews.value.length, (newLen, oldLen) => {
  if (newLen !== oldLen) {
    const views = sortedViews.value
    if (views.length === 0) return
    const currentId = uiStore.currentView
    const idx = views.findIndex(v => v.id === currentId)
    if (idx !== -1) {
      pos = idx
      lastSettledIdx = idx
    }
    renderTick.value++
  }
})

watch(() => uiStore.currentView, (newId) => {
  if (!newId) return
  const views = sortedViews.value
  const idx = views.findIndex(v => v.id === newId)
  if (idx !== -1 && idx !== lastSettledIdx) {
    pos = idx
    lastSettledIdx = idx
    vel = 0
    springTarget = null
    renderTick.value++
  }
})

onBeforeUnmount(() => {
  isRunning = false
  if (physicsRaf !== null) {
    cancelAnimationFrame(physicsRaf)
    physicsRaf = null
  }
})
</script>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  background: transparent;
  transition: width 0.2s ease;
  overflow: hidden;
  position: relative;
}
.sidebar:not(.collapsed) {
  width: var(--layout-sidebar-width);
}
.sidebar.collapsed {
  width: var(--layout-sidebar-collapsed-width);
}
.sidebar.dragging {
  cursor: grabbing;
}
.sidebar.dragging .sidebar-btn {
  cursor: grabbing;
  pointer-events: none;
}
.sidebar-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
  overflow: hidden;
}
.sidebar-carousel {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  height: 100%;
  gap: 2px;
  padding: 4px 6px;
  position: relative;
}
.sidebar-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border: none;
  background: transparent;
  cursor: grab;
  color: var(--text-color);
  font-size: var(--font-size-base);
  transition: background 0.15s ease;
  white-space: nowrap;
  position: relative;
  user-select: none;
  border-radius: 6px;
  flex-shrink: 0;
}
.sidebar-btn:hover {
  background: var(--hover-bg);
}
.sidebar-btn.active {
  background: var(--active-bg);
  font-weight: var(--font-weight-semibold);
}
.sidebar-btn.sidebar-draggable {
  cursor: grab;
}
.sidebar-btn.sidebar-draggable:active {
  cursor: grabbing;
}
.sidebar-drag-mode .sidebar-btn.sidebar-draggable:hover {
  background: var(--hover-bg);
  outline: 1px dashed var(--primary);
  outline-offset: -1px;
}
.sidebar-icon {
  font-size: var(--font-size-xl);
  width: 24px;
  text-align: center;
  flex-shrink: 0;
}
.sidebar-label {
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}
.sidebar-count {
  font-size: var(--font-size-xs);
  background: var(--bg-tertiary);
  color: var(--text-tertiary);
  border-radius: 8px;
  padding: 1px 6px;
  min-width: 18px;
  text-align: center;
  margin-left: auto;
  flex-shrink: 0;
  line-height: 16px;
}
</style>
