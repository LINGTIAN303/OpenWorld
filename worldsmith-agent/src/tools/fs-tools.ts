/**
 * 本地文件系统工具集
 *
 * 通过 PowerShell 命令操作本地文件系统（区别于项目工作区 file-tools）。
 * 适用于项目工作区外的文件操作。
 *
 * 工具: fs_read / fs_write / fs_list / fs_move / fs_delete / fs_search
 * 所有命令依赖 createExecutionAdapter() 的终端适配器。
 */

import type { ToolDefinition } from '../bridge-types'
import { createExecutionAdapter } from '../execution'

/** 通用命令执行器 */
async function runCommand(command: string, cwd?: string, timeout = 15000): Promise<string> {
  const adapter = createExecutionAdapter()
  if (!adapter.isAvailable()) return JSON.stringify({ ok: false, error: 'CLI 工具当前不可用。Tauri 桌面模式请确认环境正常，Web 模式请启动 worldsmith-server 服务。' })
  try {
    const result = await adapter.executeCommand(command, { cwd, timeout })
    return result.stdout
  } catch (err) {
    return JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}

/** fs_read — 读取本地文件内容 */
const fsReadTool: ToolDefinition = {
  name: 'fs_read',
  description: '读取本地文件内容。支持文本和二进制文件。仅用于读取项目工作区外的文件，项目内文件请使用 file_read 工具。',
  parameters: {
    path: { type: 'string', description: '文件绝对路径', required: true },
    encoding: { type: 'string', description: '编码方式，默认 utf-8' },
  },
  execute: async (args, _ctx) => {
    const p = String(args.path).replace(/"/g, '\\"')
    const enc = args.encoding ? ` -Encoding ${String(args.encoding)}` : ''
    return runCommand(`Get-Content -Path "${p}"${enc} -Raw`, String(args.path).replace(/[/\\][^/\\]*$/, ''))
  },
}

/** fs_write — 写入或创建本地文件 */
const fsWriteTool: ToolDefinition = {
  name: 'fs_write',
  description: '写入或创建本地文件。仅用于项目工作区外的文件操作，项目内文件请使用内驱工具。',
  parameters: {
    path: { type: 'string', description: '文件绝对路径', required: true },
    content: { type: 'string', description: '文件内容', required: true },
    createDirs: { type: 'boolean', description: '是否自动创建父目录' },
  },
  execute: async (args, _ctx) => {
    const p = String(args.path).replace(/"/g, '\\"')
    const dir = String(args.path).replace(/[/\\][^/\\]*$/, '')
    const cmds: string[] = []
    if (args.createDirs) cmds.push(`New-Item -ItemType Directory -Path "${dir.replace(/"/g, '\\"')}" -Force | Out-Null`)
    const content = String(args.content).replace(/'/g, "''")
    cmds.push(`Set-Content -Path "${p}" -Value '${content}' -Encoding UTF8`)
    return runCommand(cmds.join('; '), dir)
  },
}

/** fs_list — 列出目录内容，支持递归和 glob 筛选 */
const fsListTool: ToolDefinition = {
  name: 'fs_list',
  description: '列出本地目录内容。返回文件和子目录列表。',
  parameters: {
    path: { type: 'string', description: '目录绝对路径', required: true },
    recursive: { type: 'boolean', description: '是否递归列出子目录' },
    glob: { type: 'string', description: '文件名匹配模式，如 *.ts' },
  },
  execute: async (args, _ctx) => {
    const p = String(args.path).replace(/"/g, '\\"')
    const rec = args.recursive ? ' -Recurse' : ''
    const filter = args.glob ? ` -Filter "${String(args.glob).replace(/"/g, '\\"')}"` : ''
    return runCommand(`Get-ChildItem -Path "${p}"${rec}${filter} | Select-Object Mode, LastWriteTime, Length, Name | Format-Table -AutoSize`, String(args.path))
  },
}

/** fs_move — 移动或重命名文件/目录 */
const fsMoveTool: ToolDefinition = {
  name: 'fs_move',
  description: '移动或重命名本地文件/目录。',
  parameters: {
    source: { type: 'string', description: '源路径', required: true },
    destination: { type: 'string', description: '目标路径', required: true },
  },
  execute: async (args, _ctx) => {
    const s = String(args.source).replace(/"/g, '\\"')
    const d = String(args.destination).replace(/"/g, '\\"')
    return runCommand(`Move-Item -Path "${s}" -Destination "${d}"`, String(args.source).replace(/[/\\][^/\\]*$/, ''))
  },
}

/** fs_delete — 删除文件或目录（不可逆） */
const fsDeleteTool: ToolDefinition = {
  name: 'fs_delete',
  description: '删除本地文件或目录。此操作不可逆，请谨慎使用。',
  parameters: {
    path: { type: 'string', description: '要删除的文件/目录路径', required: true },
    recursive: { type: 'boolean', description: '是否递归删除目录' },
  },
  execute: async (args, _ctx) => {
    const p = String(args.path).replace(/"/g, '\\"')
    const rec = args.recursive ? ' -Recurse -Force' : ''
    return runCommand(`Remove-Item -Path "${p}"${rec}`, String(args.path).replace(/[/\\][^/\\]*$/, ''))
  },
}

/** fs_search — 搜索本地文件，支持按文件名（glob）或内容（content）搜索 */
const fsSearchTool: ToolDefinition = {
  name: 'fs_search',
  description: '搜索本地文件。支持按文件名模式或文件内容搜索。',
  parameters: {
    path: { type: 'string', description: '搜索根目录', required: true },
    pattern: { type: 'string', description: '搜索模式', required: true },
    type: { type: 'string', description: '搜索类型：glob（按文件名）或 content（按内容）' },
  },
  execute: async (args, _ctx) => {
    const p = String(args.path).replace(/"/g, '\\"')
    const pat = String(args.pattern).replace(/"/g, '\\"')
    const searchType = String(args.type || 'glob')
    if (searchType === 'content') {
      return runCommand(`Get-ChildItem -Path "${p}" -Recurse -File | Select-String -Pattern "${pat}" | Select-Object -First 20 Path, LineNumber, Line`, String(args.path))
    }
    return runCommand(`Get-ChildItem -Path "${p}" -Recurse -Filter "${pat}" | Select-Object -First 30 FullName, Length, LastWriteTime`, String(args.path))
  },
}

export const fsTools = [fsReadTool, fsWriteTool, fsListTool, fsMoveTool, fsDeleteTool, fsSearchTool]
