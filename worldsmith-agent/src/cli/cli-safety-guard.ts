import type { IUIStore } from '../toolbus/types'

const SENSITIVE_TOOL_PATTERNS: RegExp[] = [
  /entity_delete/i,
  /entity_remove/i,
  /relation_delete/i,
  /relation_remove/i,
  /file_delete/i,
  /file_remove/i,
  /file_write/i,
  /file_create/i,
  /file_add/i,
  /batch_/i,
  /module_builder_remove/i,
  /module_builder_update/i,
  /fs_delete/i,
  /fs_move/i,
  /fs_write/i,
  /pkg_install/i,
  /git_commit/i,
  /git_branch/i,
  /web_fetch_cli/i,
  /execute_command/i,
  /launch_terminal/i,
  /launch_terminal_script/i,
]

const SENSITIVE_ARG_PATTERNS: { key: string; values?: RegExp[] }[] = [
  { key: 'action', values: [/delete/i, /remove/i, /destroy/i, /drop/i] },
  { key: 'confirm', values: [/^true$/i, /^yes$/i, /^1$/] },
]

export function createCLISafetyGuard(uiStore: IUIStore) {
  return async (info: { toolCall: { name: string; args: Record<string, unknown> } }): Promise<{ block: boolean; reason?: string } | void> => {
    const { name, args } = info.toolCall

    const isSensitiveByName = SENSITIVE_TOOL_PATTERNS.some(p => p.test(name))

    const isSensitiveByArgs = SENSITIVE_ARG_PATTERNS.some(({ key, values }) => {
      const val = args[key]
      if (val === undefined) return false
      if (!values || values.length === 0) return true
      const strVal = String(val)
      return values.some(p => p.test(strVal))
    })

    if (!isSensitiveByName && !isSensitiveByArgs) return undefined

    const argSummary = Object.entries(args)
      .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(', ')

    const approved = await uiStore.confirm(
      '⚠️ 操作确认',
      `工具 "${name}" 将执行本地操作 (${argSummary || '无参数'}), 是否继续？`,
    )

    if (!approved) {
      return { block: true, reason: `用户拒绝了 "${name}" 操作` }
    }

    return undefined
  }
}
