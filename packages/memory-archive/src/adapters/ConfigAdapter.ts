/**
 * 配置持久化接口（P2 新增）
 *
 * 宿主实现此接口以将配置持久化到项目级存储。
 * 框架内置默认实现使用内存配置（不持久化）。
 */

import type { ArchiveConfig } from '../types'

export interface ConfigAdapter {
  loadConfig(): Promise<ArchiveConfig | null>
  saveConfig(config: ArchiveConfig): Promise<void>
}
