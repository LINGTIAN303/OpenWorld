<script setup lang="ts">
// AgentDecisionCard — Agent 决策卡片
//
// P3 新增:agent_decision 节点暂停时显示。
// 6 段:标题条 + 上下文 + 问题 + 选项 + 自由输入 + 操作条。
// 5min 倒计时到 0 走 fallback(emit('fallback', defaultOption))。

import { ref, computed, watch } from 'vue'
import WsCard from '@/ui/WsCard.vue'
import WsStatusDot from '@/ui/WsStatusDot.vue'
import type { DecisionContext } from '../../types'
import { useDecisionTimeout } from '../../composables/useDecisionTimeout'

const props = defineProps<{ context: DecisionContext }>()
const emit = defineEmits<{
  decide: [payload: { choice: string; note: string }]
  dismiss: []
  fallback: [choice: string]
}>()

const selectedOptionId = ref<string>(props.context.defaultOption)
const note = ref('')
const contextExpanded = ref(false)

const { remainingMs, start: startTimer, onTimeout: onTimeoutCb } = useDecisionTimeout()

const summaryText = computed(() => props.context.context.summary ?? '')
const isSummaryLong = computed(() => summaryText.value.length > 200)
const displayedSummary = computed(() => {
  if (contextExpanded.value || !isSummaryLong.value) return summaryText.value
  return summaryText.value.slice(0, 200) + '…'
})

// 当切换到不同 decision(runId+nodeId 变化)时,重置内部状态 + 重启 timer
watch(
  () => `${props.context.runId}:${props.context.nodeId}`,
  () => {
    selectedOptionId.value = props.context.defaultOption
    note.value = ''
    contextExpanded.value = false
    startTimeout()
  },
  { immediate: true },
)

function startTimeout(): void {
  const ms = props.context.decisionTimeoutMs
  if (ms > 0) {
    startTimer(ms)
    onTimeoutCb(() => {
      // 闭包内访问 props.context 是 reactive,每次取最新 defaultOption
      emit('fallback', props.context.defaultOption)
    })
  }
}

function onConfirm(): void {
  emit('decide', { choice: selectedOptionId.value, note: note.value })
}

function onDismiss(): void {
  emit('dismiss')
}

function onSelectOption(id: string): void {
  selectedOptionId.value = id
}
</script>

<template>
  <WsCard class="decision-card" data-testid="decision-card">
    <template #header>
      <div class="decision-header">
        <WsStatusDot status="paused" />
        <h3 class="decision-title">{{ context.nodeName }}</h3>
        <button
          type="button"
          class="decision-dismiss"
          data-testid="dismiss"
          @click="onDismiss"
        >
          ×
        </button>
      </div>
    </template>
    <div class="decision-body">
      <section class="decision-section">
        <h4 class="decision-section-title">上下文</h4>
        <WsCard class="decision-context-card" inset>
          <p class="decision-context-summary">{{ displayedSummary }}</p>
          <button
            v-if="isSummaryLong"
            type="button"
            class="decision-expand"
            data-testid="expand"
            @click="contextExpanded = !contextExpanded"
          >
            {{ contextExpanded ? '收起' : '展开' }}
          </button>
          <ul v-if="context.context.items?.length" class="decision-context-items">
            <li v-for="item in context.context.items" :key="item.label">
              <span class="context-item-label">{{ item.label }}:</span>
              <span class="context-item-value">{{ item.value }}</span>
            </li>
          </ul>
        </WsCard>
      </section>

      <section class="decision-section">
        <h4 class="decision-section-title">问题</h4>
        <blockquote class="decision-prompt">{{ context.prompt }}</blockquote>
      </section>

      <section class="decision-section">
        <h4 class="decision-section-title">选项</h4>
        <ul class="decision-options">
          <li
            v-for="opt in context.options"
            :key="opt.id"
            :data-testid="`option-${opt.id}`"
            :class="['decision-option', { selected: selectedOptionId === opt.id }]"
            @click="onSelectOption(opt.id)"
          >
            <span class="decision-option-radio" />
            <span class="decision-option-label">{{ opt.label || opt.id }}</span>
          </li>
        </ul>
      </section>

      <section class="decision-section">
        <h4 class="decision-section-title">备注(可选)</h4>
        <textarea
          v-model="note"
          data-testid="free-input"
          class="decision-note"
          rows="2"
          placeholder="补充说明…"
        />
      </section>
    </div>
    <template #footer>
      <div class="decision-actions">
        <span v-if="context.decisionTimeoutMs > 0" class="decision-timer" data-testid="timer">
          {{ Math.ceil(remainingMs / 1000) }}s
        </span>
        <button
          type="button"
          class="decision-btn"
          data-testid="confirm"
          @click="onConfirm"
        >
          确认决策 →
        </button>
      </div>
    </template>
  </WsCard>
</template>

<style scoped>
.decision-card {
  width: 100%;
  max-width: 480px;
}
.decision-header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.decision-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  flex: 1;
  color: var(--color-text-primary);
}
.decision-dismiss {
  background: transparent;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: var(--color-text-tertiary);
  padding: 0 4px;
}
.decision-dismiss:hover {
  color: var(--color-text-primary);
}
.decision-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 8px 0;
}
.decision-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.decision-section-title {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--color-text-tertiary);
  letter-spacing: 0.05em;
}
.decision-context-card {
  font-size: 12px;
  background: var(--color-bg-secondary);
}
.decision-context-summary {
  margin: 0 0 6px 0;
  color: var(--color-text-secondary);
  line-height: 1.5;
}
.decision-context-items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.context-item-label {
  color: var(--color-text-tertiary);
  margin-right: 4px;
}
.context-item-value {
  font-family: ui-monospace, SFMono-Regular, monospace;
  color: var(--color-text-primary);
}
.decision-expand {
  background: transparent;
  border: none;
  color: var(--color-primary);
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  padding: 0;
}
.decision-prompt {
  margin: 0;
  padding: 8px 12px;
  border-left: 3px solid var(--color-primary);
  background: var(--color-primary-subtle);
  color: var(--color-text-primary);
  font-size: 13px;
  line-height: 1.5;
  border-radius: 0 4px 4px 0;
}
.decision-options {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.decision-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--color-border-default);
  border-radius: 4px;
  background: var(--color-bg-elevated);
  cursor: pointer;
  font-size: 12px;
  color: var(--color-text-primary);
  transition: background 0.1s, border-color 0.1s;
}
.decision-option:hover {
  background: var(--color-bg-hover);
}
.decision-option.selected {
  background: var(--color-primary-subtle);
  border-color: var(--color-primary);
}
.decision-option-radio {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--color-border-strong);
  flex-shrink: 0;
}
.decision-option.selected .decision-option-radio {
  border-color: var(--color-primary);
  background: var(--color-primary);
}
.decision-note {
  width: 100%;
  background: var(--color-bg-elevated);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border-default);
  border-radius: 4px;
  padding: 6px 10px;
  font: inherit;
  font-size: 12px;
  resize: vertical;
  box-sizing: border-box;
}
.decision-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: flex-end;
}
.decision-timer {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 11px;
  color: var(--color-text-tertiary);
}
.decision-btn {
  background: var(--color-primary);
  color: var(--color-text-on-primary, white);
  border: none;
  border-radius: 4px;
  padding: 6px 14px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.decision-btn:hover {
  filter: brightness(1.1);
}
</style>
