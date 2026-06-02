import { ref, computed } from 'vue'
import type { TacticalEngineAPI, WasmBattleUnit, WasmCombatResult } from './useTacticalEngine'
import type { UnitRenderData, HighlightCell } from './boardDraw'

export type BattlePhase = 'deployment' | 'battle' | 'victory'
export type ActionType = 'move' | 'attack' | 'skill' | 'wait'

export interface BattleLogEntry {
  turn: number
  text: string
  type: 'move' | 'attack' | 'skill' | 'system' | 'victory'
  timestamp: number
}

export interface ActionState {
  type: ActionType | null
  sourceX: number
  sourceY: number
  targets: { x: number; y: number }[]
}

export function useBattleManager(
  engine: { value: TacticalEngineAPI | null },
  units: { value: UnitRenderData[] },
  refreshUnits: () => void,
) {
  const phase = ref<BattlePhase>('deployment')
  const currentTurn = ref(1)
  const actionQueue = ref<WasmBattleUnit[]>([])
  const currentUnitIndex = ref(0)
  const actionState = ref<ActionState | null>(null)
  const battleLog = ref<BattleLogEntry[]>([])
  const victoryTeam = ref('')

  const currentUnit = computed<WasmBattleUnit | null>(() => {
    if (phase.value !== 'battle') return null
    if (currentUnitIndex.value >= actionQueue.value.length) return null
    return actionQueue.value[currentUnitIndex.value]
  })

  const currentHighlights = computed<HighlightCell[]>(() => {
    if (!actionState.value || !engine.value) return []
    const { type, sourceX, sourceY, targets } = actionState.value
    if (type === 'move') {
      try {
        const range = engine.value.get_movable_range(sourceX, sourceY) as { x: number; y: number }[]
        return range.map(p => ({ x: p.x, y: p.y, type: 'move' as const }))
      } catch { return [] }
    }
    if (type === 'attack') {
      try {
        const range = engine.value.get_attack_range(sourceX, sourceY) as { x: number; y: number }[]
        return range.map(p => ({ x: p.x, y: p.y, type: 'attack' as const }))
      } catch { return [] }
    }
    if (type === 'skill') {
      return targets.map(t => ({ x: t.x, y: t.y, type: 'skill' as const }))
    }
    return []
  })

  function addLog(text: string, type: BattleLogEntry['type']) {
    battleLog.value.push({
      turn: currentTurn.value,
      text,
      type,
      timestamp: Date.now(),
    })
    if (battleLog.value.length > 200) {
      battleLog.value = battleLog.value.slice(-150)
    }
  }

  function startBattle() {
    if (!engine.value) return
    engine.value.start_battle()
    phase.value = 'battle'
    currentTurn.value = 1
    victoryTeam.value = ''
    actionState.value = null
    addLog('战斗开始！', 'system')
    buildActionQueue()
  }

  function buildActionQueue() {
    if (!engine.value) return
    try {
      const allUnits = engine.value.get_all_units() as WasmBattleUnit[]
      actionQueue.value = allUnits
        .filter(u => u.hp > 0 && !u.acted)
        .sort((a, b) => b.speed - a.speed)
      currentUnitIndex.value = 0
    } catch {
      actionQueue.value = []
    }
  }

  function beginMoveAction() {
    const unit = currentUnit.value
    if (!unit || !engine.value) return
    actionState.value = {
      type: 'move',
      sourceX: unit.x,
      sourceY: unit.y,
      targets: [],
    }
  }

  function beginAttackAction() {
    const unit = currentUnit.value
    if (!unit || !engine.value) return
    actionState.value = {
      type: 'attack',
      sourceX: unit.x,
      sourceY: unit.y,
      targets: [],
    }
  }

  function cancelAction() {
    actionState.value = null
  }

  function executeAction(targetX: number, targetY: number): boolean {
    if (!actionState.value || !engine.value) return false
    const { type, sourceX, sourceY } = actionState.value

    if (type === 'move') {
      try {
        engine.value.move_unit(sourceX, sourceY, targetX, targetY)
        const unit = currentUnit.value
        addLog(`${unit?.name || '单位'} 移动到 (${targetX}, ${targetY})`, 'move')
        refreshUnits()
        actionState.value = null
        advanceToNextUnit()
        return true
      } catch (e) {
        console.warn('[Battle] move failed', e)
        return false
      }
    }

    if (type === 'attack') {
      try {
        const result = engine.value.execute_attack(sourceX, sourceY, targetX, targetY) as WasmCombatResult
        const critText = result.critical ? ' 暴击！' : ''
        const deadText = result.defender_dead ? ` ${result.defender_id} 被击败！` : ''
        addLog(
          `${result.attacker_id} 攻击 ${result.defender_id}，造成 ${result.damage} 伤害${critText}${deadText}`,
          'attack',
        )
        refreshUnits()
        actionState.value = null
        checkVictory()
        if (phase.value === 'battle') {
          advanceToNextUnit()
        }
        return true
      } catch (e) {
        console.warn('[Battle] attack failed', e)
        return false
      }
    }

    return false
  }

  function waitAction() {
    const unit = currentUnit.value
    if (!unit || !engine.value) return
    try {
      const allUnits = engine.value.get_all_units() as WasmBattleUnit[]
      const target = allUnits.find(u => u.id === unit.id)
      if (target) {
        engine.value.move_unit(target.x, target.y, target.x, target.y)
      }
    } catch {}
    addLog(`${unit.name} 待机`, 'system')
    actionState.value = null
    advanceToNextUnit()
  }

  function advanceToNextUnit() {
    currentUnitIndex.value++
    if (currentUnitIndex.value >= actionQueue.value.length) {
      endTurn()
      return
    }
    const next = actionQueue.value[currentUnitIndex.value]
    if (!next || next.hp <= 0) {
      advanceToNextUnit()
      return
    }
    if (next.acted) {
      advanceToNextUnit()
      return
    }
  }

  function endTurn() {
    if (!engine.value) return
    engine.value.next_turn()
    currentTurn.value = engine.value.get_turn()
    addLog(`--- 回合 ${currentTurn.value} ---`, 'system')
    refreshUnits()
    buildActionQueue()
  }

  function checkVictory() {
    if (!engine.value) return
    try {
      const winner = engine.value.check_victory() as string
      if (winner !== '') {
        phase.value = 'victory'
        victoryTeam.value = winner
        const teamName = winner === 'ally' ? '友方' : winner === 'enemy' ? '敌方' : '中立'
        addLog(`${teamName} 获胜！`, 'victory')
      }
    } catch {}
  }

  function resetBattle() {
    phase.value = 'deployment'
    currentTurn.value = 1
    actionQueue.value = []
    currentUnitIndex.value = 0
    actionState.value = null
    battleLog.value = []
    victoryTeam.value = ''
  }

  function isCurrentUnit(x: number, y: number): boolean {
    const u = currentUnit.value
    if (!u) return false
    return u.x === x && u.y === y
  }

  return {
    phase,
    currentTurn,
    currentUnit,
    currentHighlights,
    actionState,
    battleLog,
    victoryTeam,
    startBattle,
    beginMoveAction,
    beginAttackAction,
    cancelAction,
    executeAction,
    waitAction,
    endTurn,
    resetBattle,
    isCurrentUnit,
    addLog,
  }
}
