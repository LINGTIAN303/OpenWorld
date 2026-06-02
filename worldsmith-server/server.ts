import express from 'express'
import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { PtyManager } from './pty-manager.js'
import { v4 as uuid } from 'uuid'

const PORT = parseInt(process.env.PORT || '3100', 10)
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'dev'

const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })

app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (_req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }
  next()
})

const ptyManager = new PtyManager()

interface WsMessage {
  type: string
  id: string
  payload: any
}

interface WsResponse {
  type: string
  id: string
  payload: any
}

function send(ws: WebSocket, msg: WsResponse): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}

function sendError(ws: WebSocket, id: string, message: string): void {
  send(ws, { type: 'error', id, payload: { message } })
}

function validateToken(token: string | null): boolean {
  if (AUTH_TOKEN === 'dev') return true
  return token === AUTH_TOKEN
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const token = url.searchParams.get('token')
  if (!validateToken(token)) {
    ws.close(4001, 'Unauthorized')
    return
  }

  const clientId = uuid()
  console.log(`[WS] Client connected: ${clientId}`)

  const ptyListeners: Map<string, (() => void)[]> = new Map()

  ws.on('message', (raw) => {
    let msg: WsMessage
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      sendError(ws, 'unknown', 'Invalid JSON')
      return
    }

    switch (msg.type) {
      case 'exec': {
        handleExec(ws, msg)
        break
      }
      case 'pty_spawn': {
        handlePtySpawn(ws, msg, ptyListeners)
        break
      }
      case 'pty_write': {
        handlePtyWrite(ws, msg)
        break
      }
      case 'pty_resize': {
        handlePtyResize(ws, msg)
        break
      }
      case 'pty_kill': {
        handlePtyKill(ws, msg, ptyListeners)
        break
      }
      default: {
        sendError(ws, msg.id, `Unknown message type: ${msg.type}`)
      }
    }
  })

  ws.on('close', () => {
    console.log(`[WS] Client disconnected: ${clientId}`)
    for (const [ptyId, listeners] of ptyListeners) {
      listeners.forEach(fn => fn())
      ptyManager.kill(ptyId)
    }
    ptyListeners.clear()
  })
})

async function handleExec(ws: WebSocket, msg: WsMessage): Promise<void> {
  const { cmd, cwd, env, timeout } = msg.payload || {}
  if (!cmd) {
    sendError(ws, msg.id, 'Missing "cmd" in payload')
    return
  }

  const isWindows = process.platform === 'win32'
  const ptyId = `exec-${msg.id}`
  let settled = false
  try {
    const shellArgs = isWindows
      ? { shell: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-Command', cmd] }
      : { shell: '/bin/sh', args: ['-c', cmd] }

    ptyManager.spawnWithArgs(ptyId, {
      shell: shellArgs.shell,
      args: shellArgs.args,
      cwd: cwd || null,
      cols: 200,
      rows: 50,
      env: env || undefined,
    })

    const chunks: string[] = []
    const dataListener = ptyManager.onData(ptyId, (data) => chunks.push(data))
    const exitListener = ptyManager.onExit(ptyId, (exitCode) => {
      if (settled) return
      settled = true
      if (dataListener) dataListener()
      if (exitListener) exitListener()
      ptyManager.kill(ptyId)
      send(ws, {
        type: 'exec_result',
        id: msg.id,
        payload: {
          stdout: chunks.join(''),
          stderr: '',
          exitCode,
          timedOut: false,
        },
      })
    })

    const maxWait = timeout || 15000
    setTimeout(() => {
      if (settled) return
      settled = true
      if (dataListener) dataListener()
      if (exitListener) exitListener()
      ptyManager.kill(ptyId)
      send(ws, {
        type: 'exec_result',
        id: msg.id,
        payload: {
          stdout: chunks.join(''),
          stderr: '',
          exitCode: null,
          timedOut: true,
        },
      })
    }, maxWait)
  } catch (err) {
    if (!settled) {
      settled = true
      sendError(ws, msg.id, err instanceof Error ? err.message : String(err))
    }
  }
}

function handlePtySpawn(ws: WebSocket, msg: WsMessage, listeners: Map<string, (() => void)[]>): void {
  const { shell, cwd, cols, rows, env } = msg.payload || {}
  const ptyId = msg.id

  try {
    ptyManager.spawn(ptyId, { shell, cwd, cols, rows, env })

    const cleanup: (() => void)[] = []

    const dataListener = ptyManager.onData(ptyId, (data) => {
      send(ws, { type: 'pty_output', id: ptyId, payload: { data } })
    })
    if (dataListener) cleanup.push(dataListener)

    const exitListener = ptyManager.onExit(ptyId, (exitCode, signal) => {
      send(ws, { type: 'pty_exit', id: ptyId, payload: { exitCode, signal } })
      cleanup.forEach(fn => fn())
      listeners.delete(ptyId)
    })
    if (exitListener) cleanup.push(exitListener)

    listeners.set(ptyId, cleanup)
  } catch (err) {
    sendError(ws, ptyId, err instanceof Error ? err.message : String(err))
  }
}

function handlePtyWrite(ws: WebSocket, msg: WsMessage): void {
  const { data } = msg.payload || {}
  if (!data) {
    sendError(ws, msg.id, 'Missing "data" in payload')
    return
  }
  try {
    ptyManager.write(msg.id, data)
  } catch (err) {
    sendError(ws, msg.id, err instanceof Error ? err.message : String(err))
  }
}

function handlePtyResize(ws: WebSocket, msg: WsMessage): void {
  const { cols, rows } = msg.payload || {}
  if (!cols || !rows) return
  ptyManager.resize(msg.id, cols, rows)
}

function handlePtyKill(ws: WebSocket, msg: WsMessage, listeners: Map<string, (() => void)[]>): void {
  const cleanup = listeners.get(msg.id)
  if (cleanup) {
    cleanup.forEach(fn => fn())
    listeners.delete(msg.id)
  }
  ptyManager.kill(msg.id)
}

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    ptys: ptyManager.list().length,
    uptime: process.uptime(),
  })
})

process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down...')
  ptyManager.killAll()
  server.close()
  process.exit(0)
})

process.on('SIGTERM', () => {
  ptyManager.killAll()
  server.close()
  process.exit(0)
})

server.listen(PORT, () => {
  console.log(`[WorldSmith Server] Running on http://localhost:${PORT}`)
  console.log(`[WorldSmith Server] WebSocket: ws://localhost:${PORT}/ws`)
  console.log(`[WorldSmith Server] Auth token: ${AUTH_TOKEN === 'dev' ? 'dev (开发模式)' : '***'}`)
})
