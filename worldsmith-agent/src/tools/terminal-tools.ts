import type { ToolDefinition } from '../bridge-types'
import type { IToolContext } from '../toolbus/types'
import { createExecutionAdapter } from '../execution'

const executeCommandTool: ToolDefinition = {
  name: 'execute_command',
  description: '在本地终端执行 shell 命令并返回输出。仅在需要系统级操作时使用（如文件系统操作、运行脚本、安装依赖等），项目数据操作请优先使用内驱工具。',
  parameters: {
    command: { type: 'string', description: '要执行的 shell 命令', required: true },
    cwd: { type: 'string', description: '工作目录（可选，默认项目根目录）' },
  },
  execute: async (args: Record<string, unknown>, _ctx: IToolContext): Promise<string> => {
    const adapter = createExecutionAdapter()
    if (!adapter.isAvailable()) {
      const connected = await adapter.tryConnect()
      if (!connected) {
        return '终端功能当前不可用。Tauri 桌面模式请确认环境正常，Web 模式请启动 worldsmith-server 服务。'
      }
    }

    const command = String(args.command)
    const cwd = args.cwd ? String(args.cwd) : undefined

    try {
      const result = await adapter.executeCommand(command, { cwd, timeout: 30000 })
      return result.stdout || '(命令已执行，无输出)'
    } catch (err) {
      return `执行失败: ${err instanceof Error ? err.message : String(err)}`
    }
  },
}

export const terminalTools = [executeCommandTool]
