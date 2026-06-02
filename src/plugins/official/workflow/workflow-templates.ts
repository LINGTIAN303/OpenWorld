import type { WorkflowDefinition } from '../../../../worldsmith-agent/src/workflow/types'

export interface WorkflowTemplate {
  id: string
  name: string
  name_zh: string
  icon: string
  description: string
  description_zh: string
  definition: WorkflowDefinition
}

export const workflowTemplates: WorkflowTemplate[] = [
  {
    id: 'tpl-email-processing',
    name: 'Email Processing',
    name_zh: '邮件处理',
    icon: 'manuscript',
    description: 'Read emails, classify, summarize, and route notifications',
    description_zh: '读取邮件 → 分类判断 → 分别处理 → 汇总通知',
    definition: {
      id: 'tpl-email-processing',
      name: '邮件处理',
      version: 1,
      description: '读取邮件 → 分类判断 → 分别处理 → 汇总通知',
      nodes: [
        { id: 'start_1', type: 'start', config: {}, position: { x: 50, y: 300 } },
        { id: 'skill_read', type: 'skill', config: { skill_id: 'email-reader', prompt: '读取今天所有未读邮件，返回邮件列表', output_preference_channel: 'chat' }, position: { x: 220, y: 300 } },
        { id: 'iterate_emails', type: 'iterate', config: { collection: 'ctx.nodes.skill_read.data.emails', item_var: 'email' }, position: { x: 420, y: 300 }, sub_graph: { nodes: [
          { id: 'sg_classify', type: 'skill', config: { skill_id: 'classifier', prompt: '判断这封邮件的类别：紧急/普通/垃圾。邮件内容：{{ctx.vars.email}}' } },
          { id: 'sg_condition', type: 'condition', config: { expression: "ctx.nodes.sg_classify.data.category === 'urgent'" } },
          { id: 'sg_urgent', type: 'skill', config: { skill_id: 'notifier', prompt: '发送紧急通知：{{ctx.vars.email.subject}}', output_preference_channel: 'a2ui' } },
          { id: 'sg_normal', type: 'skill', config: { skill_id: 'summarizer', prompt: '总结这封邮件的要点：{{ctx.vars.email}}' } },
        ], edges: [
          { from: 'sg_classify', to: 'sg_condition' },
          { from: 'sg_condition', to: 'sg_urgent', label: '是' },
          { from: 'sg_condition', to: 'sg_normal', label: '否' },
        ] } },
        { id: 'skill_summary', type: 'skill', config: { skill_id: 'writing-assistant', prompt: '根据今天的邮件处理结果，生成一份每日邮件摘要报告', output_preference_channel: 'chat' }, position: { x: 640, y: 300 } },
        { id: 'tool_notify', type: 'tool', config: { tool_name: 'feishu_send', arguments: '{"chat_id": "{{ctx.vars.feishu_chat_id}}", "message": "{{ctx.nodes.skill_summary.data}}"}' }, position: { x: 860, y: 300 } },
        { id: 'end_1', type: 'end', config: {}, position: { x: 1060, y: 300 } },
      ],
      edges: [
        { from: 'start_1', to: 'skill_read' },
        { from: 'skill_read', to: 'iterate_emails' },
        { from: 'iterate_emails', to: 'skill_summary' },
        { from: 'skill_summary', to: 'tool_notify' },
        { from: 'tool_notify', to: 'end_1' },
      ],
    },
  },
  {
    id: 'tpl-content-creation',
    name: 'Content Creation',
    name_zh: '内容创作',
    icon: '📝',
    description: 'Research, draft, AI review loop, multi-platform publish',
    description_zh: '调研 → 起草 → AI审核循环 → 多平台发布',
    definition: {
      id: 'tpl-content-creation',
      name: '内容创作',
      version: 1,
      description: '调研 → 起草 → AI审核循环 → 多平台发布',
      nodes: [
        { id: 'start_1', type: 'start', config: {}, position: { x: 50, y: 300 } },
        { id: 'sub_agent_research', type: 'sub_agent', config: { agent_type: 'researcher', prompt: '对指定主题进行深度调研，收集关键信息和数据' }, position: { x: 220, y: 200 } },
        { id: 'skill_outline', type: 'skill', config: { skill_id: 'writing-assistant', prompt: '根据调研结果生成文章大纲：{{ctx.nodes.sub_agent_research.data}}' }, position: { x: 420, y: 200 } },
        { id: 'skill_draft', type: 'skill', config: { skill_id: 'writing-assistant', prompt: '根据大纲起草完整文章：{{ctx.nodes.skill_outline.data}}' }, position: { x: 620, y: 200 } },
        { id: 'loop_review', type: 'loop', config: { max_iterations: 3, condition: "ctx.nodes.sg_review.data.approved !== true" }, position: { x: 820, y: 300 }, sub_graph: { nodes: [
          { id: 'sg_review', type: 'agent_decision', config: { question: '文章质量是否达标？', options: [{ label: '通过', route: 'approved' }, { label: '需要修改', route: 'revise' }] } },
          { id: 'sg_revise', type: 'skill', config: { skill_id: 'writing-assistant', prompt: '根据审核意见修改文章' } },
        ], edges: [
          { from: 'sg_review', to: 'sg_revise', label: '需要修改' },
        ] } },
        { id: 'parallel_publish', type: 'parallel', config: {}, position: { x: 1020, y: 300 }, sub_graph: { nodes: [
          { id: 'sg_blog', type: 'skill', config: { skill_id: 'publisher', prompt: '发布到博客平台', output_preference_channel: 'plugin' } },
          { id: 'sg_social', type: 'skill', config: { skill_id: 'publisher', prompt: '生成社交媒体摘要并发布', output_preference_channel: 'plugin' } },
          { id: 'sg_translate', type: 'sub_agent', config: { agent_type: 'translator', prompt: '将文章翻译为英文版本' } },
        ], edges: [] } },
        { id: 'skill_archive', type: 'skill', config: { skill_id: 'archiver', prompt: '将最终版本存档到知识库', output_preference_channel: 'plugin' }, position: { x: 1220, y: 300 } },
        { id: 'end_1', type: 'end', config: {}, position: { x: 1420, y: 300 } },
      ],
      edges: [
        { from: 'start_1', to: 'sub_agent_research' },
        { from: 'sub_agent_research', to: 'skill_outline' },
        { from: 'skill_outline', to: 'skill_draft' },
        { from: 'skill_draft', to: 'loop_review' },
        { from: 'loop_review', to: 'parallel_publish' },
        { from: 'parallel_publish', to: 'skill_archive' },
        { from: 'skill_archive', to: 'end_1' },
      ],
    },
  },
  {
    id: 'tpl-data-pipeline',
    name: 'Data Pipeline',
    name_zh: '数据处理',
    icon: '📊',
    description: 'Fetch data, validate, transform, conditionally alert',
    description_zh: '获取数据 → 校验 → 清洗转换 → 条件告警 → 存储',
    definition: {
      id: 'tpl-data-pipeline',
      name: '数据处理',
      version: 1,
      description: '获取数据 → 校验 → 清洗转换 → 条件告警 → 存储',
      nodes: [
        { id: 'start_1', type: 'start', config: {}, position: { x: 50, y: 300 } },
        { id: 'parallel_fetch', type: 'parallel', config: {}, position: { x: 220, y: 300 }, sub_graph: { nodes: [
          { id: 'sg_api', type: 'tool', config: { tool_name: 'http_get', arguments: '{"url": "{{ctx.vars.api_endpoint}}"}' } },
          { id: 'sg_db', type: 'tool', config: { tool_name: 'db_query', arguments: '{"sql": "{{ctx.vars.query_sql}}"}' } },
          { id: 'sg_file', type: 'tool', config: { tool_name: 'file_read', arguments: '{"path": "{{ctx.vars.data_file}}"}' } },
        ], edges: [] } },
        { id: 'code_validate', type: 'code', config: { code: 'const api = ctx.nodes.sg_api?.data;\nconst db = ctx.nodes.sg_db?.data;\nconst file = ctx.nodes.sg_file?.data;\nconst errors = [];\nif (!api || api.error) errors.push("API数据异常");\nif (!db || db.error) errors.push("数据库查询失败");\nif (!file || file.error) errors.push("文件读取失败");\nreturn { valid: errors.length === 0, errors, sources: { api, db, file } };' }, position: { x: 440, y: 300 } },
        { id: 'condition_check', type: 'condition', config: { expression: 'ctx.nodes.code_validate.data.valid === true' }, position: { x: 640, y: 300 } },
        { id: 'code_transform', type: 'code', config: { code: 'const { api, db, file } = ctx.nodes.code_validate.data.sources;\nconst merged = [...(api?.items || []), ...(db?.rows || []), ...(file?.records || [])];\nconst cleaned = merged.filter(item => item.id && item.value !== null);\nconst summary = { total: merged.length, valid: cleaned.length, removed: merged.length - cleaned.length };\nreturn { cleaned, summary };' }, position: { x: 860, y: 180 } },
        { id: 'skill_alert', type: 'skill', config: { skill_id: 'notifier', prompt: '数据校验失败：{{ctx.nodes.code_validate.data.errors}}', output_preference_channel: 'a2ui' }, position: { x: 860, y: 420 } },
        { id: 'skip_to_end', type: 'skip', config: { target: 'end_1' }, position: { x: 1060, y: 420 } },
        { id: 'tool_store', type: 'tool', config: { tool_name: 'db_insert', arguments: '{"table": "processed_data", "records": "{{ctx.nodes.code_transform.data.cleaned}}"}' }, position: { x: 1060, y: 180 } },
        { id: 'skill_report', type: 'skill', config: { skill_id: 'writing-assistant', prompt: '生成数据处理报告：{{ctx.nodes.code_transform.data.summary}}', output_preference_channel: 'chat' }, position: { x: 1260, y: 180 } },
        { id: 'end_1', type: 'end', config: {}, position: { x: 1460, y: 300 } },
      ],
      edges: [
        { from: 'start_1', to: 'parallel_fetch' },
        { from: 'parallel_fetch', to: 'code_validate' },
        { from: 'code_validate', to: 'condition_check' },
        { from: 'condition_check', to: 'code_transform', label: '是' },
        { from: 'condition_check', to: 'skill_alert', label: '否' },
        { from: 'skill_alert', to: 'skip_to_end' },
        { from: 'code_transform', to: 'tool_store' },
        { from: 'tool_store', to: 'skill_report' },
        { from: 'skill_report', to: 'end_1' },
      ],
    },
  },
  {
    id: 'tpl-scheduled-task',
    name: 'Scheduled Task',
    name_zh: '定时任务',
    icon: '🔄',
    description: 'Iterative monitoring with conditional escalation',
    description_zh: '循环监控 → 条件判断 → 异常升级 → 自动修复 → 报告',
    definition: {
      id: 'tpl-scheduled-task',
      name: '定时任务',
      version: 1,
      description: '循环监控 → 条件判断 → 异常升级 → 自动修复 → 报告',
      nodes: [
        { id: 'start_1', type: 'start', config: {}, position: { x: 50, y: 300 } },
        { id: 'skill_init', type: 'skill', config: { skill_id: 'initializer', prompt: '初始化监控配置，加载阈值参数' }, position: { x: 220, y: 300 } },
        { id: 'loop_monitor', type: 'loop', config: { max_iterations: 20, condition: "ctx.nodes.sg_check.data.status !== 'critical'" }, position: { x: 420, y: 300 }, sub_graph: { nodes: [
          { id: 'sg_check', type: 'tool', config: { tool_name: 'health_check', arguments: '{"services": "{{ctx.vars.monitored_services}}"}' } },
          { id: 'sg_condition', type: 'condition', config: { expression: "ctx.nodes.sg_check.data.status === 'warning'" } },
          { id: 'sg_auto_fix', type: 'sub_agent', config: { agent_type: 'fixer', prompt: '检测到警告状态，尝试自动修复：{{ctx.nodes.sg_check.data.details}}' } },
          { id: 'sg_log', type: 'skill', config: { skill_id: 'logger', prompt: '记录本轮检查结果：{{ctx.nodes.sg_check.data}}' } },
        ], edges: [
          { from: 'sg_check', to: 'sg_condition' },
          { from: 'sg_condition', to: 'sg_auto_fix', label: '是' },
          { from: 'sg_condition', to: 'sg_log', label: '否' },
          { from: 'sg_auto_fix', to: 'sg_log' },
        ] } },
        { id: 'decision_escalate', type: 'agent_decision', config: { question: '监控发现严重异常，如何处理？', options: [{ label: '升级通知', route: 'escalate' }, { label: '继续监控', route: 'continue' }, { label: '停止', route: 'stop' }] }, position: { x: 640, y: 300 } },
        { id: 'skill_escalate', type: 'skill', config: { skill_id: 'notifier', prompt: '发送紧急升级通知给运维团队', output_preference_channel: 'a2ui' }, position: { x: 860, y: 180 } },
        { id: 'skill_continue', type: 'skill', config: { skill_id: 'logger', prompt: '记录继续监控决策' }, position: { x: 860, y: 300 } },
        { id: 'skip_restart', type: 'skip', config: { target: 'loop_monitor' }, position: { x: 860, y: 420 } },
        { id: 'skill_report', type: 'skill', config: { skill_id: 'writing-assistant', prompt: '生成监控报告，包含所有检查轮次的结果和修复记录', output_preference_channel: 'chat' }, position: { x: 1060, y: 180 } },
        { id: 'tool_archive', type: 'tool', config: { tool_name: 'db_insert', arguments: '{"table": "monitor_logs", "records": "{{ctx.nodes.skill_report.data}}"}' }, position: { x: 1260, y: 180 } },
        { id: 'end_1', type: 'end', config: {}, position: { x: 1460, y: 300 } },
      ],
      edges: [
        { from: 'start_1', to: 'skill_init' },
        { from: 'skill_init', to: 'loop_monitor' },
        { from: 'loop_monitor', to: 'decision_escalate' },
        { from: 'decision_escalate', to: 'skill_escalate', label: '升级通知' },
        { from: 'decision_escalate', to: 'skill_continue', label: '继续监控' },
        { from: 'decision_escalate', to: 'skip_restart', label: '停止' },
        { from: 'skill_escalate', to: 'skill_report' },
        { from: 'skill_continue', to: 'skip_restart' },
        { from: 'skip_restart', to: 'skill_report' },
        { from: 'skill_report', to: 'tool_archive' },
        { from: 'tool_archive', to: 'end_1' },
      ],
    },
  },
]
