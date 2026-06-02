export type NodeGroup = 'flow' | 'smart' | 'loop' | 'advanced'

export interface NodeConfigFieldSchema {
  type: 'string' | 'number' | 'boolean' | 'select' | 'array'
  label: string
  label_zh: string
  required?: boolean
  default?: unknown
  options?: string[]
  options_zh?: string[]
  placeholder?: string
  placeholder_zh?: string
}

export interface NodeMetadata {
  type: string
  category: 'builtin' | 'plugin'
  label: string
  label_zh: string
  icon: string
  color: string
  pluginId: string
  description: string
  description_zh: string
  group: NodeGroup
  simplifiedFields: string[]
  configSchema: Record<string, NodeConfigFieldSchema>
}

export interface EditorNodeData {
  label: string
  type: string
  config: Record<string, unknown>
  icon: string
  color: string
  error_handling?: unknown
  timeout?: number
  sub_graph?: unknown
}

export const NODE_GROUPS: { key: NodeGroup; label: string; icon: string }[] = [
  { key: 'flow', label: '流程控制', icon: 'outline' },
  { key: 'smart', label: '智能节点', icon: 'lightning' },
  { key: 'loop', label: '循环与并行', icon: 'refresh' },
  { key: 'advanced', label: '高级', icon: 'settings' },
]

export const VALIDATION_MESSAGES: Record<string, string> = {
  'missing_start': '工作流需要一个开始节点',
  'multiple_start': '只能有一个开始节点',
  'missing_end': '工作流需要一个结束节点',
  'no_edges': '节点之间没有连接',
  'orphan_node': '节点「{name}」未连接到流程中',
  'missing_expression': '请在「条件判断」节点中填写判断条件',
  'missing_skill_id': '请选择一个技能',
  'missing_tool_name': '请填写工具名称',
  'missing_agent_type': '请填写智能体类型',
  'missing_code': '请填写代码内容',
  'missing_target': '请填写跳转目标节点',
  'missing_workflow_id': '请选择要调用的工作流',
  'missing_collection': '请填写要遍历的集合路径',
  'save_success': '工作流已保存',
  'run_started': '工作流开始运行',
}

export const builtinNodeMetadata: NodeMetadata[] = [
  {
    type: 'start',
    category: 'builtin',
    label: 'Start',
    label_zh: '开始',
    icon: 'play',
    color: '#22C55E',
    pluginId: 'workflow',
    description: 'Workflow entry point',
    description_zh: '工作流的起点，每个工作流必须有一个',
    group: 'flow',
    simplifiedFields: [],
    configSchema: {},
  },
  {
    type: 'end',
    category: 'builtin',
    label: 'End',
    label_zh: '结束',
    icon: 'close',
    color: '#EF4444',
    pluginId: 'workflow',
    description: 'Workflow exit point',
    description_zh: '工作流的终点，标记流程结束',
    group: 'flow',
    simplifiedFields: [],
    configSchema: {},
  },
  {
    type: 'pivot',
    category: 'builtin',
    label: 'Pivot',
    label_zh: '支点',
    icon: 'pin',
    color: '#6B7280',
    pluginId: 'workflow',
    description: 'No-op anchor for organizing flow',
    description_zh: '无逻辑操作的锚点，用于组织流程和跳转目标',
    group: 'flow',
    simplifiedFields: [],
    configSchema: {},
  },
  {
    type: 'condition',
    category: 'builtin',
    label: 'Condition',
    label_zh: '条件判断',
    icon: 'chevron-down',
    color: '#F59E0B',
    pluginId: 'workflow',
    description: 'Branch based on context variable',
    description_zh: '根据条件判断走不同分支，类似"如果...那么...否则"',
    group: 'flow',
    simplifiedFields: ['expression'],
    configSchema: {
      expression: { type: 'string', label: 'Expression', label_zh: '判断条件', required: true, placeholder: 'e.g. ctx.vars.score > 80', placeholder_zh: '例如：ctx.vars.score > 80' },
    },
  },
  {
    type: 'agent_decision',
    category: 'builtin',
    label: 'AI Decision',
    label_zh: 'AI 决策',
    icon: 'lightning',
    color: '#EC4899',
    pluginId: 'workflow',
    description: 'Pause and let AI decide',
    description_zh: '暂停工作流，交由 AI 判断下一步走哪条路',
    group: 'smart',
    simplifiedFields: ['question', 'options'],
    configSchema: {
      question: { type: 'string', label: 'Question', label_zh: '决策问题', required: true, placeholder: 'What should we do next?', placeholder_zh: '例如：应该继续还是停止？' },
      options: { type: 'array', label: 'Options', label_zh: '选项列表', required: true, placeholder: '["continue", "stop"]', placeholder_zh: '["继续", "停止"]' },
    },
  },
  {
    type: 'skip',
    category: 'builtin',
    label: 'Skip',
    label_zh: '跳过线',
    icon: 'chevron-right',
    color: '#A855F7',
    pluginId: 'workflow',
    description: 'Jump to a target node',
    description_zh: '跳转到指定节点，跳过中间步骤',
    group: 'flow',
    simplifiedFields: ['target'],
    configSchema: {
      target: { type: 'string', label: 'Target Node ID', label_zh: '跳转到', required: true, placeholder: 'Node ID', placeholder_zh: '输入目标节点 ID' },
      condition: { type: 'string', label: 'Skip Condition', label_zh: '跳过条件', placeholder: 'Leave empty for unconditional', placeholder_zh: '留空则无条件跳过' },
    },
  },
  {
    type: 'skill',
    category: 'builtin',
    label: 'Skill',
    label_zh: '技能',
    icon: 'star',
    color: '#8B5CF6',
    pluginId: 'workflow',
    description: 'Activate a skill',
    description_zh: '激活一个技能来执行特定任务',
    group: 'smart',
    simplifiedFields: ['skill_id', 'prompt', 'output_preference_channel'],
    configSchema: {
      skill_id: { type: 'string', label: 'Skill ID', label_zh: '选择技能', required: true, placeholder: 'e.g. writing-assistant', placeholder_zh: '例如：writing-assistant' },
      prompt: { type: 'string', label: 'Prompt', label_zh: '提示词', required: true, placeholder: 'Describe the task...', placeholder_zh: '描述你想要完成的任务...' },
      output_preference_channel: { type: 'select', label: 'Output Channel', label_zh: '输出到', options: ['chat', 'a2ui', 'plugin', 'file'], options_zh: ['聊天窗口', 'A2UI 通道', '插件', '文件'] },
      output_preference_component: { type: 'string', label: 'Output Component', label_zh: '输出组件', placeholder: '(optional)', placeholder_zh: '（可选）' },
      allowed_tools: { type: 'array', label: 'Allowed Tools', label_zh: '限制工具', placeholder: '["tool1", "tool2"]', placeholder_zh: '["工具1", "工具2"]' },
      timeout: { type: 'number', label: 'Timeout (ms)', label_zh: '超时(ms)', placeholder: '30000', placeholder_zh: '30000' },
    },
  },
  {
    type: 'tool',
    category: 'builtin',
    label: 'Tool',
    label_zh: '工具',
    icon: 'settings',
    color: '#3B82F6',
    pluginId: 'workflow',
    description: 'Call a single tool',
    description_zh: '调用一个工具来执行操作',
    group: 'smart',
    simplifiedFields: ['tool_name', 'arguments'],
    configSchema: {
      tool_name: { type: 'string', label: 'Tool Name', label_zh: '工具名称', required: true, placeholder: 'e.g. web_search', placeholder_zh: '例如：web_search' },
      arguments: { type: 'string', label: 'Arguments (JSON)', label_zh: '参数', placeholder: '{"key": "value"}', placeholder_zh: '{"键": "值"}' },
    },
  },
  {
    type: 'sub_agent',
    category: 'builtin',
    label: 'SubAgent',
    label_zh: '子智能体',
    icon: 'character',
    color: '#06B6D4',
    pluginId: 'workflow',
    description: 'Dispatch a sub-agent',
    description_zh: '调度一个子智能体来执行任务',
    group: 'smart',
    simplifiedFields: ['agent_type', 'prompt'],
    configSchema: {
      agent_type: { type: 'string', label: 'Agent Type', label_zh: '智能体类型', required: true, placeholder: 'e.g. researcher', placeholder_zh: '例如：researcher' },
      prompt: { type: 'string', label: 'Task Description', label_zh: '任务描述', required: true, placeholder: 'Describe the task...', placeholder_zh: '描述你想要完成的任务...' },
      timeout: { type: 'number', label: 'Timeout (ms)', label_zh: '超时(ms)', placeholder: '30000', placeholder_zh: '30000' },
    },
  },
  {
    type: 'code',
    category: 'builtin',
    label: 'Code',
    label_zh: '自定义代码',
    icon: 'keyboard',
    color: '#84CC16',
    pluginId: 'workflow',
    description: 'Execute custom JavaScript',
    description_zh: '在沙箱中执行自定义 JavaScript 代码',
    group: 'advanced',
    simplifiedFields: ['code'],
    configSchema: {
      code: { type: 'string', label: 'Code', label_zh: '代码', required: true, placeholder: '// Your code here', placeholder_zh: '// 在此编写代码' },
      timeout: { type: 'number', label: 'Timeout (ms)', label_zh: '超时(ms)', placeholder: '30000', placeholder_zh: '30000' },
    },
  },
  {
    type: 'loop',
    category: 'builtin',
    label: 'Loop',
    label_zh: '重复执行',
    icon: 'refresh',
    color: '#F97316',
    pluginId: 'workflow',
    description: 'Repeat sub-graph N times',
    description_zh: '重复执行子图，直到达到次数或条件不满足',
    group: 'loop',
    simplifiedFields: ['max_iterations', 'condition'],
    configSchema: {
      max_iterations: { type: 'number', label: 'Max Iterations', label_zh: '最大次数', required: true, placeholder: '10', placeholder_zh: '10' },
      condition: { type: 'string', label: 'Continue Condition', label_zh: '继续条件', placeholder: 'Leave empty for count-only', placeholder_zh: '留空则仅按次数循环' },
      item_var: { type: 'string', label: 'Iteration Variable', label_zh: '迭代变量名', placeholder: 'i', placeholder_zh: 'i' },
    },
  },
  {
    type: 'iterate',
    category: 'builtin',
    label: 'Iterate',
    label_zh: '遍历集合',
    icon: 'refresh',
    color: '#14B8A6',
    pluginId: 'workflow',
    description: 'Iterate over a collection',
    description_zh: '遍历集合中的每个元素，对每个元素执行子图',
    group: 'loop',
    simplifiedFields: ['collection', 'item_var'],
    configSchema: {
      collection: { type: 'string', label: 'Collection Path', label_zh: '集合路径', required: true, placeholder: 'ctx.vars.items', placeholder_zh: '例如：ctx.vars.items' },
      item_var: { type: 'string', label: 'Item Variable', label_zh: '元素变量名', placeholder: 'item', placeholder_zh: 'item' },
      concurrency: { type: 'number', label: 'Concurrency', label_zh: '并行度', placeholder: '1', placeholder_zh: '1' },
    },
  },
  {
    type: 'parallel',
    category: 'builtin',
    label: 'Parallel',
    label_zh: '并行执行',
    icon: 'lightning',
    color: '#EAB308',
    pluginId: 'workflow',
    description: 'Execute branches in parallel',
    description_zh: '同时执行多个分支，所有分支完成后继续',
    group: 'loop',
    simplifiedFields: [],
    configSchema: {},
  },
  {
    type: 'sub_workflow',
    category: 'builtin',
    label: 'Sub Workflow',
    label_zh: '子工作流',
    icon: 'manuscript',
    color: '#6366F1',
    pluginId: 'workflow',
    description: 'Call another workflow',
    description_zh: '调用另一个已保存的工作流',
    group: 'advanced',
    simplifiedFields: ['workflow_id'],
    configSchema: {
      workflow_id: { type: 'string', label: 'Workflow ID', label_zh: '选择工作流', required: true, placeholder: 'wf-xxx', placeholder_zh: '选择或输入工作流 ID' },
      params: { type: 'string', label: 'Parameters (JSON)', label_zh: '参数', placeholder: '{}', placeholder_zh: '{}' },
    },
  },
]
