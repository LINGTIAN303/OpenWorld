<template>
  <Transition name="ws-fade">
    <div
      v-if="previewVisible && (toolCalls.length > 0 || hasA2UISurfaces)"
      class="agent-preview agent-panel"
      @click="handlePreviewClick"
      :style="panelStyle"
    >
      <div class="preview-header" @mousedown.left="onDragStart">
        <span class="status-dot" :class="{ active: isProcessing }">●</span>
        <span class="status-text">{{ isProcessing ? '运行中' : '已完成' }}</span>
        <span class="tool-count" v-if="toolCalls.length">{{ toolCalls.length }} 项调用</span>
        <button class="preview-close" @click="closePreview">✕</button>
      </div>
      <div class="preview-body">
        <div v-if="currentThinking" class="thinking-indicator">
          <WsIcon name="concept" size="xs" /> {{ currentThinking }}
        </div>
        <div v-if="hasA2UISurfaces" class="preview-a2ui">
          <A2UIRenderer
            :surfaces="a2uiSurfaces"
            :resolve-binding="resolveDataBinding"
            @action="onA2UIAction"
          />
        </div>
        <div v-if="activeTasks.length > 0" class="gen-section">
          <div class="gen-section-title">
            <WsIcon name="image" size="xs" /> 生成进度
          </div>
          <div
            v-for="task in activeTasks"
            :key="task.id"
            class="gen-card"
            :class="[`gen-${task.type}`]"
          >
            <div class="gen-card-header">
              <span class="gen-card-icon">{{ task.type === 'image' ? '🖼' : '🎬' }}</span>
              <span class="gen-card-label">{{ task.label }}</span>
              <span class="gen-card-model">{{ task.model }}</span>
            </div>
            <div class="gen-card-prompt">{{ task.prompt.length > 50 ? task.prompt.slice(0, 50) + '…' : task.prompt }}</div>
            <div class="gen-card-progress">
              <div class="gen-card-track">
                <div class="gen-card-fill" :style="{ width: task.progress + '%' }"></div>
              </div>
              <span class="gen-card-pct">{{ Math.round(task.progress) }}%</span>
            </div>
            <div class="gen-card-meta">
              <span>{{ task.status === 'polling' ? '轮询中' : task.status === 'generating' ? '生成中' : '等待中' }}</span>
              <span>{{ formatGenDuration(task) }}</span>
            </div>
          </div>
        </div>
        <div
          v-for="tc in runningToolCalls"
          :key="tc.id"
          class="tool-call-item"
          :class="[`tc-${tc.status}`]"
        >
          <div class="tc-header" @click="toggleTc(tc.id)">
            <span class="tc-icon"><WsIcon :name="'timeline'" size="xs" /></span>
            <span class="tc-name"><WsIcon :name="getToolIcon(tc.name)" size="xs" /> {{ getToolLabel(tc.name) }}</span>
            <span class="tc-time">{{ formatDuration(tc) }}</span>
            <span class="tc-toggle">{{ expandedTcs.has(tc.id) ? '▾' : '▸' }}</span>
          </div>
          <div class="tc-progress">
            <div class="progress-bar" :style="{ width: tc.progress + '%' }"></div>
          </div>
          <div v-if="isTcExpanded(tc)" class="tc-detail">
            <div v-if="Object.keys(tc.args).length" class="tc-args">
              <div class="tc-label">参数</div>
              <div class="tc-kv-list">
                <div v-for="(val, key) in tc.args" :key="String(key)" class="tc-kv-row">
                  <span class="tc-kv-key">{{ translateKey(String(key)) }}</span>
                  <span class="tc-kv-val">{{ formatVal(val) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-if="completedToolCalls.length" class="tc-completed-summary" @click="showCompleted = !showCompleted">
          <span class="tc-icon"><WsIcon name="check" size="xs" /></span>
          <span>{{ completedToolCalls.length }} 项调用已完成</span>
          <span class="tc-toggle">{{ showCompleted ? '▾' : '▸' }}</span>
        </div>
        <template v-if="showCompleted">
          <div
            v-for="tc in completedToolCalls"
            :key="tc.id"
            class="tool-call-item tc-completed"
          >
            <div class="tc-header" @click="toggleTc(tc.id)">
              <span class="tc-icon"><WsIcon :name="tc.status === 'failed' ? 'close' : 'check'" size="xs" /></span>
              <span class="tc-name"><WsIcon :name="getToolIcon(tc.name)" size="xs" /> {{ getToolLabel(tc.name) }}</span>
              <span class="tc-time">{{ formatDuration(tc) }}</span>
              <span class="tc-toggle">{{ expandedTcs.has(tc.id) ? '▾' : '▸' }}</span>
            </div>
            <div v-if="isTcExpanded(tc)" class="tc-detail">
              <div v-if="Object.keys(tc.args).length" class="tc-args">
                <div class="tc-label">参数</div>
                <div class="tc-kv-list">
                  <div v-for="(val, key) in tc.args" :key="String(key)" class="tc-kv-row">
                    <span class="tc-kv-key">{{ translateKey(String(key)) }}</span>
                    <span class="tc-kv-val">{{ formatVal(val) }}</span>
                  </div>
                </div>
              </div>
              <div v-if="tc.result" class="tc-result-block" v-html="sanitizeResult(tc.name, tc.result)"></div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import DOMPurify from 'dompurify'
import { useAgentEvents } from './composables/useAgentEvents'
import { useAgent } from './composables/useAgent'
import { useGenerationProgress } from './composables/useGenerationProgress'
import type { ToolCallView } from './composables/useAgentEvents'
import WsIcon from '../ui/WsIcon.vue'
import A2UIRenderer from './a2ui/A2UIRenderer.vue'
import { getEventBus } from '@worldsmith/entity-core'

defineProps<{ show: boolean }>()

const { toolCalls, isProcessing, currentThinking, removeEntityFromResults } = useAgentEvents()

function onEntityDeleted(payload: { entityId: string }): void {
  removeEntityFromResults(payload.entityId)
}

onMounted(() => {
  getEventBus().on('entity:delete', onEntityDeleted)
})

onUnmounted(() => {
  getEventBus().off('entity:delete', onEntityDeleted)
})

const runningToolCalls = computed(() => toolCalls.value.filter(tc => tc.status === 'running'))
const completedToolCalls = computed(() => toolCalls.value.filter(tc => tc.status !== 'running'))
const showCompleted = ref(false)
const { a2uiSurfaces, resolveDataBinding, sendMessage, steer, isStreaming, sendBlockAction } = useAgent()
const { activeTasks } = useGenerationProgress()

const hasA2UISurfaces = computed(() => Object.keys(a2uiSurfaces.value).length > 0)

const TOOL_ICONS: Record<string, string> = {
  entity_create: 'edit',
  entity_get: 'search',
  entity_update: 'edit',
  entity_delete: 'delete',
  entity_list: 'outline',
  relation_create: 'link',
  relation_delete: 'link',
  relation_list: 'outline',
  daily_report: 'dashboard',
  web_search: 'globe',
  output_table: 'dashboard',
  output_choice: 'profile',
  output_code: 'manuscript',
  output_entity_card: 'character',
  output_alert: 'warning',
  output_stat: 'dashboard',
  output_list: 'outline',
  output_progress: 'timeline',
  output_comparison: 'link',
  output_timeline: 'timeline',
  output_image: 'globe',
  output_accordion: 'manuscript',
  consistency_check: 'check',
  content_search: 'search',
  memory_store: 'manuscript',
  memory_recall: 'search',
  memory_delete: 'delete',
  project_export: 'outline',
  project_import: 'outline',
  load_skill: 'concept',
  schema_validate: 'check',
  schema_register_entity_type: 'edit',
  schema_unregister_entity_type: 'delete',
  schema_get_entity_type: 'search',
  schema_list_entity_types: 'outline',
  schema_update_entity_type: 'edit',
  schema_register_validation: 'check',
  schema_register_view: 'dashboard',
  schema_export: 'outline',
  algo_graph_analysis: 'dashboard',
  algo_pagerank: 'dashboard',
  algo_community_detection: 'dashboard',
  algo_force_layout: 'dashboard',
  algo_shortest_path: 'link',
  algo_k_shortest_paths: 'link',
  algo_topological_sort: 'outline',
  algo_crdt_lww: 'manuscript',
  algo_crdt_orset: 'manuscript',
  algo_crdt_rga: 'manuscript',
  algo_crdt_vector_clock: 'timeline',
  algo_terrain_noise: 'globe',
  algo_terrain_heightmap: 'globe',
  algo_terrain_contour: 'globe',
  algo_hydraulic_erosion: 'globe',
  algo_viewshed: 'globe',
  algo_constraint_solve: 'check',
  algo_dxf_parse: 'manuscript',
  algo_dxf_generate: 'manuscript',
  algo_dxf_extract_constraints: 'check',
  algo_polygon_boolean: 'dashboard',
  algo_polygon_offset: 'dashboard',
  algo_chaikin_smooth: 'dashboard',
  algo_find_shared_edges: 'search',
  algo_find_line_polygon_intersections: 'search',
  algo_polygon_split: 'dashboard',
  algo_polygon_augment: 'dashboard',
  ui_create_surface: 'dashboard',
  ui_update_components: 'edit',
  ui_update_data: 'edit',
  ui_delete_surface: 'delete',
  plugin_write: 'manuscript',
  file_write: 'manuscript',
  file_list: 'outline',
  file_read: 'search',
  file_analyze: 'search',
  fs_read: 'search',
  fs_write: 'manuscript',
  fs_list: 'outline',
  fs_move: 'edit',
  fs_delete: 'delete',
  fs_search: 'search',
  pkg_install: 'outline',
  pkg_run: 'timeline',
  pkg_info: 'search',
  git_status: 'check',
  git_log: 'timeline',
  git_diff: 'manuscript',
  git_commit: 'edit',
  git_branch: 'outline',
  sys_info: 'dashboard',
  sys_processes: 'dashboard',
  sys_disk: 'dashboard',
  web_search_cli: 'globe',
  web_fetch_cli: 'globe',
  web_qa_cli: 'globe',
  web_dns_cli: 'globe',
  web_ping_cli: 'globe',
  web_fetch: 'globe',
  code_execute: 'timeline',
  notebook_create: 'manuscript',
  notebook_update: 'edit',
  notebook_link: 'link',
  notebook_create_note: 'manuscript',
  notebook_update_note: 'edit',
  notebook_list_notes: 'outline',
  notebook_execute_code: 'timeline',
  notebook_create_backlink: 'link',
  notebook_export_note: 'outline',
  execute_command: 'timeline',
  detect_terminal_mode: 'check',
  start_server: 'timeline',
  list_sub_agent_types: 'outline',
  dispatch_sub_agent: 'profile',
  get_sub_agent_status: 'search',
  cancel_sub_agent: 'delete',
  a2ui_show_entity: 'character',
  a2ui_show_relation: 'link',
  module_builder_add_component: 'edit',
  module_builder_remove_component: 'delete',
  module_builder_update_config: 'edit',
  module_builder_suggest_layout: 'dashboard',
  retrofit_begin_session: 'timeline',
  retrofit_submit_intent: 'edit',
  retrofit_confirm_and_stage: 'check',
  retrofit_apply_next: 'timeline',
  retrofit_verify_and_accept: 'check',
  retrofit_request_repair: 'warning',
  retrofit_redirect: 'link',
  retrofit_rollback_last: 'timeline',
  retrofit_abort: 'delete',
  retrofit_session_phase: 'timeline',
  retrofit_detect_conflicts: 'warning',
  retrofit_end_session: 'check',
  retrofit_patch_diff: 'manuscript',
  retrofit_patch_apply: 'edit',
  retrofit_apply: 'edit',
  retrofit_undo: 'timeline',
  workflow_list: 'outline',
  workflow_run: 'timeline',
  workflow_status: 'search',
  workflow_decision: 'check',
  workflow_cancel: 'delete',
  workflow_create: 'edit',
  timeline_create_event: 'edit',
  timeline_update_event: 'edit',
  timeline_sort_events: 'outline',
  timeline_detect_conflicts: 'warning',
  timeline_get_events: 'search',
  timeline_export_timeline: 'outline',
  graph_get_nodes: 'search',
  graph_get_edges: 'search',
  graph_find_path: 'link',
  graph_cluster_analysis: 'dashboard',
  graph_highlight_nodes: 'dashboard',
  graph_export_snapshot: 'outline',
  mindmap_create_node: 'edit',
  mindmap_update_node: 'edit',
  mindmap_delete_node: 'delete',
  mindmap_get_structure: 'search',
  mindmap_auto_layout: 'dashboard',
  mindmap_export_image: 'outline',
  manuscript_create_chapter: 'edit',
  manuscript_update_chapter: 'edit',
  manuscript_list_chapters: 'outline',
  manuscript_get_chapter_content: 'search',
  manuscript_insert_mention: 'link',
  manuscript_export_document: 'outline',
  outline_create_node: 'edit',
  outline_update_node: 'edit',
  outline_move_node: 'edit',
  outline_get_structure: 'search',
  outline_link_entity: 'link',
  outline_export_outline: 'outline',
  tactical_deploy_unit: 'edit',
  tactical_move_unit: 'edit',
  tactical_get_battle_state: 'search',
  tactical_simulate_turn: 'timeline',
  tactical_export_battle_log: 'outline',
  magic_create_skill_node: 'edit',
  magic_update_skill_node: 'edit',
  magic_get_skill_tree: 'search',
  magic_validate_tree: 'check',
  magic_export_skill_tree: 'outline',
}

const TOOL_NAMES: Record<string, string> = {
  entity_create: '创建实体',
  entity_get: '获取实体',
  entity_update: '更新实体',
  entity_delete: '删除实体',
  entity_list: '实体列表',
  relation_create: '创建关系',
  relation_delete: '删除关系',
  relation_list: '关系列表',
  daily_report: '每日报告',
  web_search: '联网搜索',
  output_table: '表格',
  output_choice: '选项',
  output_code: '代码',
  output_entity_card: '实体卡',
  output_alert: '提示',
  output_stat: '统计',
  output_list: '列表',
  output_progress: '进度',
  output_comparison: '对比',
  output_timeline: '时间线',
  output_image: '图片',
  output_accordion: '折叠区',
  consistency_check: '一致性检查',
  content_search: '内容搜索',
  memory_store: '存储记忆',
  memory_recall: '回忆记忆',
  memory_delete: '删除记忆',
  project_export: '项目导出',
  project_import: '项目导入',
  load_skill: '加载技能',
  schema_validate: '模式验证',
  schema_register_entity_type: '注册实体类型',
  schema_unregister_entity_type: '注销实体类型',
  schema_get_entity_type: '获取实体类型',
  schema_list_entity_types: '列出实体类型',
  schema_update_entity_type: '更新实体类型',
  schema_register_validation: '注册验证规则',
  schema_register_view: '注册视图',
  schema_export: '导出模式',
  algo_graph_analysis: '图分析',
  algo_pagerank: 'PageRank',
  algo_community_detection: '社区检测',
  algo_force_layout: '力导向布局',
  algo_shortest_path: '最短路径',
  algo_k_shortest_paths: 'K最短路径',
  algo_topological_sort: '拓扑排序',
  algo_crdt_lww: 'CRDT-LWW',
  algo_crdt_orset: 'CRDT-ORSet',
  algo_crdt_rga: 'CRDT-RGA',
  algo_crdt_vector_clock: '向量时钟',
  algo_terrain_noise: '地形噪声',
  algo_terrain_heightmap: '地形高度图',
  algo_terrain_contour: '地形等高线',
  algo_hydraulic_erosion: '水力侵蚀',
  algo_viewshed: '视域分析',
  algo_constraint_solve: '约束求解',
  algo_dxf_parse: 'DXF解析',
  algo_dxf_generate: 'DXF生成',
  algo_dxf_extract_constraints: 'DXF提取约束',
  algo_polygon_boolean: '多边形布尔运算',
  algo_polygon_offset: '多边形偏移',
  algo_chaikin_smooth: 'Chaikin平滑',
  algo_find_shared_edges: '查找共享边',
  algo_find_line_polygon_intersections: '线面交点',
  algo_polygon_split: '多边形分割',
  algo_polygon_augment: '多边形增强',
  ui_create_surface: '创建界面',
  ui_update_components: '更新组件',
  ui_update_data: '更新数据',
  ui_delete_surface: '删除界面',
  plugin_write: '写入插件',
  file_write: '写入文件',
  file_list: '文件列表',
  file_read: '读取文件',
  file_analyze: '分析文件',
  fs_read: '读取文件',
  fs_write: '写入文件',
  fs_list: '文件列表',
  fs_move: '移动文件',
  fs_delete: '删除文件',
  fs_search: '搜索文件',
  pkg_install: '安装包',
  pkg_run: '运行包',
  pkg_info: '包信息',
  git_status: 'Git状态',
  git_log: 'Git日志',
  git_diff: 'Git差异',
  git_commit: 'Git提交',
  git_branch: 'Git分支',
  sys_info: '系统信息',
  sys_processes: '系统进程',
  sys_disk: '磁盘信息',
  web_search_cli: '联网搜索',
  web_fetch_cli: '网页抓取',
  web_qa_cli: '网页问答',
  web_dns_cli: 'DNS查询',
  web_ping_cli: 'Ping检测',
  web_fetch: '网页抓取',
  code_execute: '执行代码',
  notebook_create: '创建笔记本',
  notebook_update: '更新笔记本',
  notebook_link: '关联笔记本',
  notebook_create_note: '创建笔记',
  notebook_update_note: '更新笔记',
  notebook_list_notes: '笔记列表',
  notebook_execute_code: '执行代码',
  notebook_create_backlink: '创建反向链接',
  notebook_export_note: '导出笔记',
  execute_command: '执行命令',
  detect_terminal_mode: '检测终端模式',
  start_server: '启动服务',
  list_sub_agent_types: '列出子代理类型',
  dispatch_sub_agent: '调度子代理',
  get_sub_agent_status: '获取子代理状态',
  cancel_sub_agent: '取消子代理',
  a2ui_show_entity: '展示实体',
  a2ui_show_relation: '展示关系',
  module_builder_add_component: '添加模块组件',
  module_builder_remove_component: '移除模块组件',
  module_builder_update_config: '更新模块配置',
  module_builder_suggest_layout: '建议布局',
  retrofit_begin_session: '开始改造会话',
  retrofit_submit_intent: '提交意图',
  retrofit_confirm_and_stage: '确认并暂存',
  retrofit_apply_next: '应用下一步',
  retrofit_verify_and_accept: '验证并接受',
  retrofit_request_repair: '请求修复',
  retrofit_redirect: '重定向',
  retrofit_rollback_last: '回滚上一步',
  retrofit_abort: '中止改造',
  retrofit_session_phase: '改造阶段',
  retrofit_detect_conflicts: '检测冲突',
  retrofit_end_session: '结束改造会话',
  retrofit_patch_diff: '补丁差异',
  retrofit_patch_apply: '应用补丁',
  retrofit_apply: '应用改造',
  retrofit_undo: '撤销改造',
  workflow_list: '工作流列表',
  workflow_run: '运行工作流',
  workflow_status: '工作流状态',
  workflow_decision: '工作流决策',
  workflow_cancel: '取消工作流',
  workflow_create: '创建工作流',
  timeline_create_event: '创建时间线事件',
  timeline_update_event: '更新时间线事件',
  timeline_sort_events: '排序事件',
  timeline_detect_conflicts: '检测冲突',
  timeline_get_events: '获取事件',
  timeline_export_timeline: '导出时间线',
  graph_get_nodes: '获取节点',
  graph_get_edges: '获取边',
  graph_find_path: '查找路径',
  graph_cluster_analysis: '聚类分析',
  graph_highlight_nodes: '高亮节点',
  graph_export_snapshot: '导出快照',
  mindmap_create_node: '创建思维节点',
  mindmap_update_node: '更新思维节点',
  mindmap_delete_node: '删除思维节点',
  mindmap_get_structure: '获取结构',
  mindmap_auto_layout: '自动布局',
  mindmap_export_image: '导出图片',
  manuscript_create_chapter: '创建章节',
  manuscript_update_chapter: '更新章节',
  manuscript_list_chapters: '章节列表',
  manuscript_get_chapter_content: '获取章节内容',
  manuscript_insert_mention: '插入引用',
  manuscript_export_document: '导出文档',
  outline_create_node: '创建大纲节点',
  outline_update_node: '更新大纲节点',
  outline_move_node: '移动大纲节点',
  outline_get_structure: '获取大纲结构',
  outline_link_entity: '关联实体',
  outline_export_outline: '导出大纲',
  tactical_deploy_unit: '部署单位',
  tactical_move_unit: '移动单位',
  tactical_get_battle_state: '获取战斗状态',
  tactical_simulate_turn: '模拟回合',
  tactical_export_battle_log: '导出战斗日志',
  magic_create_skill_node: '创建技能节点',
  magic_update_skill_node: '更新技能节点',
  magic_get_skill_tree: '获取技能树',
  magic_validate_tree: '验证技能树',
  magic_export_skill_tree: '导出技能树',
}

const TYPE_NAMES: Record<string, string> = {
  character: '角色',
  region: '区域',
  organization: '组织',
  concept: '概念',
  event: '事件',
  item: '物品',
}

const KEY_NAMES: Record<string, string> = {
  id: '标识',
  name: '名称',
  type: '类型',
  description: '描述',
  results: '结果数',
  query: '查询词',
  total: '总计',
  showing: '显示',
  success: '成功',
  ok: '成功',
  error: '错误',
  hint: '提示',
  action: '操作',
  key: '键',
  message: '消息',
  date: '日期',
  totalEntities: '实体总数',
  totalRelations: '关系总数',
  typeDistribution: '类型分布',
  recentUpdates: '最近更新',
  updatedAt: '更新时间',
  preview: '预览',
  label: '标签',
  progress: '进度',
  status: '状态',
  title: '标题',
  columns: '列定义',
  rows: '行数据',
  mode: '模式',
  options: '选项',
  language: '语言',
  code: '代码',
  runnable: '可运行',
  entityId: '实体ID',
  entityType: '实体类型',
  level: '级别',
  items: '项目',
  events: '事件',
  left: '左侧',
  right: '右侧',
  src: '来源',
  alt: '替代文本',
  caption: '说明',
  sections: '段落',
  content: '内容',
  value: '值',
  icon: '图标',
  trend: '趋势',
  time: '时间',
  tags: '标签',
  properties: '属性',
}

function getToolLabel(name: string): string {
  return TOOL_NAMES[name] || name
}

function getToolIcon(name: string): string {
  return TOOL_ICONS[name] || 'settings'
}

function getTypeLabel(type: string): string {
  return TYPE_NAMES[type] || type
}

const VALUE_NAMES: Record<string, string> = {
  single: '单选',
  multi: '多选',
  running: '运行中',
  completed: '已完成',
  failed: '已失败',
  info: '信息',
  success: '成功',
  warning: '警告',
  error: '错误',
  up: '上升',
  down: '下降',
  flat: '持平',
  left: '左',
  right: '右',
  center: '居中',
  true: '是',
  false: '否',
}

function translateValue(val: unknown): string {
  if (typeof val === 'string') return VALUE_NAMES[val] || val
  if (typeof val === 'boolean') return val ? '是' : '否'
  return String(val)
}

function translateKey(key: string): string {
  return KEY_NAMES[key] || key
}

function formatVal(val: unknown): string {
  if (val === null || val === undefined) return '—'
  if (typeof val === 'string') {
    const translated = translateValue(val)
    const display = translated !== val ? translated : (val.length > 80 ? val.slice(0, 80) + '…' : val)
    return display
  }
  if (typeof val === 'boolean') return translateValue(val)
  if (typeof val === 'number') return String(val)
  if (typeof val === 'object') {
    const s = JSON.stringify(val)
    return s.length > 80 ? s.slice(0, 80) + '…' : s
  }
  return String(val)
}

const expandedTcs = ref<Set<string>>(new Set())
const autoExpanded = ref<Set<string>>(new Set())

watch(toolCalls, (val) => {
  if (val.length === 0) {
    autoExpanded.value = new Set()
    expandedTcs.value = new Set()
  } else {
    previewVisible.value = true
  }
})

function toggleTc(id: string): void {
  const next = new Set(expandedTcs.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedTcs.value = next
}

function isTcExpanded(tc: ToolCallView): boolean {
  if (expandedTcs.value.has(tc.id)) return true
  if (tc.status === 'running') return true
  if (tc.status === 'completed' && !autoExpanded.value.has(tc.id) && tc.result) {
    autoExpanded.value = new Set([...autoExpanded.value, tc.id])
    return true
  }
  return false
}

function renderToolResult(toolName: string, raw: string): string {
  if (!raw) return ''
  let obj: any
  try { obj = JSON.parse(raw) } catch { return `<div class="r-fallback"><div class="r-text">${esc(raw.length > 300 ? raw.slice(0, 300) + '…' : raw)}</div></div>` }
  if (!obj || typeof obj !== 'object') return `<div class="r-fallback"><div class="r-text">${esc(String(obj))}</div></div>`

  if (obj.error) return renderError(obj)
  if (toolName.startsWith('output_')) return renderOutputResult(toolName, obj)
  if (toolName === 'entity_list' && obj.entities) return renderEntityList(obj)
  if (toolName === 'daily_report') return renderDailyReport(obj)
  if (obj.entities && Array.isArray(obj.entities)) return renderEntityList(obj)
  if (obj.success || obj.ok) return renderSuccess(obj)
  return renderFallback(obj)
}

function renderOutputResult(toolName: string, obj: any): string {
  const OUTPUT_LABELS: Record<string, string> = {
    output_table: '表格',
    output_choice: '选项',
    output_code: '代码',
    output_entity_card: '实体卡',
    output_alert: '提示',
    output_stat: '统计',
    output_list: '列表',
    output_progress: '进度',
    output_comparison: '对比',
    output_timeline: '时间线',
    output_image: '图片',
    output_accordion: '折叠区',
  }
  const label = OUTPUT_LABELS[toolName] || '输出'
  if (obj.error) return renderError(obj)
  const name = obj.name || obj.title || ''
  const detail = name ? `: ${esc(name)}` : ''
  return `<div class="r-success"><div class="r-success-name">✓ 已创建${label}组件${detail}</div></div>`
}

const DOMPURIFY_CONFIG = {
  ADD_ATTR: ['data-toggle', 'data-entity-id', 'data-action', 'id', 'class'],
  ADD_TAGS: [],
  ALLOW_DATA_ATTR: true,
}

function sanitizeResult(toolName: string, raw: string): string {
  return DOMPurify.sanitize(renderToolResult(toolName, raw), DOMPURIFY_CONFIG)
}

function handlePreviewClick(e: MouseEvent): void {
  const target = e.target as HTMLElement

  const toggle = target.closest('.r-ec-toggle') as HTMLElement | null
  if (toggle) {
    const detailId = toggle.dataset.toggle
    if (!detailId) return
    const detail = document.getElementById(detailId)
    if (detail) {
      detail.classList.toggle('open')
      toggle.classList.toggle('open')
    }
    return
  }

  const actionBtn = target.closest('.r-ec-btn') as HTMLElement | null
  if (actionBtn) {
    const action = actionBtn.dataset.action
    const entityId = actionBtn.dataset.entityId
    if (action && entityId) {
      const steerText = action === 'view'
        ? `请展示实体详情，实体ID: ${entityId}`
        : `请编辑实体，实体ID: ${entityId}`
      sendBlockAction(steerText, action === 'view' ? `查看实体` : `编辑实体`)
    }
  }
}

function renderError(obj: any): string {
  const hint = obj.hint ? `<div class="r-hint">${esc(String(obj.hint))}</div>` : ''
  return `<div class="r-error"><div class="r-error-msg">${esc(String(obj.error))}</div>${hint}</div>`
}

function renderEntityList(obj: any): string {
  const total = obj.total !== undefined ? `<div class="r-summary">共 ${obj.total} 个实体${obj.showing !== undefined ? `，显示 ${obj.showing}` : ''}</div>` : ''
  const cards = (obj.entities as any[]).map((e, i) => {
    const typeLabel = getTypeLabel(e.type || '?')
    const name = esc(e.name || e.id?.slice(0, 8) || '?')
    let tags = ''
    if (e.preview && typeof e.preview === 'object') {
      const entries = Object.entries(e.preview as Record<string, unknown>).slice(0, 4)
      tags = entries.map(([k, v]) => `<span class="r-tag">${esc(translateKey(k))}: ${esc(String(v))}</span>`).join('')
    }
    let desc = ''
    if (e.description) {
      const d = String(e.description)
      desc = `<div class="r-desc">${esc(d.length > 200 ? d.slice(0, 200) + '…' : d)}</div>`
    }
    const detailId = `ec-detail-${i}-${(e.id || '').slice(0, 8)}`
    const hasDetail = tags || desc
    const toggle = hasDetail ? `<span class="r-ec-toggle" data-toggle="${detailId}">▸</span>` : '<span class="r-ec-spacer"></span>'
    const detailWrap = hasDetail ? `<div class="r-ec-detail" id="${detailId}">${tags ? `<div class="r-tags">${tags}</div>` : ''}${desc}</div>` : ''
    const entityId = e.id ? `data-entity-id="${esc(e.id)}"` : ''
    const actions = `<div class="r-ec-actions"><span class="r-ec-btn" data-action="view" ${entityId}>查看</span><span class="r-ec-btn" data-action="edit" ${entityId}>编辑</span></div>`
    return `<div class="r-entity-card"><div class="r-ec-head">${toggle}<span class="r-ec-name">${name}</span><span class="r-ec-type">${typeLabel}</span></div>${detailWrap}${actions}</div>`
  }).join('')
  return `${total}${cards}`
}

function renderDailyReport(obj: any): string {
  const date = obj.date ? `<div class="r-date">${esc(obj.date)}</div>` : ''
  const summary = obj.summary || obj
  const stats = [
    summary.totalEntities !== undefined ? `<div class="r-stat"><div class="r-stat-num">${summary.totalEntities}</div><div class="r-stat-label">实体</div></div>` : '',
    summary.totalRelations !== undefined ? `<div class="r-stat"><div class="r-stat-num">${summary.totalRelations}</div><div class="r-stat-label">关系</div></div>` : '',
  ].filter(Boolean).join('')
  const statsRow = stats ? `<div class="r-stats">${stats}</div>` : ''
  let dist = ''
  if (summary.typeDistribution && typeof summary.typeDistribution === 'object') {
    const tags = Object.entries(summary.typeDistribution as Record<string, unknown>).map(([k, v]) => {
      return `<span class="r-dist-tag">${getTypeLabel(k)} ×${v}</span>`
    }).join('')
    dist = `<div class="r-dist">${tags}</div>`
  }
  return `<div class="r-report">${date}${statsRow}${dist}</div>`
}

function renderSuccess(obj: any): string {
  const name = obj.name || obj.message || '操作成功'
  const id = obj.id ? `<div class="r-id">标识: ${esc(obj.id.slice(0, 8))}…</div>` : ''
  const key = obj.key ? `<div class="r-id">键: ${esc(String(obj.key))}</div>` : ''
  const action = obj.action ? `<div class="r-id">操作: ${esc(String(obj.action))}</div>` : ''
  return `<div class="r-success"><div class="r-success-name">✓ ${esc(name)}</div>${id}${key}${action}</div>`
}

function renderFallback(obj: any): string {
  const entries = Object.entries(obj).filter(([k]) => k !== 'success' && k !== 'ok').slice(0, 8)
  const rows = entries.map(([k, v]) => {
    const val = typeof v === 'object' ? JSON.stringify(v) : translateValue(v)
    return `<div class="r-kv-row"><span class="r-kv-key">${esc(translateKey(k))}</span><span class="r-kv-val">${esc(val.length > 80 ? val.slice(0, 80) + '…' : val)}</span></div>`
  }).join('')
  return `<div class="r-fallback">${rows}</div>`
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function onA2UIAction(surfaceId: string, action: { name: string; data?: any }): void {
  const dataStr = action.data ? JSON.stringify(action.data) : ''
  const steerText = dataStr
    ? `[A2UI Action] surface=${surfaceId} action=${action.name} data=${dataStr}`
    : `[A2UI Action] surface=${surfaceId} action=${action.name}`
  if (isStreaming.value) {
    steer(steerText)
  } else {
    sendMessage(steerText)
  }
}

const previewVisible = ref(true)
const panelX = ref(Math.max(0, window.innerWidth - 780))
const panelY = ref(200)
let dragState: { startX: number; startY: number; origX: number; origY: number } | null = null

const panelStyle = computed(() => ({
  left: `${panelX.value}px`,
  top: `${panelY.value}px`,
}))

function closePreview(): void {
  previewVisible.value = false
}

function onDragStart(e: MouseEvent): void {
  if ((e.target as HTMLElement).closest('.preview-close')) return
  dragState = { startX: e.clientX, startY: e.clientY, origX: panelX.value, origY: panelY.value }
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
  e.preventDefault()
}

function onDragMove(e: MouseEvent): void {
  if (!dragState) return
  const dx = e.clientX - dragState.startX
  const dy = e.clientY - dragState.startY
  panelX.value = Math.max(0, Math.min(window.innerWidth - 100, dragState.origX + dx))
  panelY.value = Math.max(0, Math.min(window.innerHeight - 60, dragState.origY + dy))
}

function onDragEnd(): void {
  dragState = null
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
}

function formatDuration(tc: ToolCallView): string {
  const end = tc.endedAt || Date.now()
  const ms = end - tc.startedAt
  if (ms < 1000) return `${ms}毫秒`
  return `${(ms / 1000).toFixed(1)}秒`
}

function formatGenDuration(task: { startedAt: number; endedAt?: number }): string {
  const end = task.endedAt || Date.now()
  const ms = end - task.startedAt
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`
  return `${(ms / 60000).toFixed(1)}min`
}
</script>

<style scoped>
.agent-preview {
  position: fixed;
  width: 340px;
  max-height: 480px;
  background: var(--agent-bg, rgba(26, 26, 46, 0.75));
  backdrop-filter: blur(var(--agent-blur, 16px));
  border: 1px solid var(--agent-border, rgba(58, 58, 106, 0.4));
  border-radius: var(--agent-radius, 14px);
  box-shadow: 0 0 0 1px rgba(255,255,255,0.06), 0 4px 20px rgba(0, 0, 0, 0.3);
  pointer-events: auto;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  overflow: clip;
}

.preview-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--agent-border, rgba(58, 58, 106, 0.3));
  cursor: grab;
  user-select: none;
}

.preview-header:active { cursor: grabbing }

.status-dot {
  font-size: var(--font-size-xs);
  color: #666;
}

.status-dot.active {
  color: #4caf50;
  animation: ws-pulse 1.5s infinite;
}



.status-text {
  font-size: var(--font-size-sm);
  color: var(--agent-text, #e0e0e0);
  font-family: var(--agent-font, sans-serif);
}

.tool-count {
  font-size: var(--font-size-xs);
  color: var(--agent-text-tertiary, #888);
  flex: 1;
  text-align: right;
}

.preview-close {
  background: none;
  border: none;
  color: var(--agent-text-secondary, #888);
  cursor: pointer;
  font-size: var(--font-size-base);
  margin-left: 4px;
}

.preview-body {
  flex: 1;
  overflow-y: auto;
  padding: 10px 14px;
}

.thinking-indicator {
  font-size: var(--font-size-sm);
  color: var(--agent-text-secondary, #aaa);
  margin-bottom: 8px;
}

.preview-a2ui {
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--agent-border, rgba(58, 58, 106, 0.15));
}

.preview-a2ui :deep(.a2ui-surface) {
  background: transparent;
  border: none;
  padding: 0;
  box-shadow: none;
}

.tool-call-item {
  padding: 8px 10px;
  margin-bottom: 6px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid transparent;
  transition: border-color 0.15s;
}

.tool-call-item.tc-running {
  border-color: rgba(108, 92, 231, 0.3);
}

.tool-call-item.tc-completed {
  opacity: 0.7;
}

.tc-completed-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  margin-bottom: 6px;
  border-radius: 8px;
  background: rgba(34, 197, 94, 0.06);
  border: 1px solid rgba(34, 197, 94, 0.15);
  color: rgba(34, 197, 94, 0.8);
  font-size: 12px;
  cursor: pointer;
  user-select: none;
}

.tc-header {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
}

.tc-icon { font-size: var(--font-size-sm); }
.tc-name { flex: 1; color: var(--agent-text, #e0e0e0); font-family: var(--agent-font, sans-serif); font-weight: var(--font-weight-medium); }
.tc-time { color: #888; font-size: var(--font-size-xs); }
.tc-toggle { font-size: var(--font-size-xs); color: var(--agent-text-tertiary, #666); }

.tc-progress {
  margin-top: 6px;
  height: 3px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: var(--agent-primary, #6c5ce7);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.tc-detail {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--agent-border, rgba(58, 58, 106, 0.15));
}

.tc-label {
  font-size: var(--font-size-xs);
  color: var(--agent-text-tertiary, #666);
  margin-bottom: 3px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.tc-kv-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tc-kv-row {
  display: flex;
  gap: 6px;
  font-size: var(--font-size-xs);
  line-height: 1.4;
}

.tc-kv-key {
  color: #b388ff;
  min-width: 40px;
  font-weight: var(--font-weight-medium);
  flex-shrink: 0;
}

.tc-kv-val {
  color: #aaa;
  word-break: break-all;
}

.tc-result-block {
  margin-top: 6px;
}

:deep(.r-error) {
  background: rgba(255, 107, 107, 0.06);
  border-left: 3px solid #ff6b6b;
  border-radius: 0 6px 6px 0;
  padding: 8px 10px;
}

:deep(.r-error-msg) {
  font-size: var(--font-size-sm);
  color: #ff6b6b;
  font-weight: var(--font-weight-medium);
}

:deep(.r-hint) {
  font-size: var(--font-size-sm);
  color: #888;
  margin-top: 4px;
}

:deep(.r-success) {
  background: rgba(76, 175, 80, 0.06);
  border-left: 3px solid #4caf50;
  border-radius: 0 6px 6px 0;
  padding: 8px 10px;
}

:deep(.r-success-name) {
  font-size: var(--font-size-sm);
  color: #4caf50;
  font-weight: var(--font-weight-semibold);
}

:deep(.r-id) {
  font-size: var(--font-size-xs);
  color: #666;
  font-family: 'Consolas', 'Monaco', monospace;
  margin-top: 2px;
}

:deep(.r-summary) {
  font-size: var(--font-size-xs);
  color: #888;
  margin-bottom: 6px;
}

:deep(.r-entity-card) {
  background: rgba(108, 92, 231, 0.06);
  border: 1px solid rgba(108, 92, 231, 0.12);
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 4px;
}

:deep(.r-ec-head) {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  cursor: pointer;
  user-select: none;
}

:deep(.r-ec-toggle) {
  font-size: 10px;
  color: var(--agent-accent, #b388ff);
  cursor: pointer;
  width: 14px;
  text-align: center;
  transition: transform 0.15s;
}

:deep(.r-ec-toggle.open) {
  transform: rotate(90deg);
}

:deep(.r-ec-detail) {
  display: none;
  padding-top: 4px;
  border-top: 1px solid rgba(108, 92, 231, 0.08);
  margin-top: 2px;
}

:deep(.r-ec-detail.open) {
  display: block;
}

:deep(.r-ec-spacer) {
  display: inline-block;
  width: 14px;
}

:deep(.r-ec-actions) {
  display: flex;
  gap: 8px;
  padding-top: 4px;
  margin-top: 2px;
  border-top: 1px solid rgba(108, 92, 231, 0.08);
}

:deep(.r-ec-btn) {
  font-size: 11px;
  color: var(--agent-accent, #b388ff);
  cursor: pointer;
  padding: 1px 6px;
  border-radius: 4px;
  transition: background 0.15s;
}

:deep(.r-ec-btn:hover) {
  background: rgba(108, 92, 231, 0.12);
}

:deep(.r-ec-name) {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: #fff;
  flex: 1;
}

:deep(.r-ec-type) {
  font-size: var(--font-size-xs);
  background: rgba(108, 92, 231, 0.2);
  color: #b388ff;
  padding: 1px 6px;
  border-radius: 3px;
}

:deep(.r-tags) {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

:deep(.r-tag) {
  font-size: var(--font-size-xs);
  background: rgba(255, 255, 255, 0.06);
  padding: 1px 6px;
  border-radius: 3px;
  color: #aaa;
}

:deep(.r-desc) {
  font-size: var(--font-size-xs);
  color: #777;
  margin-top: 4px;
  line-height: 1.3;
}

:deep(.r-report) {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(58, 58, 106, 0.15);
  border-radius: 6px;
  padding: 10px;
}

:deep(.r-date) {
  font-size: var(--font-size-xs);
  color: #888;
  margin-bottom: 6px;
}

:deep(.r-stats) {
  display: flex;
  gap: 8px;
  margin-bottom: 6px;
}

:deep(.r-stat) {
  flex: 1;
  text-align: center;
  background: rgba(108, 92, 231, 0.08);
  border-radius: 4px;
  padding: 4px;
}

:deep(.r-stat-num) {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: #b388ff;
}

:deep(.r-stat-label) {
  font-size: var(--font-size-xs);
  color: #888;
}

:deep(.r-dist) {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

:deep(.r-dist-tag) {
  font-size: var(--font-size-xs);
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.06);
  color: #aaa;
}

:deep(.r-fallback) {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

:deep(.r-kv-row) {
  display: flex;
  gap: 6px;
  font-size: var(--font-size-xs);
  line-height: 1.4;
}

:deep(.r-kv-key) {
  color: #b388ff;
  min-width: 40px;
  font-weight: var(--font-weight-medium);
  flex-shrink: 0;
}

:deep(.r-kv-val) {
  color: #aaa;
  word-break: break-all;
}

:deep(.r-text) {
  font-size: var(--font-size-xs);
  color: #aaa;
  font-family: 'Consolas', 'Monaco', monospace;
  white-space: pre-wrap;
  word-break: break-word;
}

.gen-section {
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--agent-border, rgba(58, 58, 106, 0.15));
}

.gen-section-title {
  font-size: var(--font-size-xs, 11px);
  color: var(--agent-text-secondary, #aaa);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.gen-card {
  padding: 6px 8px;
  margin-bottom: 4px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(108, 92, 231, 0.1);
}

.gen-card.gen-image { border-left: 2px solid #6c5ce7; }
.gen-card.gen-video { border-left: 2px solid #e17055; }

.gen-card-header {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 2px;
}

.gen-card-icon { font-size: 12px; }
.gen-card-label { font-size: var(--font-size-xs, 11px); font-weight: var(--font-weight-medium, 500); color: var(--agent-text, #e0e0e0); flex: 1; }
.gen-card-model { font-size: 10px; color: var(--agent-text-tertiary, #888); }

.gen-card-prompt {
  font-size: 10px;
  color: var(--agent-text-secondary, #aaa);
  margin-bottom: 4px;
}

.gen-card-progress {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}

.gen-card-track {
  flex: 1;
  height: 3px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.gen-card-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease;
  background: var(--agent-primary, #6c5ce7);
}

.gen-video .gen-card-fill { background: #e17055; }

.gen-card-pct {
  font-size: 10px;
  color: var(--agent-accent, #b388ff);
  font-weight: var(--font-weight-semibold, 600);
  min-width: 28px;
  text-align: right;
}

.gen-card-meta {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--agent-text-tertiary, #888);
}

</style>
