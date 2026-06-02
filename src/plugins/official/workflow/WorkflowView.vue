<template>
  <div class="workflow-view">
    <div class="workflow-tabs">
      <div class="workflow-tabs__left">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          :class="['tab-btn', { active: currentTab === tab.id }]"
          @click="currentTab = tab.id"
        >
          <WsIcon :name="tab.icon" size="xs" /> {{ tab.label }}
        </button>
      </div>
      <div class="workflow-tabs__right">
        <NewWorkflowDropdown
          @create-blank="handleCreateBlank"
          @create-template="handleCreateTemplate"
          @import="handleImport"
        />
      </div>
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
import NewWorkflowDropdown from './components/NewWorkflowDropdown.vue'
import { useWorkflow } from './composables/useWorkflow'
import { useNewWorkflow } from './composables/useNewWorkflow'

const { runs, workflowList, getActiveRun, updateRunStatus, removeWorkflow, addWorkflow } =
  useWorkflow()
const { createBlank, createFromTemplate, commit } = useNewWorkflow()

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

function handleCreateBlank(name: string) {
  const def = createBlank(name)
  commit(def)
  // commit 已派发 worldsmith:workflow-list → useWorkflow 已 addWorkflow
  // 直接尝试 addWorkflow(防止 addWorkflow 不可用时 list 不更新)
  addWorkflow({
    id: def.id,
    latestVersion: 1,
    name: def.name,
    category: def.category || 'custom',
    description: def.description ?? null,
    updatedAt: Date.now(),
  })
  // 切到编辑器
  currentWorkflowId.value = def.id
  currentTab.value = 'editor'
}

function handleCreateTemplate(detail: { templateId: string; name: string }) {
  const def = createFromTemplate(detail.templateId, { name: detail.name })
  commit(def)
  addWorkflow({
    id: def.id,
    latestVersion: 1,
    name: def.name,
    category: 'template',
    description: null,
    updatedAt: Date.now(),
  })
  currentWorkflowId.value = def.id
  currentTab.value = 'editor'
}

function handleImport() {
  // 占位:实际场景应弹出文件选择 dialog → 解析 JSON → commit
  // P2 范围内仅占位,P3 可接真实文件选择
  handleToast('导入 JSON:该功能将在 P3 实装文件选择', 'info')
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
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border-default);
}
.workflow-tabs__left {
  display: flex;
  gap: var(--space-1);
}
.workflow-tabs__right {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.tab-btn {
  padding: 6px 14px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm, 6px);
  background: transparent;
  cursor: pointer;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  transition: all var(--duration-fast) var(--ease-default);
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}
.tab-btn:hover {
  background: var(--color-bg-hover);
}
.tab-btn.active {
  background: var(--color-primary-subtle);
  color: var(--color-primary);
  border-color: var(--color-primary);
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
  color: var(--color-text-tertiary);
  font-size: var(--font-size-sm);
}
</style>
