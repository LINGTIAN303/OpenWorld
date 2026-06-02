// nodeRenderers 映射表 — 按 node.type 选渲染器
//
// Phase 4.5：14 个 builtin 节点都有独立 .vue wrapper + BaseNodeRenderer 统一卡片布局。
// ThreeViewLayout 画布视图通过本表动态选 `<component :is="...">` 渲染。
//
// 添加新 type：建一个新 .vue 文件 + 在 `nodeRenderers` 加一行。

import type { Component } from 'vue'
import BaseNodeRenderer from './BaseNodeRenderer.vue'
import StartNode from './start.vue'
import EndNode from './end.vue'
import SkillNode from './skill.vue'
import ToolNode from './tool.vue'
import SubAgentNode from './sub_agent.vue'
import ConditionNode from './condition.vue'
import AgentDecisionNode from './agent_decision.vue'
import ParallelNode from './parallel.vue'
import SubWorkflowNode from './sub_workflow.vue'
import CodeNode from './code.vue'
import PivotNode from './pivot.vue'
import LoopNode from './loop.vue'
import IterateNode from './iterate.vue'
import SkipNode from './skip.vue'

export const nodeRenderers: Record<string, Component> = {
  start: StartNode,
  end: EndNode,
  skill: SkillNode,
  tool: ToolNode,
  sub_agent: SubAgentNode,
  condition: ConditionNode,
  agent_decision: AgentDecisionNode,
  parallel: ParallelNode,
  sub_workflow: SubWorkflowNode,
  code: CodeNode,
  pivot: PivotNode,
  loop: LoopNode,
  iterate: IterateNode,
  skip: SkipNode,
}

/** fallback：未知 type 用通用 BaseNodeRenderer */
export const DefaultNodeRenderer: Component = BaseNodeRenderer
