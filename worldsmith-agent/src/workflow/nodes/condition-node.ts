import type { NodeTypeDefinition, WorkflowContext, NodeOutput } from '../types'
import { resolveVar } from '../resolvers/template-resolver'

export const conditionNode: NodeTypeDefinition = {
  type: 'condition',
  category: 'builtin',
  label: '条件',
  icon: '🔀',
  color: '#F59E0B',
  pluginId: 'workflow',
  description: '基于上下文变量进行条件分支',
  configSchema: {
    expression: { type: 'string', label: '条件表达式', required: true },
  },
  async execute(config, ctx, _api): Promise<NodeOutput> {
    const expression = config.expression as string
    const result = evaluateCondition(expression, ctx)
    return { status: 'success', data: { branch: result ? 'true' : 'false' }, duration: 0 }
  },
}

function evaluateCondition(expression: string, ctx: WorkflowContext): boolean {
  const resolved = expression.replace(/\{\{([^}]+)\}\}/g, (_match, path: string) => {
    const value = resolveVar(path, ctx)
    if (value === undefined) return 'undefined'
    if (value === null) return 'null'
    if (typeof value === 'boolean') return String(value)
    if (typeof value === 'number') return String(value)
    if (typeof value === 'string') return JSON.stringify(value)
    return JSON.stringify(value)
  })

  try {
    return Function(`"use strict"; return (${resolved})`)() as boolean
  } catch {
    return false
  }
}
