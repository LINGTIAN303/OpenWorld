import { ref, computed, watch, type Ref } from 'vue'
import type { TacticalEngineAPI, WasmBattleUnit } from './useTacticalEngine'
import type { BattlePhase, BattleLogEntry } from './useBattleManager'

export interface AiControlState {
  team: string
  enabled: boolean
  speed: number
}

const AI_SPEEDS = [
  { value: 300, label: '快速' },
  { value: 600, label: '正常' },
  { value: 1200, label: '慢速' },
]

export function useAIController(
  engine: Ref<TacticalEngineAPI | null>,
  battlePhase: Ref<BattlePhase>,
  currentUnit: Ref<WasmBattleUnit | null>,
  addLog: (text: string, type: BattleLogEntry['type']) => void,
  refreshUnits: () => void,
  beginMoveAction: () => void,
  beginAttackAction: () => void,
  executeAction: (x: number, y: number) => boolean,
  waitAction: () => void,
) {
  const aiTeams = ref<Map<string, AiControlState>>(new Map())
  const aiRunning = ref(false)
  const aiSpeed = ref(600)
  const aiStepCount = ref(0)

  let aiTimer: ReturnType<typeof setTimeout> | null = null

  const aiTeamList = computed(() => {
    const result: { team: string; enabled: boolean }[] = []
    for (const [team, state] of aiTeams.value) {
      result.push({ team, enabled: state.enabled })
    }
    return result
  })

  function toggleAI(team: string) {
    const current = aiTeams.value.get(team)
    if (current) {
      current.enabled = !current.enabled
      aiTeams.value = new Map(aiTeams.value)
    }
  }

  function setAISpeed(speed: number) {
    aiSpeed.value = speed
  }

  function isAIControlled(team: string): boolean {
    return aiTeams.value.get(team)?.enabled ?? false
  }

  function shouldAIAct(): boolean {
    if (battlePhase.value !== 'battle') return false
    if (!currentUnit.value) return false
    return isAIControlled(currentUnit.value.team)
  }

  function executeAIAction(): boolean {
    if (!engine.value || !currentUnit.value) return false
    const unit = currentUnit.value
    const team = unit.team

    try {
      const action = engine.value.ai_decide(team) as {
        unit_id: string
        action_type: string
        move_to: { x: number; y: number } | null
        target: { x: number; y: number } | null
        skill_id: string | null
      }

      if (!action || action.action_type === 'wait' || !action.unit_id) {
        addLog(`[AI] ${unit.name} 待机`, 'system')
        waitAction()
        return true
      }

      if (action.action_type === 'move' && action.move_to) {
        beginMoveAction()
        const moveTo = action.move_to
        setTimeout(() => {
          if (!aiRunning.value) return
          executeAction(moveTo.x, moveTo.y)
        }, 50)
        return true
      }

      if (action.action_type === 'attack' && action.target) {
        beginAttackAction()
        const targetPos = action.target
        setTimeout(() => {
          if (!aiRunning.value) return
          executeAction(targetPos.x, targetPos.y)
        }, 50)
        return true
      }

      addLog(`[AI] ${unit.name} 待机`, 'system')
      waitAction()
      return true
    } catch (e) {
      console.warn('[AI] decide failed', e)
      addLog(`[AI] ${unit.name} 待机`, 'system')
      waitAction()
      return false
    }
  }

  function startAI() {
    if (aiRunning.value) return
    aiRunning.value = true
    aiStepCount.value = 0
    scheduleNextAIStep()
  }

  function stopAI() {
    aiRunning.value = false
    if (aiTimer) {
      clearTimeout(aiTimer)
      aiTimer = null
    }
  }

  function scheduleNextAIStep() {
    if (!aiRunning.value) return
    if (battlePhase.value !== 'battle') {
      aiRunning.value = false
      return
    }

    if (shouldAIAct()) {
      aiTimer = setTimeout(() => {
        if (!aiRunning.value) return
        aiStepCount.value++
        executeAIAction()
        scheduleNextAIStep()
      }, aiSpeed.value)
    } else {
      aiTimer = setTimeout(() => {
        if (!aiRunning.value) return
        scheduleNextAIStep()
      }, 100)
    }
  }

  function runAIFullTurn(team: string) {
    if (!engine.value) return
    const state: AiControlState = { team, enabled: true, speed: aiSpeed.value }
    aiTeams.value.set(team, state)
    aiTeams.value = new Map(aiTeams.value)
    addLog(`[AI] ${team === 'ally' ? '友方' : team === 'enemy' ? '敌方' : '中立'} AI 接管`, 'system')
    startAI()
  }

  function runAISingleStep() {
    if (shouldAIAct()) {
      executeAIAction()
    }
  }

  function disableAllAI() {
    stopAI()
    for (const [, state] of aiTeams.value) {
      state.enabled = false
    }
    aiTeams.value = new Map(aiTeams.value)
  }

  function resetAI() {
    stopAI()
    aiTeams.value = new Map()
    aiStepCount.value = 0
  }

  return {
    aiTeams: aiTeamList,
    aiRunning,
    aiSpeed,
    aiStepCount,
    AI_SPEEDS,
    toggleAI,
    setAISpeed,
    isAIControlled,
    shouldAIAct,
    runAIFullTurn,
    runAISingleStep,
    disableAllAI,
    resetAI,
    startAI,
    stopAI,
  }
}
