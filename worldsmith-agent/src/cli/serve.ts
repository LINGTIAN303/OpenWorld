/**
 * CLI Agent Server 模式
 *
 * `worldsmith serve` 启动 HTTP + WebSocket 服务器，
 * 将 CLI 的本地能力（shell、git、文件、lint/test/build 等）暴露给 Web 端。
 *
 * HTTP API:
 *   GET  /health              健康检查
 *   GET  /api/capabilities    查询可用工具列表
 *   POST /api/tools/:name     调用指定工具
 *
 * WebSocket:
 *   /ws  流式事件推送（工具执行进度、输出、状态变更）
 */
import { createServer } from 'http'
import type { IncomingMessage, ServerResponse, Server } from 'http'
import { WebSocketServer } from 'ws'
import type { WebSocket as WsSocket, RawData } from 'ws'
import { createCliAgent, CLI_TOOLS } from './cli-agent'
import { createCliToolContext } from './cli-context'
import { createCLISafetyGuard } from './cli-safety-guard'
import { initToolMetaRegistry } from '../tools/tool-meta-registry'
import type { ProviderConfig } from '../providers/config'
import type { ToolDefinition } from '../bridge-types'
import * as crypto from 'crypto'
import * as path from 'path'
import * as fs from 'fs'

/* ════════════════════════════════════════
   类型定义
   ════════════════════════════════════════ */

interface ServeOptions {
  port: number
  host: string
  provider: string
  model: string
  apiKey: string
  baseUrl?: string
  data: string
  guard: boolean
}

interface ToolCallRequest {
  tool: string
  args: Record<string, unknown>
  requestId?: string
}

interface WsMessage {
  type: 'tool_call' | 'ping' | 'subscribe' | 'unsubscribe'
  payload: unknown
}

/* ════════════════════════════════════════
   工具注册表
   ════════════════════════════════════════ */

const toolMap = new Map<string, ToolDefinition>()

function registerTools(): void {
  for (const tool of CLI_TOOLS) {
    toolMap.set(tool.name, tool)
    if (tool.meta?.aliases) {
      for (const alias of tool.meta.aliases) {
        if (!toolMap.has(alias)) toolMap.set(alias, tool)
      }
    }
  }
}

registerTools()

/* ════════════════════════════════════════
   工具分类（供 Web 端路由决策）
   ════════════════════════════════════════ */

const LOCAL_CAPABILITY_CATEGORIES = {
  shell: ['shell_session', 'execute_command', 'launch_terminal', 'launch_terminal_script',
           'shell_session_create', 'shell_session_exec', 'shell_session_input',
           'shell_session_destroy', 'shell_session_list', 'detect_shells', 'detect_terminal_mode'],
  git: ['git_status', 'git_log', 'git_diff', 'git_add', 'git_commit', 'git_checkout',
        'git_branch', 'git_stash', 'git_push', 'git_pull', 'git_init'],
  file: ['read_file', 'write_file', 'search_files', 'list_directory', 'create_directory',
         'delete_file', 'move_file', 'copy_file'],
  project: ['run_lint', 'run_test', 'run_build', 'detect_project_commands'],
  system: ['sys_info', 'env_get', 'env_set'],
}

function getCapabilities() {
  const available: string[] = []
  for (const [name] of toolMap) {
    available.push(name)
  }
  return {
    tools: available,
    categories: LOCAL_CAPABILITY_CATEGORIES,
    toolCount: available.length,
  }
}

/* ════════════════════════════════════════
   HTTP 请求处理
   ════════════════════════════════════════ */

function parseBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  })
  res.end(body)
}

function sendSSE(res: ServerResponse, data: unknown): void {
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

/* ════════════════════════════════════════
   Server 主逻辑
   ════════════════════════════════════════ */

export async function startServer(opts: ServeOptions): Promise<Server> {
  const apiKey = opts.apiKey || loadApiKeyFromEnv(opts.provider)
  if (!apiKey) {
    console.error('Error: API key required. Use -k flag, WORLDSMITH_API_KEY env, or .worldsmith-keys.json')
    process.exit(1)
  }

  const config: ProviderConfig = opts.baseUrl
    ? { mode: 'custom', baseUrl: opts.baseUrl, apiType: 'openai-compatible', modelId: opts.model, apiKey }
    : { mode: 'cloud', provider: opts.provider, modelId: opts.model, apiKey }

  const dataPath = path.resolve(opts.data)
  if (!fs.existsSync(dataPath)) fs.mkdirSync(dataPath, { recursive: true })

  const toolContext = createCliToolContext(dataPath, config)

  // 初始化工具元数据注册中心
  initToolMetaRegistry(CLI_TOOLS)

  // 创建 Agent 实例（serve 模式下 Agent 主要用于工具执行上下文）
  const agent = await createCliAgent({
    providerConfig: config,
    toolContext,
    projectName: 'WorldSmith-Server',
    beforeToolCall: opts.guard ? createCLISafetyGuard(toolContext.stores.ui) : undefined,
  })

  // WebSocket 客户端管理
  const wsClients = new Set<WsSocket>()

  // 向所有 WS 客户端广播事件
  function broadcast(event: { type: string; [key: string]: unknown }): void {
    const msg = JSON.stringify(event)
    for (const ws of wsClients) {
      if (ws.readyState === 1) { // WebSocket.OPEN = 1
        ws.send(msg)
      }
    }
  }

  // ── HTTP 服务器 ──
  const server = createServer(async (req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      sendJson(res, 204, null)
      return
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`)

    // GET /health
    if (url.pathname === '/health' && req.method === 'GET') {
      sendJson(res, 200, {
        status: 'ok',
        version: '0.1.0',
        toolCount: toolMap.size,
        uptime: process.uptime(),
      })
      return
    }

    // GET /api/capabilities
    if (url.pathname === '/api/capabilities' && req.method === 'GET') {
      sendJson(res, 200, getCapabilities())
      return
    }

    // POST /api/tools/:name
    const toolMatch = url.pathname.match(/^\/api\/tools\/(.+)$/)
    if (toolMatch && req.method === 'POST') {
      const toolName = decodeURIComponent(toolMatch[1])
      const tool = toolMap.get(toolName)

      if (!tool) {
        sendJson(res, 404, { ok: false, error: `Tool not found: ${toolName}`, available: [...toolMap.keys()] })
        return
      }

      let body: string
      try {
        body = await parseBody(req)
      } catch {
        sendJson(res, 400, { ok: false, error: 'Failed to parse request body' })
        return
      }

      let args: Record<string, unknown>
      try {
        const parsed = JSON.parse(body)
        args = parsed.args ?? parsed.arguments ?? parsed
        if (typeof args !== 'object' || args === null || Array.isArray(args)) {
          args = {}
        }
      } catch {
        sendJson(res, 400, { ok: false, error: 'Invalid JSON body' })
        return
      }

      const requestId = crypto.randomUUID().slice(0, 8)

      // 广播工具开始执行
      broadcast({ type: 'tool_execution_start', toolName, args, requestId })

      try {
        // 安全守卫检查
        if (opts.guard && agent) {
          const guardResult = await (agent as any).config?.beforeToolCall?.({ toolCall: { name: toolName, args } })
          if (guardResult?.block) {
            broadcast({ type: 'tool_execution_end', requestId, success: false, result: guardResult.reason })
            sendJson(res, 403, { ok: false, error: `Blocked by safety guard: ${guardResult.reason}`, requestId })
            return
          }
        }

        const result = await tool.execute(args, toolContext)

        broadcast({ type: 'tool_execution_end', requestId, success: true, result })
        sendJson(res, 200, { ok: true, result, requestId })
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        broadcast({ type: 'tool_execution_end', requestId, success: false, result: errorMsg })
        sendJson(res, 500, { ok: false, error: errorMsg, requestId })
      }
      return
    }

    // POST /api/prompt (SSE 流式响应)
    if (url.pathname === '/api/prompt' && req.method === 'POST') {
      let body: string
      try {
        body = await parseBody(req)
      } catch {
        sendJson(res, 400, { ok: false, error: 'Failed to parse request body' })
        return
      }

      let promptText: string
      let contextOverride: string | undefined
      try {
        const parsed = JSON.parse(body)
        promptText = parsed.text || parsed.prompt || ''
        contextOverride = parsed.contextOverride
      } catch {
        sendJson(res, 400, { ok: false, error: 'Invalid JSON body' })
        return
      }

      if (!promptText) {
        sendJson(res, 400, { ok: false, error: 'Missing prompt text' })
        return
      }

      // SSE 响应头
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      })

      // 订阅 Agent 事件
      const unsub = agent.subscribe((event) => {
        sendSSE(res, event)
        if (event.type === 'agent_end' || event.type === 'error') {
          unsub()
          res.end()
        }
      })

      try {
        await agent.prompt(promptText, { contextOverride })
      } catch (err) {
        sendSSE(res, { type: 'error', error: err instanceof Error ? err.message : String(err) })
        unsub()
        res.end()
      }
      return
    }

    // 404
    sendJson(res, 404, { ok: false, error: 'Not found', endpoints: ['/health', '/api/capabilities', '/api/tools/:name', '/api/prompt'] })
  })

  // ── WebSocket 服务器 ──
  const wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (ws: WsSocket) => {
    wsClients.add(ws)
    console.log(`[WS] Client connected (total: ${wsClients.size})`)

    // 发送欢迎消息
    ws.send(JSON.stringify({
      type: 'connected',
      capabilities: getCapabilities(),
      serverVersion: '0.1.0',
    }))

    ws.on('message', async (raw: RawData) => {
      let msg: WsMessage
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        ws.send(JSON.stringify({ type: 'error', error: 'Invalid JSON' }))
        return
      }

      switch (msg.type) {
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }))
          break

        case 'tool_call': {
          const { tool: toolName, args = {}, requestId } = msg.payload as ToolCallRequest
          const tool = toolMap.get(toolName)

          if (!tool) {
            ws.send(JSON.stringify({ type: 'tool_result', ok: false, error: `Tool not found: ${toolName}`, requestId }))
            return
          }

          try {
            const result = await tool.execute(args, toolContext)
            ws.send(JSON.stringify({ type: 'tool_result', ok: true, result, requestId }))
          } catch (err) {
            ws.send(JSON.stringify({ type: 'tool_result', ok: false, error: err instanceof Error ? err.message : String(err), requestId }))
          }
          break
        }

        default:
          ws.send(JSON.stringify({ type: 'error', error: `Unknown message type: ${(msg as any).type}` }))
      }
    })

    ws.on('close', () => {
      wsClients.delete(ws)
      console.log(`[WS] Client disconnected (total: ${wsClients.size})`)
    })
  })

  // ── 启动 ──
  return new Promise((resolve) => {
    server.listen(opts.port, opts.host, () => {
      console.log('WorldSmith Agent Server')
      console.log(`  HTTP:  http://${opts.host}:${opts.port}`)
      console.log(`  WS:    ws://${opts.host}:${opts.port}/ws`)
      console.log(`  Tools: ${toolMap.size} available`)
      console.log(`  Model: ${opts.provider}/${opts.model}`)
      console.log(`  Guard: ${opts.guard ? 'ON' : 'OFF'}`)
      console.log(`  Data:  ${dataPath}`)
      console.log('')
      console.log('Endpoints:')
      console.log('  GET  /health              Health check')
      console.log('  GET  /api/capabilities    List available tools')
      console.log('  POST /api/tools/:name     Execute a tool')
      console.log('  POST /api/prompt          Send prompt (SSE)')
      console.log('  WS   /ws                  WebSocket (tool_call + events)')
      resolve(server)
    })
  })
}

/* ════════════════════════════════════════
   API Key 加载（与 index.ts 共享逻辑）
   ════════════════════════════════════════ */

function loadApiKeyFromEnv(provider: string): string {
  const envKey = `WORLDSMITH_API_KEY_${provider.toUpperCase().replace(/-/g, '_')}`
  if (process.env[envKey]) return process.env[envKey]!
  if (process.env.WORLDSMITH_API_KEY) return process.env.WORLDSMITH_API_KEY
  const cfgPath = path.join(process.cwd(), '.worldsmith-keys.json')
  if (fs.existsSync(cfgPath)) {
    try {
      const keys = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'))
      return keys[provider] || keys.default || ''
    } catch { return '' }
  }
  return ''
}
