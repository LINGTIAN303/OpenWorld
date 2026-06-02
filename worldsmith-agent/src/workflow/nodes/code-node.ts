import type { NodeTypeDefinition, NodeOutput } from '../types'

export const codeNode: NodeTypeDefinition = {
  type: 'code',
  category: 'builtin',
  label: '代码',
  icon: '💻',
  color: '#84CC16',
  pluginId: 'workflow',
  description: '在沙箱中执行自定义 JavaScript 代码',
  configSchema: {
    code: { type: 'string', label: '代码', required: true },
    timeout: { type: 'number', label: '超时(ms)' },
  },
  async execute(config, ctx, _api): Promise<NodeOutput> {
    const startTime = Date.now()
    const code = config.code as string

    try {
      const sandboxedCtx = {
        params: ctx.params,
        nodes: ctx.nodes,
        variables: ctx.variables,
        loop_results: ctx.loop_results,
        iterate_results: ctx.iterate_results,
      }
      const fn = new Function('ctx', `"use strict"; const {params,nodes,variables,loop_results,iterate_results}=ctx; ${code}`)
      const result = fn(sandboxedCtx)
      return { status: 'success', data: result, duration: Date.now() - startTime }
    } catch (err) {
      return { status: 'failed', data: null, error: err instanceof Error ? err.message : String(err), duration: Date.now() - startTime }
    }
  },
}
