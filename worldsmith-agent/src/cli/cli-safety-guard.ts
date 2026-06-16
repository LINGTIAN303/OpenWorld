/**
 * CLI 安全守卫
 *
 * 基于 @worldsmith/agent-core 的 PermissionGuard，
 * 从工具元数据自动解析权限级别，取代硬编码正则列表。
 */

import { PermissionGuard } from '@worldsmith/agent-core'
import type { IUIStore } from '../toolbus/types'
import { getToolMeta } from '../tools/tool-meta-registry'

export function createCLISafetyGuard(uiStore: IUIStore) {
  const guard = new PermissionGuard(getToolMeta, {
    confirmModerate: true,
    confirmDangerous: true,
  })

  return async (info: { toolCall: { name: string; args: Record<string, unknown> } }): Promise<{ block: boolean; reason?: string } | void> => {
    const { name, args } = info.toolCall
    const result = guard.check(name, args)

    if (!result.needsConfirm) return undefined

    const displayName = result.displayName || name
    const argSummary = Object.entries(args)
      .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(', ')

    const levelLabel = result.level === 'dangerous' ? '⚠️ 危险操作' : '操作确认'
    const reasonText = result.reason ? `\n原因：${result.reason}` : ''

    const approved = await uiStore.confirm(
      levelLabel,
      `工具 "${displayName}" 将执行${result.level === 'dangerous' ? '不可逆' : '修改'}操作 (${argSummary || '无参数'})${reasonText}，是否继续？`,
    )

    if (!approved) {
      return { block: true, reason: `用户拒绝了 "${displayName}" 操作` }
    }

    return undefined
  }
}
