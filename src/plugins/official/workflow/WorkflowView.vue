<template>
  <div class="workflow-view">
    <div class="workflow-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :class="['tab-btn', { active: currentTab === tab.id }]"
        @click="currentTab = tab.id"
      >
        <WsIcon :name="tab.icon" size="xs" /> {{ tab.label }}
      </button>
    </div>

    <div class="workflow-content">
      <WorkflowList
        v-if="currentTab === 'list'"
        :workflows="workflowList"
        @launch="handleLaunch"
        @edit="handleEdit"
        @delete="handleDelete"
      />
      <WorkflowEditorView
        v-else-if="currentTab === 'editor' && currentWorkflowId"
        :workflow-id="currentWorkflowId"
        @toast="handleToast"
      />
      <div v-else-if="currentTab === 'editor'" class="workflow-empty">
        <p>请先在「工作流」标签页选择一个工作流进行编辑</p>
      </div>
      <WorkflowProgress
        v-if="currentTab === 'progress'"
        :runs="runs"
        :active-run="getActiveRun()"
        @pause="handlePause"
        @resume="handleResume"
        @cancel="handleCancel"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import WsIcon from '../../../ui/WsIcon.vue'
import WorkflowList from './components/WorkflowList.vue'
import WorkflowEditorView from './components/WorkflowEditorView.vue'
import WorkflowProgress from './components/WorkflowProgress.vue'
import { useWorkflow } from './composables/useWorkflow'

const { runs, workflowList, getActiveRun, updateRunStatus, removeWorkflow } = useWorkflow()

const currentTab = ref('list')
// Phase 4.8：编辑/运行 tab 需要知道当前 workflowId（外层 state）
const currentWorkflowId = ref<string | null>(null)

const tabs = [
  { id: 'list', icon: 'outline', label: '工作流' },
  { id: 'editor', icon: 'edit', label: '编辑器' },
  { id: 'progress', icon: 'dashboard', label: '进度' },
]

function handleLaunch(workflowId: string) {
  currentWorkflowId.value = workflowId
  currentTab.value = 'progress'
}

function handleEdit(workflowId: string) {
  currentWorkflowId.value = workflowId
  currentTab.value = 'editor'
}

function handleDelete(workflowId: string) {
  removeWorkflow(workflowId)
  if (currentWorkflowId.value === workflowId) {
    currentWorkflowId.value = null
    currentTab.value = 'list'
  }
}

function handleToast(message: string, type: 'info' | 'error' | 'success') {
  // Phase 4.8 简化：仅 console 提示（后续可接全局 toast store）
  const tag = `[workflow ${type}]`
  if (type === 'error') console.error(tag, message)
  else console.log(tag, message)
}

function handlePause(runId: string) {
  const event = new CustomEvent('worldsmith:workflow-control', {
    detail: { action: 'pause', runId },
  })
  window.dispatchEvent(event)
  updateRunStatus(runId, { status: 'paused' })
}

function handleResume(runId: string) {
  const event = new CustomEvent('worldsmith:workflow-control', {
    detail: { action: 'resume', runId },
  })
  window.dispatchEvent(event)
  updateRunStatus(runId, { status: 'running' })
}

function handleCancel(runId: string) {
  const event = new CustomEvent('worldsmith:workflow-control', {
    detail: { action: 'cancel', runId },
  })
  window.dispatchEvent(event)
  updateRunStatus(runId, { status: 'cancelled' })
}
</script>

<style scoped>
.workflow-view {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.workflow-tabs {
  display: flex;
  gap: 4px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}
.tab-btn {
  padding: 6px 14px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font-size: var(--font-size-sm);
  color: var(--text-secondary, #6b7280);
  transition: all 0.15s;
}
.tab-btn:hover {
  background: var(--hover-bg, #f3f4f6);
}
.tab-btn.active {
  background: var(--active-bg, #eff6ff);
  color: var(--primary, #3b82f6);
  border-color: var(--primary, #3b82f6);
}
.workflow-content {
  flex: 1;
  overflow: hidden;
}
.workflow-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-secondary, #94a3b8);
  font-size: var(--font-size-sm);
}
</style>
