#!/usr/bin/env node

import { createInterface } from 'readline'

const MODE = process.argv[2] || 'auto'
const COMMAND = process.argv[3] || ''
const WS_URL = process.env.WS_SERVER_URL || 'ws://localhost:3100'
const AUTH_TOKEN = process.env.WS_SERVER_TOKEN || 'dev'
const TIMEOUT = parseInt(process.env.TERMINAL_TIMEOUT || '30000', 10)

function detectMode(): 'local' | 'remote' {
  if (MODE === 'local') return 'local'
  if (MODE === 'remote') return 'remote'
  if (process.env.__TAURI_INTERNALS__) return 'local'
  return 'remote'
}

async function executeLocal(cmd: string): Promise<void> {
  try {
    const { spawn } = await import('node-pty')
    const shell = process.env.COMSPEC || process.env.SHELL || 'powershell.exe'
    const pty = spawn(shell, [], {
      name: 'xterm-256color',
      cols: 200,
      rows: 50,
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
    })

    const chunks: string[] = []
    pty.onData((data) => chunks.push(data))

    const exitPromise = new Promise<number | null>((resolve) => {
      pty.onExit(({ exitCode }) => resolve(exitCode))
    })

    pty.write(cmd + '\n')

    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), TIMEOUT)
    })

    const exitCode = await Promise.race([exitPromise, timeoutPromise])

    setTimeout(() => {
      try { pty.kill() } catch {}
    }, 500)

    const output = chunks.join('')
    const result = {
      ok: true,
      mode: 'local',
      stdout: output || '(命令已执行，无输出)',
      exitCode,
      timedOut: exitCode === null,
    }
    console.log(JSON.stringify(result, null, 2))
  } catch (err) {
    const result = {
      ok: false,
      mode: 'local',
      error: err instanceof Error ? err.message : String(err),
      hint: '本地模式需要 node-pty 支持。如果是 Web 应用模式，请使用 remote 模式。',
    }
    console.log(JSON.stringify(result, null, 2))
    process.exit(1)
  }
}

async function executeRemote(cmd: string): Promise<void> {
  let ws: any
  try {
    const { default: WebSocket } = await import('ws')
    const url = `${WS_URL}?token=${AUTH_TOKEN}`

    ws = new WebSocket(url)

    const connected = await new Promise<boolean>((resolve) => {
      ws.on('open', () => resolve(true))
      ws.on('error', () => resolve(false))
      setTimeout(() => resolve(false), 5000)
    })

    if (!connected) {
      const result = {
        ok: false,
        mode: 'remote',
        error: `无法连接到 ${WS_URL}`,
        hint: '请确认 worldsmith-server 已启动。启动方式：cd worldsmith-server && npm run dev',
      }
      console.log(JSON.stringify(result, null, 2))
      process.exit(1)
    }

    const id = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    const resultPromise = new Promise<any>((resolve) => {
      ws.on('message', (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString())
          if (msg.type === 'exec_result' && msg.id === id) {
            resolve({
              ok: true,
              mode: 'remote',
              stdout: msg.payload?.stdout || '(命令已执行，无输出)',
              stderr: msg.payload?.stderr || '',
              exitCode: msg.payload?.exitCode ?? null,
              timedOut: msg.payload?.timedOut || false,
            })
          }
          if (msg.type === 'error' && msg.id === id) {
            resolve({
              ok: false,
              mode: 'remote',
              error: msg.payload?.message || '未知错误',
            })
          }
        } catch {}
      })
    })

    ws.send(JSON.stringify({
      type: 'exec',
      id,
      payload: { cmd, cwd: process.cwd(), timeout: TIMEOUT },
    }))

    const timeoutPromise = new Promise<any>((resolve) => {
      setTimeout(() => resolve({
        ok: false,
        mode: 'remote',
        error: '执行超时',
        timedOut: true,
      }), TIMEOUT + 5000)
    })

    const result = await Promise.race([resultPromise, timeoutPromise])
    console.log(JSON.stringify(result, null, 2))

    ws.close()
  } catch (err) {
    const result = {
      ok: false,
      mode: 'remote',
      error: err instanceof Error ? err.message : String(err),
    }
    console.log(JSON.stringify(result, null, 2))
    if (ws) ws.close()
    process.exit(1)
  }
}

function printUsage(): void {
  console.log(`
终端启动脚本 - WorldSmith Agent Terminal Launcher

用法:
  node terminal-launcher.ts [mode] [command]

参数:
  mode      运行模式: auto(自动检测) | local(本地 PTY) | remote(WebSocket 远程)
  command   要执行的 shell 命令

环境变量:
  WS_SERVER_URL     WebSocket 服务地址 (默认: ws://localhost:3100)
  WS_SERVER_TOKEN   WebSocket 认证令牌 (默认: dev)
  TERMINAL_TIMEOUT  执行超时毫秒数 (默认: 30000)

示例:
  node terminal-launcher.ts auto "npm run build"
  node terminal-launcher.ts local "dir"
  node terminal-launcher.ts remote "python --version"
`)
}

async function main(): Promise<void> {
  if (MODE === '--help' || MODE === '-h') {
    printUsage()
    return
  }

  if (!COMMAND) {
    console.error('错误: 请提供要执行的命令')
    printUsage()
    process.exit(1)
  }

  const resolvedMode = detectMode()

  if (resolvedMode === 'local') {
    await executeLocal(COMMAND)
  } else {
    await executeRemote(COMMAND)
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }))
  process.exit(1)
})
