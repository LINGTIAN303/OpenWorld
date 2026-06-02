import type { WorkflowContext } from '../types'

const VAR_PATTERN = /\{\{([^}]+)\}\}/g

export function resolveVar(path: string, ctx: WorkflowContext): unknown {
  const parts = path.trim().split('.')
  let current: unknown = ctx

  if (parts[0] === 'ctx') {
    parts.shift()
  }

  if (parts.length === 0) return undefined

  if (parts[0] === 'params') {
    parts.shift()
    current = ctx.params
  } else if (parts[0] === 'nodes') {
    parts.shift()
    const nodeId = parts.shift()
    if (!nodeId || !ctx.nodes[nodeId]) return undefined
    current = ctx.nodes[nodeId]
  } else if (parts[0] === 'variables') {
    parts.shift()
    current = ctx.variables
  } else if (parts[0] === 'loop_results') {
    parts.shift()
    current = ctx.loop_results
  } else if (parts[0] === 'iterate_results') {
    parts.shift()
    current = ctx.iterate_results
  }

  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }

  return current
}

export function resolveVars(template: string, ctx: WorkflowContext): string {
  return template.replace(VAR_PATTERN, (_match, path: string) => {
    const value = resolveVar(path, ctx)
    if (value === undefined) return ''
    if (typeof value === 'string') return value
    return JSON.stringify(value)
  })
}

export function resolveValue(value: unknown, ctx: WorkflowContext): unknown {
  if (typeof value === 'string') {
    if (VAR_PATTERN.test(value)) {
      const resolved = resolveVars(value, ctx)
      try { return JSON.parse(resolved) } catch { return resolved }
    }
    return value
  }
  if (Array.isArray(value)) {
    return value.map(v => resolveValue(v, ctx))
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = resolveValue(v, ctx)
    }
    return result
  }
  return value
}
