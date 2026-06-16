/**
 * 执行适配器接口
 *
 * 定义命令执行和 Shell 会话管理的统一接口。
 * 具体实现由消费方提供（Tauri / WebSocket / CLI）。
 */

import type { Platform } from '../types'

export interface ExecOptions {
  cwd?: string
  timeout?: number
  env?: Record<string, string>
}

export interface ExecResult {
  stdout: string
  stderr: string
  exitCode: number | null
  timedOut: boolean
}

export interface PtyOptions {
  shell?: string | null
  cwd?: string | null
  cols?: number
  rows?: number
  env?: Record<string, string> | null
}

/** 检测到的 Shell 信息 */
export interface ShellInfo {
  id: string
  name: string
  path: string
  is_default: boolean
}

/** Shell 会话信息 */
export interface ShellSessionInfo {
  id: string
  shell_id: string
  shell_path: string
  cwd: string
  created_at: number
}

/** Shell 会话执行结果 */
export interface ShellExecResult {
  stdout: string
  stderr: string
  exit_code: number | null
  timed_out: boolean
}

/**
 * 执行适配器接口
 *
 * 抽象命令执行和 Shell 会话管理，
 * Tauri / WebSocket / CLI 各自实现此接口。
 */
export interface ExecutionAdapter {
  /** 适配器是否可用 */
  isAvailable(): boolean

  /** 尝试连接（WebSocket 模式） */
  tryConnect(): Promise<boolean>

  /** 执行一次性命令 */
  executeCommand(cmd: string, opts?: ExecOptions): Promise<ExecResult>

  /** 检测可用 Shell */
  detectShells(): Promise<ShellInfo[]>

  /** 创建持久化 Shell 会话 */
  createSession(id: string, opts?: PtyOptions): Promise<ShellSessionInfo>

  /** 在会话中执行命令 */
  execInSession(id: string, command: string, timeoutMs?: number): Promise<ShellExecResult>

  /** 向会话发送交互式输入 */
  sendInput(id: string, data: string): Promise<void>

  /** 销毁会话 */
  destroySession(id: string): Promise<void>

  /** 列出活跃会话 */
  listSessions(): Promise<string[]>

  // ─── 低级 PTY 控制 ──────────────────────────────────────

  spawnPty(id: string, opts?: PtyOptions): Promise<void>
  writePty(id: string, data: string): Promise<void>
  resizePty(id: string, cols: number, rows: number): Promise<void>
  killPty(id: string): Promise<void>
  onPtyOutput(id: string, callback: (data: string) => void): Promise<() => void>
}

/**
 * 执行适配器工厂接口
 *
 * 消费方通过此接口注册和获取适配器实例。
 */
export interface ExecutionAdapterFactory {
  create(platform: Platform): ExecutionAdapter
}
