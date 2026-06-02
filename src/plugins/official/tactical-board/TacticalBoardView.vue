<template>
  <div class="tb-view">
    <div class="tb-toolbar">
      <div class="tb-toolbar-group">
        <span class="tb-toolbar-label">网格</span>
        <CustomDropdown v-model="gridType" :options="gridTypeOptions" @update:modelValue="rebuildBoard" />
      </div>
      <div class="tb-toolbar-group">
        <span class="tb-toolbar-label">规格</span>
        <CustomDropdown v-model="gridSize" :options="gridSizeOptions" @update:modelValue="rebuildBoard" />
      </div>
      <div class="tb-toolbar-sep"></div>
      <template v-if="battlePhase === 'deployment'">
        <div class="tb-toolbar-group">
          <span class="tb-toolbar-label">地形笔</span>
          <CustomDropdown v-model="terrainBrush" :options="terrainOptions" />
        </div>
        <div class="tb-toolbar-group">
          <span class="tb-toolbar-label">阵营</span>
          <CustomDropdown v-model="deployTeam" :options="teamOptions" />
        </div>
        <div class="tb-toolbar-sep"></div>
        <button class="tb-btn tb-btn-start" @click="onStartBattle" :disabled="units.length === 0">
          <WsIcon name="sword" size="xs" /> 开始战斗
        </button>
      </template>
      <template v-else-if="battlePhase === 'battle'">
        <span class="tb-current-info" v-if="currentUnit">
          <span class="tb-current-dot" :class="'tb-team-bg-' + currentUnit.team"></span>
          {{ currentUnit.name }} 的回合
          <span v-if="aiUnitActive" class="tb-ai-badge">AI</span>
        </span>
        <span class="tb-action-hint" v-if="actionState">
          {{ actionHint }}
        </span>
        <button class="tb-btn" @click="cancelAction" v-if="actionState">取消</button>
        <button class="tb-btn tb-btn-end" @click="endTurn">结束回合</button>
      </template>
      <template v-else>
        <span class="tb-victory-text"><WsIcon name="star" size="xs" /> {{ victoryLabel }} 获胜！</span>
        <button class="tb-btn" @click="resetBattle">重新部署</button>
      </template>
      <div class="tb-toolbar-spacer"></div>
      <button class="tb-btn" :class="{ active: awareness.mode.value === 'influence' }"
        @click="onToggleAwareness('influence')" title="势力范围">
        <WsIcon name="target" size="xs" /> 势力
      </button>
      <button class="tb-btn" :class="{ active: awareness.mode.value === 'threat' }"
        @click="onToggleAwareness('threat')" title="威胁区域">
        <WsIcon name="warning" size="xs" /> 威胁
      </button>
      <button class="tb-btn" :class="{ active: awareness.mode.value === 'supply' }"
        @click="onToggleAwareness('supply')" title="补给线">
        <WsIcon name="arrow-left-right" size="xs" /> 补给
      </button>
      <span class="tb-phase" :class="'tb-phase-' + battlePhase">{{ phaseLabel }}</span>
    </div>

    <div class="tb-main">
      <div class="tb-canvas-area">
        <BoardCanvas
          v-if="engineReady"
          :gridType="gridType as 'square' | 'hex'"
          :gridWidth="Number(gridSize)"
          :gridHeight="Number(gridSize)"
          :terrain="terrain"
          :units="units"
          :highlights="activeHighlights"
          :selectedCell="selectedCell"
          :awarenessCells="awareness.cells.value"
          :awarenessMode="awareness.mode.value"
          @cellClick="onCellClick"
          @cellRightClick="onCellRightClick"
          @cellHover="onCellHover"
        />
        <div v-else class="tb-loading">
          <div class="tb-spinner"></div>
          <span>{{ engineError || '正在初始化...' }}</span>
        </div>
      </div>

      <div class="tb-sidebar">
        <UnitPanel
          :unit="selectedUnitDetail"
          :showActions="battlePhase === 'battle' && isCurrentUnitSelected && !aiUnitActive"
          :showDeployActions="battlePhase === 'deployment' && !!selectedUnitDetail"
          :disabled="!!actionState"
          @move="beginMoveAction"
          @attack="beginAttackAction"
          @wait="waitAction"
          @remove="removeSelectedUnit"
        />

        <div class="tb-panel" v-if="hoveredInfo">
          <div class="tb-panel-title">格子信息</div>
          <div class="tb-panel-row"><span class="tb-label">坐标</span><span>{{ hoveredInfo.coord }}</span></div>
          <div class="tb-panel-row"><span class="tb-label">地形</span><span>{{ hoveredInfo.terrainLabel }}</span></div>
          <div class="tb-panel-row" v-if="hoveredInfo.unit"><span class="tb-label">单位</span><span>{{ hoveredInfo.unit.name }}</span></div>
          <div class="tb-panel-row" v-if="hoveredInfo.unit"><span class="tb-label">HP</span><span>{{ hoveredInfo.unit.hp }}/{{ hoveredInfo.unit.max_hp }}</span></div>
        </div>

        <DeployPanel v-if="battlePhase === 'deployment'"
          :entities="es.entities ?? []"
          :placedIds="placedEntityIds"
          @selectEntity="onDeployEntity"
          @quickDeploy="onQuickDeploy"
          @save="onSaveBoard"
          @load="onLoadBoard"
        />

        <div class="tb-panel" v-if="battlePhase !== 'deployment' && combatStatsSummary">
          <div class="tb-panel-title">战斗统计</div>
          <div class="tb-panel-row"><span class="tb-label">攻击次数</span><span>{{ combatStatsSummary.totalAttacks }}</span></div>
          <div class="tb-panel-row"><span class="tb-label">总伤害</span><span>{{ combatStatsSummary.totalDamage }}</span></div>
          <div class="tb-panel-row"><span class="tb-label">暴击次数</span><span>{{ combatStatsSummary.totalCriticals }}</span></div>
          <button class="tb-btn tb-btn-sm" @click="onSaveBoard" style="margin-top:6px;width:100%">保存棋盘</button>
        </div>

        <AIControl v-if="battlePhase === 'battle'"
          :isRunning="ai.aiRunning.value"
          :currentSpeed="ai.aiSpeed.value"
          :speeds="ai.AI_SPEEDS"
          :stepCount="ai.aiStepCount.value"
          :canAct="battlePhase === 'battle'"
          :allyAI="ai.isAIControlled('ally')"
          :enemyAI="ai.isAIControlled('enemy')"
          :neutralAI="ai.isAIControlled('neutral')"
          @toggleAI="ai.toggleAI"
          @setSpeed="ai.setAISpeed"
          @singleStep="ai.runAISingleStep"
          @toggleAuto="onToggleAutoAI"
          @disableAll="ai.disableAllAI"
        />

        <AwarenessPanel
          :currentMode="awareness.mode.value"
          :modes="awareness.awarenessModes"
          @toggleMode="onToggleAwareness"
          @refresh="awareness.refresh"
        />

        <div class="tb-panel">
          <div class="tb-panel-title">单位列表 ({{ units.length }})</div>
          <div class="tb-unit-list">
            <div v-for="u in units" :key="u.id" class="tb-unit-item"
              :class="['tb-team-border-' + u.team, { 'tb-current': battlePhase === 'battle' && currentUnit && u.x === currentUnit.x && u.y === currentUnit.y, 'tb-acted': u.acted }]"
              @click="selectUnitAt(u.x, u.y)">
              <span class="tb-unit-dot" :class="'tb-team-bg-' + u.team"></span>
              <span class="tb-unit-name">{{ u.name }}</span>
              <span class="tb-unit-hp">{{ u.hp }}/{{ u.max_hp }}</span>
            </div>
            <WsEmpty v-if="units.length === 0" preset="no-data" description="暂无单位，点击棋盘放置" />
          </div>
        </div>

        <div class="tb-log-panel">
          <BattleLog :log="battleLog" />
        </div>
      </div>
    </div>

    <div class="tb-status">
      <span>回合 {{ currentTurn }}</span>
      <span class="tb-status-sep">|</span>
      <span>单位 {{ units.length }}</span>
      <span class="tb-status-sep">|</span>
      <span>{{ gridType === 'hex' ? '六边形' : '方形' }} {{ gridSize }}×{{ gridSize }}</span>
      <span class="tb-status-sep">|</span>
      <span class="tb-status-hint">{{ statusHint }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useEntityStore } from '@worldsmith/entity-core'
import WsEmpty from '../../../ui/WsEmpty.vue'
import WsIcon from '../../../ui/WsIcon.vue'
import { CustomDropdown } from '@worldsmith/ui-kit'
import BoardCanvas from './components/BoardCanvas.vue'
import UnitPanel from './components/UnitPanel.vue'
import BattleLog from './components/BattleLog.vue'
import AIControl from './components/AIControl.vue'
import AwarenessPanel from './components/AwarenessPanel.vue'
import DeployPanel from './components/DeployPanel.vue'
import { useTacticalEngine, type WasmBattleUnit } from './composables/useTacticalEngine'
import { useBattleManager, type BattlePhase } from './composables/useBattleManager'
import { useAIController } from './composables/useAIController'
import { useAwareness, type AwarenessMode } from './composables/useAwareness'
import { useBoardPersistence } from './composables/useBoardPersistence'
import type { UnitRenderData, HighlightCell } from './composables/boardDraw'
import { useAgentPluginBridge } from '../../../composables/useAgentPluginBridge'

const es = useEntityStore()
const { engine, loading, error: engineError, createEngine } = useTacticalEngine()

const gridType = ref('square')
const gridTypeOptions = [
  { value: 'square', label: '方形网格' },
  { value: 'hex', label: '六边形网格' },
]

const gridSize = ref('12')
const gridSizeOptions = Array.from({ length: 26 }, (_, i) => {
  const s = i + 5
  return { value: String(s), label: `${s}×${s}` }
})

const terrainBrush = ref('none')
const terrainOptions = [
  { value: 'none', label: '无（选择模式）' },
  { value: 'plain', label: '平原' },
  { value: 'forest', label: '森林' },
  { value: 'mountain', label: '山地' },
  { value: 'water', label: '水域' },
  { value: 'desert', label: '沙漠' },
  { value: 'wall', label: '城墙' },
]

const deployTeam = ref('ally')
const teamOptions = [
  { value: 'ally', label: '友方 (蓝)' },
  { value: 'enemy', label: '敌方 (红)' },
  { value: 'neutral', label: '中立 (灰)' },
]

const terrain = ref<string[][]>([])
const units = ref<UnitRenderData[]>([])
const selectedCell = ref<{ x: number; y: number } | null>(null)
const hoveredCell = ref<{ x: number; y: number } | null>(null)

const engineReady = computed(() => !!engine.value && !loading.value)

function refreshUnits() {
  if (!engine.value) return
  try {
    const raw = engine.value.get_all_units() as WasmBattleUnit[]
    units.value = (raw || []).map(u => ({
      id: u.id, name: u.name, team: u.team,
      hp: u.hp, max_hp: u.max_hp, acted: u.acted,
      x: u.x, y: u.y,
    }))
  } catch (e) {
    console.warn('[TacticalBoard] get_all_units failed', e)
  }
  awareness.refresh()
}

const battle = useBattleManager(engine, units, refreshUnits)

const ai = useAIController(
  engine,
  computed(() => battle.phase.value),
  computed(() => battle.currentUnit.value),
  battle.addLog,
  refreshUnits,
  battle.beginMoveAction,
  battle.beginAttackAction,
  battle.executeAction,
  battle.waitAction,
)

const awareness = useAwareness(engine)

const persistence = useBoardPersistence(
  engine,
  gridType,
  gridSize,
  terrain,
  computed(() => battle.phase.value),
  computed(() => battle.currentTurn.value),
)

const battlePhase = computed(() => battle.phase.value)
const currentTurn = computed(() => battle.currentTurn.value)
const currentUnit = computed(() => battle.currentUnit.value)
const actionState = computed(() => battle.actionState.value)
const battleLog = computed(() => battle.battleLog.value)

watch(battleLog, (newLog, oldLog) => {
  if (!oldLog || newLog.length <= oldLog.length) return
  const newEntries = newLog.slice(oldLog.length)
  for (const entry of newEntries) {
    if (entry.type === 'attack') {
      const dmgMatch = entry.text.match(/(\d+) 伤害/)
      const critMatch = entry.text.includes('暴击')
      const deadMatch = entry.text.match('被击败')
      if (dmgMatch) {
        persistence.recordAttack(
          Number(dmgMatch[1]),
          critMatch,
          deadMatch ? 'unknown' : null,
        )
      }
    }
  }
}, { deep: true })

const TERRAIN_LABELS: Record<string, string> = {
  plain: '平原', forest: '森林', mountain: '山地',
  water: '水域', desert: '沙漠', wall: '城墙',
}

const phaseLabel = computed(() => {
  if (battlePhase.value === 'deployment') return '部署阶段'
  if (battlePhase.value === 'victory') return '战斗结束'
  return '战斗阶段'
})

const victoryLabel = computed(() => {
  const t = battle.victoryTeam.value
  return t === 'ally' ? '友方' : t === 'enemy' ? '敌方' : '中立'
})

const actionHint = computed(() => {
  if (!actionState.value) return ''
  if (actionState.value.type === 'move') return '点击蓝色区域移动'
  if (actionState.value.type === 'attack') return '点击红色区域攻击'
  if (actionState.value.type === 'skill') return '选择技能目标'
  return ''
})

const statusHint = computed(() => {
  if (battlePhase.value === 'deployment') return '左键放置 | 右键移除 | 拖拽平移 | 滚轮缩放'
  if (battlePhase.value === 'victory') return '战斗已结束'
  return '选择行动 | 拖拽平移 | 滚轮缩放'
})

const isCurrentUnitSelected = computed(() => {
  if (!currentUnit.value || !selectedCell.value) return false
  return currentUnit.value.x === selectedCell.value.x && currentUnit.value.y === selectedCell.value.y
})

const aiUnitActive = computed(() => {
  if (!currentUnit.value) return false
  return ai.isAIControlled(currentUnit.value.team)
})

const placedEntityIds = computed(() => new Set(units.value.map(u => u.id)))

const combatStatsSummary = computed(() => persistence.combatStats.value)

const selectedUnitDetail = computed<WasmBattleUnit | null>(() => {
  if (!selectedCell.value || !engine.value) return null
  try {
    return engine.value.get_unit_at(selectedCell.value.x, selectedCell.value.y) as WasmBattleUnit | null
  } catch { return null }
})

const hoveredInfo = computed(() => {
  if (!hoveredCell.value) return null
  const { x, y } = hoveredCell.value
  const size = Number(gridSize.value)
  if (x < 0 || x >= size || y < 0 || y >= size) return null
  const t = terrain.value[y]?.[x] || 'plain'
  const unit = units.value.find(u => u.x === x && u.y === y)
  return {
    coord: `${String.fromCharCode(65 + x)}${y + 1}`,
    terrainLabel: TERRAIN_LABELS[t] || t,
    unit: unit || null,
  }
})

const activeHighlights = computed<HighlightCell[]>(() => {
  if (battlePhase.value === 'battle' && actionState.value) {
    return battle.currentHighlights.value
  }
  return []
})

function initTerrain(w: number, h: number) {
  terrain.value = Array.from({ length: h }, () => Array(w).fill('plain'))
}

async function rebuildBoard() {
  const size = Number(gridSize.value)
  initTerrain(size, size)
  units.value = []
  selectedCell.value = null
  battle.resetBattle()

  try {
    await createEngine(gridType.value, size, size)
    syncTerrainToEngine()
  } catch (e) {
    console.error('[TacticalBoard] rebuild failed', e)
  }
}

function syncTerrainToEngine() {
  if (!engine.value) return
  for (let r = 0; r < terrain.value.length; r++) {
    for (let c = 0; c < terrain.value[r].length; c++) {
      try { engine.value.set_terrain(c, r, terrain.value[r][c]) } catch {}
    }
  }
}

function onCellClick(x: number, y: number, evt: MouseEvent) {
  if (battlePhase.value === 'deployment') {
    if (terrainBrush.value !== 'none') {
      paintTerrain(x, y)
      return
    }
    selectedCell.value = { x, y }
    const hasUnit = units.value.some(u => u.x === x && u.y === y)
    if (!hasUnit) deployUnit(x, y)
    return
  }

  if (battlePhase.value === 'battle') {
    if (actionState.value) {
      const executed = battle.executeAction(x, y)
      if (!executed) {
        battle.cancelAction()
      }
      return
    }
    selectedCell.value = { x, y }
    return
  }
}

function onCellRightClick(x: number, y: number) {
  if (battlePhase.value === 'deployment') {
    const hasUnit = units.value.some(u => u.x === x && u.y === y)
    if (hasUnit && engine.value) {
      try { engine.value.remove_unit(x, y); refreshUnits() } catch {}
    } else if (terrainBrush.value !== 'none') {
      terrain.value[y][x] = 'plain'
      try { engine.value?.set_terrain(x, y, 'plain') } catch {}
    }
    if (selectedCell.value?.x === x && selectedCell.value?.y === y) selectedCell.value = null
    return
  }

  if (battlePhase.value === 'battle' && actionState.value) {
    battle.cancelAction()
  }
}

function onCellHover(x: number | null, y: number | null) {
  hoveredCell.value = (x !== null && y !== null) ? { x, y } : null
}

function paintTerrain(x: number, y: number) {
  const brush = terrainBrush.value
  if (brush === 'none') return
  if (y >= terrain.value.length || x >= terrain.value[0].length) return
  terrain.value[y][x] = brush
  try { engine.value?.set_terrain(x, y, brush) } catch {}
}

function deployUnit(x: number, y: number) {
  if (!engine.value) return
  const allEntities = es.entities ?? []
  if (allEntities.length === 0) return
  const placed = new Set(units.value.map(u => u.id))
  const available = allEntities.filter(e => !placed.has(e.id))
  if (available.length === 0) return
  const entity = available[0]
  const team = deployTeam.value
  try {
    engine.value.place_unit(entity.id, entity.name, team, x, y, 100, 100, 50, 50, 10, 5, 5, 3, 1)
    refreshUnits()
    selectedCell.value = { x, y }
  } catch (e) {
    console.warn('[TacticalBoard] place_unit failed', e)
  }
}

function removeSelectedUnit() {
  if (!selectedCell.value || !engine.value) return
  try { engine.value.remove_unit(selectedCell.value.x, selectedCell.value.y); refreshUnits() } catch {}
  selectedCell.value = null
}

function selectUnitAt(x: number, y: number) {
  selectedCell.value = { x, y }
}

function onStartBattle() {
  battle.startBattle()
  if (currentUnit.value) {
    selectedCell.value = { x: currentUnit.value.x, y: currentUnit.value.y }
  }
}

function beginMoveAction() { if (!aiUnitActive.value) battle.beginMoveAction() }
function beginAttackAction() { if (!aiUnitActive.value) battle.beginAttackAction() }
function cancelAction() { battle.cancelAction() }
function waitAction() { if (!aiUnitActive.value) battle.waitAction() }
function endTurn() { battle.endTurn() }
function resetBattle() { ai.resetAI(); rebuildBoard() }

function onToggleAutoAI() {
  if (ai.aiRunning.value) {
    ai.stopAI()
  } else {
    const hasAny = ai.isAIControlled('ally') || ai.isAIControlled('enemy') || ai.isAIControlled('neutral')
    if (!hasAny) {
      ai.toggleAI('enemy')
    }
    ai.startAI()
  }
}

function onToggleAwareness(m: AwarenessMode) {
  awareness.toggleMode(m)
}

function onDeployEntity(entity: { id: string; name: string; type?: string }, team: string, stats: { hp: number; attack: number; defense: number; speed: number; moveRange: number; attackRange: number }) {
  if (!engine.value) return
  if (entity.type === 'tactical-board') return
  const size = Number(gridSize.value)
  const positions: { x: number; y: number }[] = []
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!units.value.some(u => u.x === x && u.y === y)) {
        positions.push({ x, y })
      }
    }
  }
  if (positions.length === 0) return

  if (team === 'ally') {
    positions.sort((a, b) => a.y - b.y || a.x - b.x)
  } else if (team === 'enemy') {
    positions.sort((a, b) => b.y - a.y || b.x - a.x)
  }

  const pos = positions[0]
  try {
    engine.value.place_unit(
      entity.id, entity.name, team,
      pos.x, pos.y,
      stats.hp, stats.hp, 50, 50,
      stats.attack, stats.defense, stats.speed,
      stats.moveRange, stats.attackRange,
    )
    refreshUnits()
    selectedCell.value = pos
  } catch (e) {
    console.warn('[TacticalBoard] deploy failed', e)
  }
}

function onQuickDeploy(team: string, stats: { hp: number; attack: number; defense: number; speed: number; moveRange: number; attackRange: number }) {
  const allEntities = es.entities ?? []
  const available = allEntities.filter(e => !placedEntityIds.value.has(e.id) && e.type !== 'tactical-board')
  if (available.length === 0) return
  onDeployEntity(available[0], team, stats)
}

async function onSaveBoard() {
  const allEntities = es.entities ?? []
  let boardEntity = allEntities.find(e => e.type === 'tactical-board')
  if (!boardEntity) {
    const id = `tactical-board-${Date.now()}`
    await es.add({
      id,
      type: 'tactical-board',
      name: `战术棋盘 ${gridSize.value}×${gridSize.value}`,
      description: '',
      properties: {},
      tags: ['tactical-board'],
      createdAt: '',
      updatedAt: '',
    })
    await es.loadAll()
    boardEntity = es.entities?.find(e => e.id === id)
  }
  if (boardEntity) {
    await persistence.saveToEntity(boardEntity.id)
  }
}

async function onLoadBoard() {
  const allEntities = es.entities ?? []
  const boardEntity = allEntities.find(e => e.type === 'tactical-board')
  if (!boardEntity) return

  const data = persistence.loadFromProperties(boardEntity.properties || {})
  if (!data) return

  gridType.value = data.gridType
  gridSize.value = String(data.gridSize)
  terrain.value = data.terrain
  persistence.resetStats()
  if (data.combatStats) {
    persistence.combatStats.value = data.combatStats
  }

  await createEngine(data.gridType, data.gridSize, data.gridSize)
  syncTerrainToEngine()

  for (const u of data.units) {
    try {
      engine.value?.place_unit(
        u.id, u.name, u.team,
        u.x, u.y,
        u.hp, u.max_hp, u.mp, u.max_mp,
        u.attack, u.defense, u.speed,
        u.move_range, u.attack_range,
      )
    } catch (e) {
      console.warn('[TacticalBoard] restore unit failed', e)
    }
  }
  refreshUnits()
  battle.resetBattle()
  if (data.battlePhase === 'action' || data.battlePhase === 'battle') {
    battle.startBattle()
  }
}

onMounted(async () => {
  es.loadAll()
  await rebuildBoard()
})

useAgentPluginBridge('tactical-board', (event) => {
  console.log(`[Agent→${event.pluginId}] ${event.action}`, event.payload)
})
</script>

<style scoped>
.tb-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg-base);
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
}

.tb-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 16px;
  background: var(--color-bg-surface);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.tb-toolbar-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tb-toolbar-label {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.tb-toolbar-sep {
  width: 1px;
  height: 20px;
  background: var(--color-border);
  margin: 0 4px;
}

.tb-toolbar-spacer {
  flex: 1;
}

.tb-phase {
  font-size: var(--font-size-xs);
  padding: 2px 8px;
  border-radius: 10px;
  white-space: nowrap;
}

.tb-phase-deployment {
  color: var(--color-text-secondary);
  background: color-mix(in srgb, var(--color-text-secondary) 10%, transparent);
}

.tb-phase-battle {
  color: var(--color-warning);
  background: color-mix(in srgb, var(--color-warning) 10%, transparent);
}

.tb-phase-victory {
  color: var(--color-success);
  background: color-mix(in srgb, var(--color-success) 10%, transparent);
}

.tb-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg-elevated);
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.tb-btn:hover:not(:disabled) { background: var(--color-bg-hover); border-color: var(--color-text-secondary); }
.tb-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.tb-btn-start {
  border-color: var(--color-success);
  color: var(--color-success);
}

.tb-btn-start:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-success) 15%, transparent);
}

.tb-btn-end {
  border-color: var(--color-warning);
  color: var(--color-warning);
}

.tb-btn-end:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-warning) 15%, transparent);
}

.tb-current-info {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
}

.tb-current-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.tb-team-bg-ally { background: var(--color-primary); }
.tb-team-bg-enemy { background: var(--color-danger); }
.tb-team-bg-neutral { background: var(--color-text-secondary); }

.tb-action-hint {
  font-size: var(--font-size-xs);
  color: var(--color-warning);
}

.tb-ai-badge {
  font-size: var(--text-micro-font-size);
  font-weight: var(--font-weight-bold);
  color: var(--color-primary-hover);
  background: color-mix(in srgb, var(--color-primary-hover) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-primary-hover) 30%, transparent);
  border-radius: 3px;
  padding: 0 4px;
  margin-left: 2px;
  vertical-align: middle;
}

.tb-victory-text {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-success);
}

.tb-main {
  flex: 1;
  display: flex;
  min-height: 0;
}

.tb-canvas-area {
  flex: 1;
  min-width: 0;
  position: relative;
}

.tb-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.tb-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: ws-spin 0.8s linear infinite;
}



.tb-sidebar {
  width: 240px;
  flex-shrink: 0;
  background: var(--color-bg-surface);
  border-left: 1px solid var(--color-border);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.tb-panel {
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-border);
}

.tb-panel-title {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
}

.tb-panel-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 2px 0;
  font-size: var(--font-size-sm);
}

.tb-label { color: var(--color-text-secondary); }

.tb-unit-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 200px;
  overflow-y: auto;
}

.tb-unit-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-size: var(--font-size-sm);
  border-left: 3px solid transparent;
  transition: background 0.1s;
}

.tb-unit-item:hover { background: var(--color-bg-elevated); }

.tb-team-border-ally { border-left-color: var(--color-primary); }
.tb-team-border-enemy { border-left-color: var(--color-danger); }
.tb-team-border-neutral { border-left-color: var(--color-text-secondary); }

.tb-unit-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.tb-unit-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tb-unit-hp {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.tb-current {
  background: color-mix(in srgb, var(--color-warning) 10%, transparent);
  border-left-color: var(--color-warning) !important;
}

.tb-acted {
  opacity: 0.5;
}

.tb-log-panel {
  flex: 1;
  min-height: 100px;
  max-height: 200px;
  border-top: 1px solid var(--color-border);
  overflow: hidden;
}

.tb-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 16px;
  background: var(--color-bg-surface);
  border-top: 1px solid var(--color-border);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.tb-status-sep { color: var(--color-border); }
.tb-status-hint { margin-left: auto; color: var(--color-text-tertiary); }
</style>
