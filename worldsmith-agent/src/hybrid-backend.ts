/**
 * HybridBackend - 工具级路由的 Agent 后端
 *
 * 当 CLI Agent 连接时，本地类工具（shell、git、文件、lint/test/build）
 * 自动路由到 CLI Agent Server 执行；UI 类工具（A2UI、Canvas 等）走 Web 原有通道。
 * CLI Agent 断开时，所有工具回退到本地执行。
 *
 * 路由决策对用户透明，用户只感知一个 Agent。
 */
import { CoreBackend } from './bridge'
import type { AgentConfig, ToolDefinition } from './bridge-types'
import type { IToolContext } from './toolbus/types'

/** 默认的本地工具名称列表（在 CLI Agent 未连接时使用） */
const DEFAULT_LOCAL_TOOL_NAMES = new Set([
  // shell
  'shell_session', 'execute_command', 'shell_session_create', 'shell_session_exec',
  'shell_session_input', 'shell_session_destroy', 'shell_session_list',
  'detect_shells', 'detect_terminal_mode', 'launch_terminal', 'launch_terminal_script',
  // git
  'git_status', 'git_log', 'git_diff', 'git_add', 'git_commit', 'git_checkout',
  'git_branch', 'git_stash', 'git_push', 'git_pull', 'git_init',
  // file
  'read_file', 'write_file', 'search_files', 'list_directory', 'create_directory',
  'delete_file', 'move_file', 'copy_file',
  // project
  'run_lint', 'run_test', 'run_build', 'detect_project_commands',
  // system
  'sys_info', 'env_get', 'env_set',
])

export interface CliAgentConnection {
  /** 调用远程工具 */
  callTool(toolName: string, args: Record<string, unknown>): Promise<{ ok: boolean; result?: string; error?: string }>
  /** 是否已连接 */
  readonly connected: boolean
  /** 获取远程能力列表 */
  readonly remoteToolNames: ReadonlySet<string>
}

export interface HybridBackendConfig extends AgentConfig {
  /** CLI Agent 连接实例 */
  cliAgentConnection?: CliAgentConnection
}

/**
 * 创建一个代理工具定义，将 execute 代理到 CLI Agent Server
 */
function createProxiedTool(
  originalTool: ToolDefinition,
  connection: CliAgentConnection,
): ToolDefinition {
  return {
    ...originalTool,
    execute: async (args: Record<string, unknown>, _ctx: IToolContext) => {
      const result = await connection.callTool(originalTool.name, args)
      if (result.ok) {
        return result.result || ''
      }
      throw new Error(result.error || `CLI Agent 工具调用失败: ${originalTool.name}`)
    },
  }
}

export class HybridBackend extends CoreBackend {
  private _cliConnection: CliAgentConnection | null = null
  private _originalTools: Map<string, ToolDefinition> = new Map()
  private _localToolNames: Set<string> = new Set(DEFAULT_LOCAL_TOOL_NAMES)

  constructor(config: HybridBackendConfig) {
    super(config)

    // 保存原始工具映射
    for (const tool of config.tools) {
      this._originalTools.set(tool.name, tool)
    }

    // 如果初始就有 CLI 连接，立即激活路由
    if (config.cliAgentConnection?.connected) {
      this.setCliAgentConnection(config.cliAgentConnection)
    }
  }

  /** 设置/更新 CLI Agent 连接 */
  setCliAgentConnection(connection: CliAgentConnection | null): void {
    this._cliConnection = connection

    if (connection?.connected) {
      // 合并远程能力列表到本地工具名集合
      this._localToolNames = new Set([...DEFAULT_LOCAL_TOOL_NAMES, ...connection.remoteToolNames])
      this._activateProxyRouting()
    } else {
      // 回退到本地执行
      this._localToolNames = new Set(DEFAULT_LOCAL_TOOL_NAMES)
      this._deactivateProxyRouting()
    }
  }

  /** 判断工具是否应路由到 CLI Agent */
  isLocalTool(toolName: string): boolean {
    return this._localToolNames.has(toolName)
  }

  /** 激活代理路由：将本地类工具替换为远程调用版本 */
  private _activateProxyRouting(): void {
    if (!this._cliConnection) return

    const proxiedTools: ToolDefinition[] = []
    for (const [name, original] of this._originalTools) {
      if (this.isLocalTool(name)) {
        proxiedTools.push(createProxiedTool(original, this._cliConnection))
      } else {
        proxiedTools.push(original)
      }
    }

    this._reloadTools(proxiedTools)
  }

  /** 停用代理路由：恢复所有工具为本地执行版本 */
  private _deactivateProxyRouting(): void {
    const originalTools = [...this._originalTools.values()]
    this._reloadTools(originalTools)
  }

  /** 重新加载工具到 ToolBus */
  private _reloadTools(tools: ToolDefinition[]): void {
    // 清空并重新注册工具
    const bus = (this as any).toolBus
    if (bus) {
      bus.tools.clear()
      bus.toolMap.clear()
      for (const tool of tools) {
        bus.register(tool)
      }
    }
  }

  /** 获取当前路由状态（调试用） */
  getRoutingStatus(): { total: number; proxied: number; local: string[]; remote: string[] } {
    const local: string[] = []
    const remote: string[] = []
    for (const [name] of this._originalTools) {
      if (this.isLocalTool(name) && this._cliConnection?.connected) {
        remote.push(name)
      } else {
        local.push(name)
      }
    }
    return { total: this._originalTools.size, proxied: remote.length, local, remote }
  }
}

/**
 * 创建 HybridBackend 实例
 */
export function createHybridBackend(config: HybridBackendConfig): HybridBackend {
  return new HybridBackend(config)
}
