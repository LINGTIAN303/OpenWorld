// 14 个内置节点的 handler adapter
//
// Phase 2.5: 把 nodes/*.ts 中已实现的 NodeTypeDefinition 统一注册到 nodeRegistry。
// 这样 dispatch_listener 在收到 `workflow:dispatch` event 时可以直接查 handler。
//
// 命名约定：每个 builtin 类型一个常量，值是 NodeTypeDefinition（re-export 自 nodes/）。
// 这样 14 个节点 = 14 个迁移条目（与 plan 一致），但 execute 实现仍集中在 nodes/ 避免重复。

import { nodeRegistry } from '../node-registry'

import { startNode } from '../nodes/start'
import { endNode } from '../nodes/end'
import { skillNode } from '../nodes/skill-node'
import { toolNode } from '../nodes/tool-node'
import { subAgentNode } from '../nodes/sub-agent-node'
import { conditionNode } from '../nodes/condition-node'
import { agentDecisionNode } from '../nodes/agent-decision-node'
import { parallelNode } from '../nodes/parallel-node'
import { subWorkflowNode } from '../nodes/sub-workflow-node'
import { codeNode } from '../nodes/code-node'
import { pivotNode } from '../nodes/pivot'
import { loopNode } from '../nodes/loop-node'
import { iterateNode } from '../nodes/iterate-node'
import { skipNode } from '../nodes/skip-node'

import type { NodeTypeDefinition } from '../types'

/** 14 个 builtin handler 的统一列表（与 plan "14 个节点逐个迁移" 对齐） */
export const builtinHandlers: ReadonlyArray<{ type: string; def: NodeTypeDefinition }> = [
  { type: 'start', def: startNode },
  { type: 'end', def: endNode },
  { type: 'skill', def: skillNode },
  { type: 'tool', def: toolNode },
  { type: 'sub_agent', def: subAgentNode },
  { type: 'condition', def: conditionNode },
  { type: 'agent_decision', def: agentDecisionNode },
  { type: 'parallel', def: parallelNode },
  { type: 'sub_workflow', def: subWorkflowNode },
  { type: 'code', def: codeNode },
  { type: 'pivot', def: pivotNode },
  { type: 'loop', def: loopNode },
  { type: 'iterate', def: iterateNode },
  { type: 'skip', def: skipNode },
]

/** 把 14 个 builtin handler 注册到 nodeRegistry。重复注册会被覆盖（NodeRegistry 行为）。 */
export function registerBuiltinHandlers(): void {
  for (const { def } of builtinHandlers) {
    nodeRegistry.register(def)
  }
}
