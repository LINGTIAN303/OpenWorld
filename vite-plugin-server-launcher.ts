import type { Plugin } from 'vite'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let serverProcess: ReturnType<typeof spawn> | null = null
let serverStarting = false
let serverReady = false
let installRunning = false
const serverLogs: string[] = []
const MAX_LOGS = 200

function pushLog(msg: string): void {
  serverLogs.push(msg)
  if (serverLogs.length > MAX_LOGS) serverLogs.shift()
}

function checkHealth(url: string): Promise<boolean> {
  return fetch(url)
    .then(r => r.ok)
    .catch(() => false)
}

async function waitForHealth(url: string, maxMs = 15000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < maxMs) {
    if (await checkHealth(url)) return true
    await new Promise(r => setTimeout(r, 500))
  }
  return false
}

function needsInstall(serverDir: string): boolean {
  return !fs.existsSync(path.join(serverDir, 'node_modules'))
}

function runNpmInstall(serverDir: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32'
    const npmCmd = isWindows ? 'npm.cmd' : 'npm'
    const child = spawn(npmCmd, ['install'], {
      cwd: serverDir,
      stdio: 'pipe',
      shell: isWindows,
    })

    let stderr = ''
    child.stdout?.on('data', (d: Buffer) => pushLog(`[npm install] ${d.toString().trim()}`))
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); pushLog(`[npm install err] ${d.toString().trim()}`) })

    child.on('error', (err) => resolve({ ok: false, error: err.message }))
    child.on('exit', (code) => {
      if (code === 0) resolve({ ok: true })
      else resolve({ ok: false, error: `npm install exited with code ${code}: ${stderr.slice(-500)}` })
    })
  })
}

function spawnServer(serverDir: string): { process: ReturnType<typeof spawn>; logs: string[] } {
  const isWindows = process.platform === 'win32'
  const startLogs: string[] = []

  const shell = isWindows ? 'powershell.exe' : '/bin/sh'
  const shellArgs = isWindows
    ? ['-NoLogo', '-NoProfile', '-Command', `cd "${serverDir}"; npm run dev`]
    : ['-c', `cd "${serverDir}" && npm run dev`]

  const child = spawn(shell, shellArgs, {
    cwd: serverDir,
    stdio: 'pipe',
    detached: !isWindows,
  })

  child.stdout?.on('data', (data: Buffer) => {
    const msg = data.toString()
    startLogs.push(msg)
    pushLog(msg)
    if (msg.includes('Running on') || msg.includes('listening')) {
      serverReady = true
    }
  })

  child.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString()
    startLogs.push(msg)
    pushLog(`[stderr] ${msg}`)
  })

  child.on('error', (err) => {
    pushLog(`[error] ${err.message}`)
    serverStarting = false
    serverProcess = null
  })

  child.on('exit', (code) => {
    pushLog(`[exit] code=${code}`)
    serverStarting = false
    serverReady = false
    serverProcess = null
  })

  return { process: child, logs: startLogs }
}

async function launchServerHandler(req: any, res: any): Promise<void> {
  res.setHeader('Content-Type', 'application/json')

  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }))
    return
  }

  const wsUrl = process.env.WORLDSMITH_WS_URL || 'ws://localhost:3100/ws'
  const healthUrl = wsUrl.replace(/\/ws$/, '').replace(/^ws/, 'http') + '/health'

  if (serverReady || (await checkHealth(healthUrl))) {
    serverReady = true
    res.end(JSON.stringify({ ok: true, status: 'already_running', healthUrl }))
    return
  }

  if (serverStarting || installRunning) {
    res.end(JSON.stringify({ ok: true, status: serverStarting ? 'starting' : 'installing', healthUrl }))
    return
  }

  const projectRoot = __dirname
  const serverDir = path.join(projectRoot, 'worldsmith-server')

  if (!fs.existsSync(serverDir)) {
    res.end(JSON.stringify({
      ok: false,
      status: 'error',
      error: `worldsmith-server directory not found: ${serverDir}`,
    }))
    return
  }

  if (needsInstall(serverDir)) {
    installRunning = true
    pushLog('[install] node_modules not found, running npm install...')
    const installResult = await runNpmInstall(serverDir)
    installRunning = false

    if (!installResult.ok) {
      res.end(JSON.stringify({
        ok: false,
        status: 'install_failed',
        error: `npm install failed: ${installResult.error}`,
        hint: '请手动在 worldsmith-server 目录下运行 npm install，确保已安装 Visual Studio Build Tools (node-pty 编译需要)',
        serverDir,
        logs: serverLogs.slice(-20),
      }))
      return
    }
    pushLog('[install] npm install completed')
  }

  serverStarting = true

  try {
    const { process: child } = spawnServer(serverDir)
    serverProcess = child

    const healthy = await waitForHealth(healthUrl, 30000)
    serverStarting = false

    if (healthy) {
      serverReady = true
      res.end(JSON.stringify({ ok: true, status: 'started', healthUrl }))
    } else {
      const stillAlive = serverProcess !== null
      res.end(JSON.stringify({
        ok: stillAlive,
        status: stillAlive ? 'starting_slow' : 'timeout',
        error: stillAlive
          ? '服务进程已启动但尚未就绪，可能需要更长时间编译 node-pty'
          : '服务进程已退出，请检查日志',
        healthUrl,
        logs: serverLogs.slice(-30),
        hint: stillAlive
          ? '服务正在启动中，请稍后调用 detect_terminal_mode 检查状态'
          : '请检查 worldsmith-server 是否能手动启动: cd worldsmith-server && npm run dev',
      }))
    }
  } catch (err) {
    serverStarting = false
    res.end(JSON.stringify({
      ok: false,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
      logs: serverLogs.slice(-20),
    }))
  }
}

async function serverStatusHandler(_req: any, res: any): Promise<void> {
  res.setHeader('Content-Type', 'application/json')
  const wsUrl = process.env.WORLDSMITH_WS_URL || 'ws://localhost:3100/ws'
  const healthUrl = wsUrl.replace(/\/ws$/, '').replace(/^ws/, 'http') + '/health'
  const healthy = await checkHealth(healthUrl)
  res.end(JSON.stringify({
    ok: healthy,
    running: healthy,
    starting: serverStarting,
    installing: installRunning,
    healthUrl,
    logs: serverLogs.slice(-10),
  }))
}

async function serverLogsHandler(_req: any, res: any): Promise<void> {
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ logs: serverLogs.slice(-50) }))
}

export function worldsmithServerLauncher(): Plugin {
  return {
    name: 'worldsmith-server-launcher',
    configureServer(server) {
      server.middlewares.use('/api/launch-server', launchServerHandler)
      server.middlewares.use('/api/server-status', serverStatusHandler)
      server.middlewares.use('/api/server-logs', serverLogsHandler)
    },

    closeBundle() {
      if (serverProcess) {
        serverProcess.kill()
        serverProcess = null
      }
    },
  }
}
