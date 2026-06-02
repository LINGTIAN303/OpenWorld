<template>
  <div class="step-chain">
    <div
      v-for="(step, idx) in steps"
      :key="idx"
      class="step-item"
      :class="{ 'step-active': step.active, 'step-done': step.done }"
    >
      <div class="step-marker">
        <span v-if="step.done" class="step-check">✓</span>
        <span v-else-if="step.active" class="step-pulse">●</span>
        <span v-else class="step-dot">{{ idx + 1 }}</span>
      </div>
      <div v-if="idx < steps.length - 1" class="step-line" :class="{ 'step-line-done': step.done }"></div>
      <div class="step-body">
        <div class="step-title">{{ step.label }}</div>
        <div v-if="step.tools.length > 0" class="step-tools">
          <div v-for="tc in step.tools" :key="tc.id" class="step-tool" :class="tc.status">
            <span class="step-tool-icon">
              <span v-if="tc.status === 'running'" class="tc-spin">🔧</span>
              <span v-else-if="tc.status === 'completed'"><WsIcon name="check" size="xs" /></span>
              <span v-else><WsIcon name="x" size="xs" /></span>
            </span>
            <span class="step-tool-name">{{ getToolLabel(tc.name) }}</span>
            <span v-if="tc.status === 'running'" class="step-tool-status">执行中…</span>
            <span v-else-if="tc.status === 'completed'" class="step-tool-status">完成</span>
            <span v-else class="step-tool-status">失败</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import WsIcon from '../../ui/WsIcon.vue'

interface ToolCallView {
  id: string
  name: string
  args: Record<string, unknown>
  status: 'running' | 'completed' | 'failed'
  result?: string
  startedAt: number
  endedAt?: number
}

const TOOL_LABELS: Record<string, string> = {
  entity_create: '创建实体', entity_get: '获取实体', entity_update: '更新实体',
  entity_delete: '删除实体', entity_list: '实体列表', relation_create: '创建关系',
  relation_delete: '删除关系', relation_list: '关系列表', content_search: '内容搜索',
  kb_search: '知识库搜索', kb_list: '知识库列表', kb_read: '知识库读取',
  kb_write: '知识库写入', kb_extract: '知识库提取', consistency_check: '一致性检查',
  schema_validate: '模式验证', algo_graph_analysis: '图分析', algo_pagerank: 'PageRank',
  algo_community_detection: '社区检测', algo_shortest_path: '最短路径',
  algo_force_layout: '力导向布局', web_search: '联网搜索', web_fetch: '网页抓取',
  memory_store: '存储记忆', memory_recall: '回忆记忆', output_table: '表格',
  output_list: '列表', output_alert: '提示', output_comparison: '对比',
  output_accordion: '折叠区', output_entity_card: '实体卡', output_progress: '进度',
  ui_create_surface: '创建界面', ui_update_components: '更新组件', ui_update_data: '更新数据',
  a2ui_show_entity: '展示实体', a2ui_show_relation: '展示关系',
}

function getToolLabel(name: string): string {
  return TOOL_LABELS[name] || name.replace(/_/g, ' ')
}

const DEEP_STEPS = [
  { label: '问题拆解', tools: ['output_list'] },
  { label: '证据收集', tools: ['entity_get', 'entity_list', 'content_search', 'kb_search', 'kb_list', 'kb_read', 'relation_list'] },
  { label: '推理分析', tools: ['algo_graph_analysis', 'algo_pagerank', 'algo_community_detection', 'algo_shortest_path', 'consistency_check', 'schema_validate'] },
  { label: '结论与置信度', tools: ['output_table', 'output_comparison', 'output_accordion', 'output_alert'] },
]

const props = defineProps<{
  toolCalls: ToolCallView[]
}>()

const steps = computed(() => {
  let activeFound = false
  return DEEP_STEPS.map((stepDef, idx) => {
    const stepTools = props.toolCalls.filter(tc =>
      stepDef.tools.includes(tc.name)
    )
    const hasRunning = stepTools.some(tc => tc.status === 'running')
    const allDone = stepTools.length > 0 && stepTools.every(tc => tc.status === 'completed' || tc.status === 'failed')
    const active = !allDone && (hasRunning || (!activeFound && stepTools.length > 0) || (!activeFound && idx === firstStepWithTools.value))
    if (active) activeFound = true
    return {
      label: stepDef.label,
      tools: stepTools,
      active,
      done: allDone,
    }
  })
})

const firstStepWithTools = computed(() => {
  for (let i = 0; i < DEEP_STEPS.length; i++) {
    const hasTools = props.toolCalls.some(tc => DEEP_STEPS[i].tools.includes(tc.name))
    if (hasTools) return i
  }
  return 0
})
</script>

<style scoped>
.step-chain {
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.step-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  position: relative;
  min-height: 28px;
}

.step-marker {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
  background: rgba(255,255,255,0.06);
  border: 1.5px solid rgba(255,255,255,0.15);
  color: var(--agent-text-secondary, #aaa);
  position: relative;
  z-index: 1;
}

.step-item.step-done .step-marker {
  background: rgba(34,197,94,0.15);
  border-color: rgba(34,197,94,0.4);
  color: #22c55e;
}

.step-item.step-active .step-marker {
  background: rgba(108,92,231,0.15);
  border-color: rgba(108,92,231,0.5);
  color: var(--agent-primary, #6c5ce7);
}

.step-check { font-size: 12px; font-weight: 700; }
.step-pulse { animation: ws-pulse 1.5s infinite; }
.step-dot { font-size: 10px; }

.step-line {
  position: absolute;
  left: 10px;
  top: 22px;
  width: 1.5px;
  height: calc(100% - 22px);
  background: rgba(255,255,255,0.1);
}

.step-line-done {
  background: rgba(34,197,94,0.3);
}

.step-body {
  flex: 1;
  padding-bottom: 12px;
  min-width: 0;
}

.step-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--agent-text, #e0e0e0);
  line-height: 22px;
}

.step-item.step-active .step-title {
  color: var(--agent-primary, #6c5ce7);
}

.step-item.step-done .step-title {
  color: rgba(34,197,94,0.8);
}

.step-tools {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 4px;
}

.step-tool {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  background: rgba(255,255,255,0.03);
}

.step-tool.running {
  background: rgba(108,92,231,0.08);
}

.step-tool.completed {
  opacity: 0.7;
}

.step-tool-icon { font-size: 11px; }
.step-tool-name { color: var(--agent-text-secondary, #aaa); }
.step-tool-status { margin-left: auto; font-size: 10px; color: var(--agent-text-tertiary, #666); }
.step-tool.running .step-tool-status { color: var(--agent-primary, #6c5ce7); }
.step-tool.completed .step-tool-status { color: rgba(34,197,94,0.6); }
.step-tool.failed .step-tool-status { color: rgba(239,68,68,0.6); }

.tc-spin { animation: ws-spin 1.2s linear infinite; display: inline-block; }
</style>
