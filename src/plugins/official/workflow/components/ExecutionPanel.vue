<template>
  <div class="ep-panel">
    <!-- 进度条 -->
    <div class="ep-progress">
      <div class="ep-progress__bar" :style="{ width: progress + '%' }"></div>
      <span class="ep-progress__text">{{ progress }}%</span>
    </div>

    <!-- 当前执行步骤 -->
    <div v-if="currentStep" class="ep-current">
      <span class="ep-current__label">正在执行：</span>
      <span class="ep-current__step">{{ currentStep.title }}</span>
      <span class="ep-current__type">{{ typeLabel(currentStep.type) }}</span>
    </div>

    <!-- 子 Agent 状态 -->
    <div v-if="activeSubAgents.length > 0" class="ep-agents">
      <div v-for="agent in activeSubAgents" :key="agent.id" class="ep-agent">
        <span class="ep-agent__icon">{{ agent.icon }}</span>
        <span class="ep-agent__name">{{ agent.name }}</span>
        <span class="ep-agent__status" :class="`agent-status--${agent.status}`">
          {{ agentStatusLabel(agent.status) }}
        </span>
        <span v-if="agent.duration" class="ep-agent__duration">
          {{ formatDuration(agent.duration) }}
        </span>
      </div>
    </div>

    <!-- 执行日志 -->
    <div v-if="executionLog.length > 0" class="ep-log">
      <h4 class="ep-log__title">执行日志</h4>
      <div v-for="(msg, i) in executionLog" :key="i" class="ep-log__line">{{ msg }}</div>
    </div>

    <div v-if="!currentStep && executionLog.length === 0 && activeSubAgents.length === 0" class="ep-idle">
      <p>等待执行... 点击「交给 Agent 执行」或在下方输入指令</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PipelineStep, StepType } from '../types'
import { STEP_TYPE_LABELS } from '../composables/useStepLibrary'
import { useOrchestrator } from '../../../../agent/composables/useOrchestrator'

const props = defineProps<{
  currentStep: PipelineStep | null
  progress: number
  executionLog: string[]
}>()

const { getSubAgents } = useOrchestrator()

/** 获取当前活跃的子 Agent（与 Pipeline 相关的） */
const activeSubAgents = computed(() => {
  return getSubAgents().filter(a =>
    a.id.startsWith('pipeline-') &&
    (a.status === 'running' || a.status === 'pending')
  )
})

function typeLabel(type: StepType): string {
  return STEP_TYPE_LABELS[type] || type
}

function agentStatusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: '等待中',
    running: '执行中',
    completed: '已完成',
    failed: '失败',
    timeout: '超时',
    cancelled: '已取消',
  }
  return map[status] || status
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}min`
}
</script>

<style scoped>
.ep-panel {
  flex-shrink: 0;
}

.ep-progress {
  height: 4px; background: var(--bg-tertiary, #21262d); border-radius: 2px;
  position: relative; overflow: hidden;
}
.ep-progress__bar { height: 100%; background: var(--success, #3fb950); border-radius: 2px; transition: width 0.3s; }
.ep-progress__text { position: absolute; right: 0; top: -16px; font-size: 11px; opacity: 0.5; }

.ep-current {
  margin-top: 8px; padding: 8px 10px; background: var(--bg-tertiary, #21262d);
  border-radius: 6px; display: flex; align-items: center; gap: 6px; font-size: 12px;
}
.ep-current__label { opacity: 0.6; }
.ep-current__step { font-weight: 500; }
.ep-current__type { font-size: 11px; opacity: 0.5; margin-left: auto; }

.ep-agents {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ep-agent {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--bg-tertiary, #21262d);
  border-radius: 6px;
  font-size: 12px;
}
.ep-agent__icon { font-size: 14px; }
.ep-agent__name { font-weight: 500; }
.ep-agent__status { font-size: 11px; margin-left: auto; }
.agent-status--running { color: var(--warning, #d29922); }
.agent-status--pending { color: var(--text-secondary, #8b949e); }
.agent-status--completed { color: var(--success, #3fb950); }
.agent-status--failed { color: var(--danger, #f85149); }
.ep-agent__duration { font-size: 11px; opacity: 0.5; }

.ep-log { margin-top: 8px; padding: 12px; background: var(--bg-tertiary, #21262d); border-radius: 8px; }
.ep-log__title { margin: 0 0 8px; font-size: 13px; opacity: 0.7; }
.ep-log__line { font-size: 12px; font-family: monospace; opacity: 0.6; line-height: 1.6; }

.ep-idle { text-align: center; padding: 24px; opacity: 0.4; font-size: 13px; }
</style>
