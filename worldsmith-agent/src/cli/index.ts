import { Command } from 'commander'
import { createWorldSmithAgent } from '../agent'
import { createCliToolContext } from './cli-context'
import { createCLISafetyGuard } from './cli-safety-guard'
import { createCliSessionStore } from './cli-session-store'
import type { ProviderConfig } from '../providers/config'
import type { AgentEvent } from '../bridge-types'
import type { AgentMessage, AgentSession } from '../session/types'
import type { MCPConnectionConfig } from '../mcp/types'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { execSync } from 'child_process'

/* ════════════════════════════════════════
   API Key 加载
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

/* ════════════════════════════════════════
   WORLDSMITH.md 项目配置文件加载
   ════════════════════════════════════════ */

const WORLDSMITH_MD_NAMES = ['WORLDSMITH.md', '.worldsmith.md']

/**
 * 从项目根目录及子目录加载 WORLDSMITH.md 配置文件
 * 支持多级继承：全局 ~/.worldsmith/WORLDSMITH.md + 项目根 + 子目录
 */
function loadProjectConfig(cwd: string): string {
  const parts: string[] = []

  // 1. 全局配置
  const homeDir = process.env.HOME || process.env.USERPROFILE || ''
  if (homeDir) {
    const globalPath = path.join(homeDir, '.worldsmith', 'WORLDSMITH.md')
    if (fs.existsSync(globalPath)) {
      parts.push(fs.readFileSync(globalPath, 'utf-8'))
    }
  }

  // 2. 项目根配置
  for (const name of WORLDSMITH_MD_NAMES) {
    const filePath = path.join(cwd, name)
    if (fs.existsSync(filePath)) {
      parts.push(fs.readFileSync(filePath, 'utf-8'))
      break
    }
  }

  return parts.join('\n\n---\n\n')
}

/* ════════════════════════════════════════
   @ 文件引用解析
   ════════════════════════════════════════ */

const FILE_REF_PATTERN = /@([\w./_-]+(?:\.\w+)?)/g

/**
 * 解析用户输入中的 @path/to/file 引用
 * 将引用的文件内容附加到消息中
 */
function resolveFileRefs(text: string, cwd: string): { prompt: string; files: Array<{ name: string; content: string }> } {
  const files: Array<{ name: string; content: string }> = []
  const matches = [...text.matchAll(FILE_REF_PATTERN)]

  if (matches.length === 0) return { prompt: text, files }

  let resolved = text
  for (const match of matches) {
    const ref = match[1]
    const filePath = path.resolve(cwd, ref)
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        files.push({ name: ref, content })
        // 将 @ref 替换为内联的文件内容标记
        resolved = resolved.replace(match[0], `[文件: ${ref}]\n\`\`\`\n${content}\n\`\`\``)
      } catch {
        // 文件无法读取，保留原始引用
      }
    }
  }

  return { prompt: resolved, files }
}

/* ════════════════════════════════════════
   检查点 / 回滚
   ════════════════════════════════════════ */

interface Checkpoint {
  id: string
  sessionId: string
  messageIndex: number
  timestamp: string
  description: string
}

function getCheckpointsPath(dataPath: string): string {
  return path.join(dataPath, 'checkpoints.json')
}

function loadCheckpoints(dataPath: string): Checkpoint[] {
  const filePath = getCheckpointsPath(dataPath)
  try {
    if (!fs.existsSync(filePath)) return []
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch { return [] }
}

function saveCheckpoints(dataPath: string, checkpoints: Checkpoint[]): void {
  const dir = path.dirname(getCheckpointsPath(dataPath))
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(getCheckpointsPath(dataPath), JSON.stringify(checkpoints, null, 2), 'utf-8')
}

/** 创建检查点：在破坏性操作前保存当前会话消息快照 */
function createCheckpoint(dataPath: string, sessionId: string, messages: AgentMessage[], description: string): Checkpoint {
  const checkpoints = loadCheckpoints(dataPath)
  const checkpoint: Checkpoint = {
    id: crypto.randomUUID().slice(0, 8),
    sessionId,
    messageIndex: messages.length,
    timestamp: new Date().toISOString(),
    description,
  }
  // 同时保存消息快照
  const snapshotPath = path.join(dataPath, `checkpoint-${checkpoint.id}.json`)
  fs.writeFileSync(snapshotPath, JSON.stringify(messages, null, 2), 'utf-8')

  checkpoints.unshift(checkpoint)
  // 最多保留 20 个检查点
  if (checkpoints.length > 20) {
    const removed = checkpoints.splice(20)
    for (const r of removed) {
      const sp = path.join(dataPath, `checkpoint-${r.id}.json`)
      if (fs.existsSync(sp)) fs.unlinkSync(sp)
    }
  }
  saveCheckpoints(dataPath, checkpoints)
  return checkpoint
}

/** 回滚到指定检查点 */
async function rollbackCheckpoint(dataPath: string, checkpointId: string, sessionStore: ReturnType<typeof createCliSessionStore>): Promise<AgentMessage[] | null> {
  const checkpoints = loadCheckpoints(dataPath)
  const cp = checkpoints.find(c => c.id === checkpointId)
  if (!cp) return null

  const snapshotPath = path.join(dataPath, `checkpoint-${cp.id}.json`)
  if (!fs.existsSync(snapshotPath)) return null

  const messages: AgentMessage[] = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'))

  // 更新会话
  const session = await sessionStore.getSession(cp.sessionId)
  if (session) {
    session.messages = messages
    await sessionStore.saveSession(session)
  }

  return messages
}

/* ════════════════════════════════════════
   上下文压缩 (Compact)
   ════════════════════════════════════════ */

const COMPACT_THRESHOLD = 40

/**
 * 压缩历史消息：保留最近 N 条，将更早的消息总结为一条 system 消息
 */
function compactMessages(messages: AgentMessage[]): AgentMessage[] {
  if (messages.length <= COMPACT_THRESHOLD) return messages

  const older = messages.slice(0, messages.length - COMPACT_THRESHOLD)
  const recent = messages.slice(messages.length - COMPACT_THRESHOLD)

  // 统计被截断的消息
  const userCount = older.filter(m => m.role === 'user').length
  const assistantCount = older.filter(m => m.role === 'assistant').length
  const toolCount = older.filter(m => m.role === 'toolResult').length

  const summary: AgentMessage = {
    id: crypto.randomUUID(),
    role: 'system',
    content: `[上下文已压缩] 之前有 ${userCount} 条用户消息、${assistantCount} 条助手回复、${toolCount} 条工具结果。以下是最近的对话：`,
    timestamp: Date.now(),
  }

  return [summary, ...recent]
}

/* ════════════════════════════════════════
   P2-7: Repo Map / 代码库感知
   ════════════════════════════════════════ */

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'out', 'target',
  '__pycache__', '.venv', 'venv', '.tox', '.mypy_cache', '.pytest_cache',
  'vendor', 'Pods', '.gradle', '.idea', '.vscode', '.cache', '.turbo',
])

const IGNORED_EXTENSIONS = new Set([
  '.map', '.min.js', '.min.css', '.lock', '.wasm', '.png', '.jpg', '.jpeg',
  '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4',
])

interface RepoMap {
  language: string
  framework: string
  fileTree: string
  keyFiles: Record<string, string>
  stats: { files: number; dirs: number; totalLines: number }
}

/** 扫描项目目录，生成 Repo Map 摘要 */
function buildRepoMap(cwd: string, maxDepth = 4): RepoMap {
  const keyFiles: Record<string, string> = {}
  let fileCount = 0
  let dirCount = 0
  let totalLines = 0
  const treeLines: string[] = []

  // 检测语言和框架
  const language = detectLanguage(cwd)
  const framework = detectFramework(cwd)

  // 读取关键配置文件
  const KEY_FILE_NAMES = [
    'package.json', 'tsconfig.json', 'Cargo.toml', 'pyproject.toml',
    'go.mod', 'pom.xml', 'build.gradle', 'Makefile', 'Dockerfile',
    '.env.example', 'README.md',
  ]
  for (const name of KEY_FILE_NAMES) {
    const fp = path.join(cwd, name)
    if (fs.existsSync(fp)) {
      try {
        const content = fs.readFileSync(fp, 'utf-8')
        // 限制每个文件最多 100 行
        const lines = content.split('\n').slice(0, 100).join('\n')
        keyFiles[name] = lines
      } catch { /* skip */ }
    }
  }

  // 构建文件树
  function walk(dir: string, prefix: string, depth: number): void {
    if (depth > maxDepth) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch { return }

    // 排序：目录在前，文件在后
    const sorted = entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1
      if (!a.isDirectory() && b.isDirectory()) return 1
      return a.name.localeCompare(b.name)
    })

    const visible = sorted.filter(e => !IGNORED_DIRS.has(e.name) && !e.name.startsWith('.'))
    const limit = 30 // 每层最多显示 30 个条目

    for (let i = 0; i < Math.min(visible.length, limit); i++) {
      const entry = visible[i]
      const isLast = i === Math.min(visible.length, limit) - 1
      const connector = isLast ? '└── ' : '├── '
      const childPrefix = isLast ? '    ' : '│   '

      if (entry.isDirectory()) {
        dirCount++
        treeLines.push(`${prefix}${connector}${entry.name}/`)
        walk(path.join(dir, entry.name), prefix + childPrefix, depth + 1)
      } else {
        fileCount++
        const ext = path.extname(entry.name)
        if (!IGNORED_EXTENSIONS.has(ext) && !entry.name.includes('.min.')) {
          treeLines.push(`${prefix}${connector}${entry.name}`)
          // 统计代码行数（仅源码文件）
          if (['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.vue', '.css', '.scss'].includes(ext)) {
            try {
              const content = fs.readFileSync(path.join(dir, entry.name), 'utf-8')
              totalLines += content.split('\n').length
            } catch { /* skip */ }
          }
        }
      }
    }

    if (visible.length > limit) {
      treeLines.push(`${prefix}└── ... (${visible.length - limit} more)`)
    }
  }

  walk(cwd, '', 0)

  return {
    language,
    framework,
    fileTree: treeLines.join('\n'),
    keyFiles,
    stats: { files: fileCount, dirs: dirCount, totalLines },
  }
}

function detectLanguage(cwd: string): string {
  if (fs.existsSync(path.join(cwd, 'package.json'))) return 'JavaScript/TypeScript'
  if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) return 'Rust'
  if (fs.existsSync(path.join(cwd, 'pyproject.toml')) || fs.existsSync(path.join(cwd, 'setup.py'))) return 'Python'
  if (fs.existsSync(path.join(cwd, 'go.mod'))) return 'Go'
  if (fs.existsSync(path.join(cwd, 'pom.xml')) || fs.existsSync(path.join(cwd, 'build.gradle'))) return 'Java/Kotlin'
  return 'Unknown'
}

function detectFramework(cwd: string): string {
  try {
    const pkgPath = path.join(cwd, 'package.json')
    if (!fs.existsSync(pkgPath)) return ''
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    if (deps['next']) return 'Next.js'
    if (deps['nuxt']) return 'Nuxt'
    if (deps['vue']) return 'Vue'
    if (deps['react']) return 'React'
    if (deps['svelte']) return 'Svelte'
    if (deps['@angular/core']) return 'Angular'
    if (deps['express']) return 'Express'
    if (deps['fastify']) return 'Fastify'
    if (deps['nest']) return 'NestJS'
  } catch { /* skip */ }
  return ''
}

/** 将 Repo Map 格式化为可注入 Agent 上下文的文本 */
function formatRepoMap(map: RepoMap): string {
  const parts: string[] = ['[Repo Map]']
  parts.push(`Language: ${map.language}`)
  if (map.framework) parts.push(`Framework: ${map.framework}`)
  parts.push(`Stats: ${map.stats.files} files, ${map.stats.dirs} dirs, ~${map.stats.totalLines} lines`)
  parts.push(`\nFile Tree:\n${map.fileTree}`)

  // 关键文件摘要
  const fileNames = Object.keys(map.keyFiles)
  if (fileNames.length > 0) {
    parts.push(`\nKey Files: ${fileNames.join(', ')}`)
  }

  return parts.join('\n')
}

/* ════════════════════════════════════════
   P2-8: Lint/Test/Build 集成
   ════════════════════════════════════════ */

interface ProjectCommands {
  lint: string | null
  test: string | null
  build: string | null
}

/** 自动检测项目类型并返回可用的 lint/test/build 命令 */
function detectProjectCommands(cwd: string): ProjectCommands {
  const result: ProjectCommands = { lint: null, test: null, build: null }

  // Node.js 项目
  const pkgPath = path.join(cwd, 'package.json')
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
      const scripts = pkg.scripts || {}
      if (scripts.lint) result.lint = 'npm run lint'
      else if (scripts.eslint) result.lint = 'npm run eslint'
      if (scripts.test) result.test = 'npm run test'
      else if (scripts['test:ci']) result.test = 'npm run test:ci'
      if (scripts.build) result.build = 'npm run build'
    } catch { /* skip */ }
  }

  // Rust 项目
  if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) {
    if (!result.lint) result.lint = 'cargo clippy'
    if (!result.test) result.test = 'cargo test'
    if (!result.build) result.build = 'cargo build'
  }

  // Go 项目
  if (fs.existsSync(path.join(cwd, 'go.mod'))) {
    if (!result.test) result.test = 'go test ./...'
    if (!result.build) result.build = 'go build ./...'
  }

  // Python 项目
  if (fs.existsSync(path.join(cwd, 'pyproject.toml')) || fs.existsSync(path.join(cwd, 'setup.py'))) {
    if (!result.lint) result.lint = 'ruff check .'
    if (!result.test) result.test = 'pytest'
  }

  // Makefile
  if (fs.existsSync(path.join(cwd, 'Makefile'))) {
    if (!result.build) result.build = 'make'
    if (!result.test) result.test = 'make test'
  }

  return result
}

/** 执行项目命令并返回输出 */
function runProjectCommand(cmd: string, cwd: string): { success: boolean; output: string } {
  try {
    const output = execSync(cmd, {
      cwd,
      timeout: 120_000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return { success: true, output: output.slice(-3000) } // 最多保留最后 3000 字符
  } catch (err: any) {
    const stdout = (err.stdout || '').slice(-1500)
    const stderr = (err.stderr || '').slice(-1500)
    return { success: false, output: `${stdout}\n${stderr}`.trim() }
  }
}

/* ════════════════════════════════════════
   P2-9: Hooks 系统
   ════════════════════════════════════════ */

interface HookConfig {
  PreToolUse?: Array<{ pattern: string; command: string }>
  PostToolUse?: Array<{ pattern: string; command: string }>
}

/** 加载 hooks 配置 */
function loadHooks(dataPath: string): HookConfig {
  const hooksPath = path.join(dataPath, 'hooks.json')
  try {
    if (fs.existsSync(hooksPath)) {
      return JSON.parse(fs.readFileSync(hooksPath, 'utf-8'))
    }
  } catch { /* skip */ }
  return {}
}

/** 执行 hook，匹配工具名并运行命令 */
function runHook(
  hooks: Array<{ pattern: string; command: string }>,
  toolName: string,
  args: Record<string, unknown>,
): string | null {
  for (const hook of hooks) {
    const regex = new RegExp(hook.pattern, 'i')
    if (regex.test(toolName)) {
      try {
        const argsJson = JSON.stringify(args)
        const result = execSync(hook.command, {
          env: { ...process.env, WS_TOOL_NAME: toolName, WS_TOOL_ARGS: argsJson },
          timeout: 30_000,
          encoding: 'utf-8',
        })
        return result.trim()
      } catch (err: any) {
        return `Hook error: ${err.message}`
      }
    }
  }
  return null
}

/* ════════════════════════════════════════
   P2-10: Subagent / 并行
   ════════════════════════════════════════ */

interface SubagentTask {
  id: string
  prompt: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  result?: string
}

/** 简单的 subagent 调度器：将任务分配给独立 Agent 实例并行执行 */
async function runSubagents(
  tasks: SubagentTask[],
  config: ProviderConfig,
  dataPath: string,
  onProgress?: (task: SubagentTask) => void,
): Promise<SubagentTask[]> {
  const maxConcurrent = 3
  const results: SubagentTask[] = [...tasks]
  const queue = [...tasks.map((_, i) => i)]
  const running = new Set<number>()

  return new Promise((resolve) => {
    function next(): void {
      if (queue.length === 0 && running.size === 0) {
        resolve(results)
        return
      }

      while (running.size < maxConcurrent && queue.length > 0) {
        const idx = queue.shift()!
        running.add(idx)
        results[idx].status = 'running'
        onProgress?.(results[idx])

        const task = results[idx]
        // 为每个 subagent 创建独立的 Agent 实例
        const subDataPath = path.join(dataPath, `subagent-${task.id}`)
        if (!fs.existsSync(subDataPath)) fs.mkdirSync(subDataPath, { recursive: true })
        const subToolContext = createCliToolContext(subDataPath, config)

        createWorldSmithAgent({
          providerConfig: config,
          toolContext: subToolContext,
          projectName: `SubAgent-${task.id}`,
        }).then(async (agent) => {
          try {
            let output = ''
            agent.subscribe((event: AgentEvent) => {
              if (event.type === 'message_update' && event.content) {
                output += event.content
              }
            })
            await agent.prompt(task.prompt)
            task.status = 'completed'
            task.result = output
          } catch (err: any) {
            task.status = 'failed'
            task.result = err.message
          } finally {
            agent.dispose()
            running.delete(idx)
            onProgress?.(task)
            next()
          }
        }).catch((err) => {
          task.status = 'failed'
          task.result = String(err)
          running.delete(idx)
          next()
        })
      }
    }

    next()
  })
}

/* ════════════════════════════════════════
   CLI 主逻辑
   ════════════════════════════════════════ */

export async function runCli(): Promise<void> {
  const program = new Command()

  program
    .name('worldsmith-agent')
    .description('WorldSmith AI Agent CLI')
    .version('0.1.0')

  program
    .command('chat')
    .description('Start an interactive chat session')
    .option('-p, --provider <provider>', 'LLM provider (deepseek, openai, anthropic)', 'deepseek')
    .option('-m, --model <model>', 'Model ID', 'deepseek-chat')
    .option('-k, --api-key <key>', 'API key (or use env WORLDSMITH_API_KEY)')
    .option('-d, --data <path>', 'Data directory path', './worldsmith-data')
    .option('--base-url <url>', 'Custom API base URL')
    .option('--no-guard', 'Disable safety guard for sensitive operations')
    .option('-s, --session <id>', 'Resume a specific session by ID')
    .action(async (opts) => {
      const apiKey = opts.apiKey || loadApiKeyFromEnv(opts.provider)
      if (!apiKey) {
        console.error('Error: API key required. Use -k flag, WORLDSMITH_API_KEY env, or .worldsmith-keys.json')
        process.exit(1)
      }

      const config: ProviderConfig = opts.baseUrl
        ? { mode: 'custom', baseUrl: opts.baseUrl, apiType: 'openai-compatible', modelId: opts.model, apiKey }
        : { mode: 'cloud', provider: opts.provider, modelId: opts.model, apiKey }

      const dataPath = path.resolve(opts.data)
      const cwd = process.cwd()
      const sessionStore = createCliSessionStore(dataPath)

      // 加载项目配置 (P0-2: WORLDSMITH.md)
      const projectConfig = loadProjectConfig(cwd)

      // P2-7: 构建 Repo Map
      const repoMap = buildRepoMap(cwd)
      const repoMapText = formatRepoMap(repoMap)

      // P2-8: 检测项目命令
      const projectCmds = detectProjectCommands(cwd)

      // P2-9: 加载 Hooks
      const hooks = loadHooks(dataPath)

      const toolContext = createCliToolContext(dataPath, config)

      // 会话管理 (P0-1: 会话持久化)
      let currentSession: AgentSession
      if (opts.session) {
        const existing = await sessionStore.getSession(opts.session)
        if (!existing) {
          console.error(`Session not found: ${opts.session}`)
          process.exit(1)
        }
        currentSession = existing
        console.log(`Resumed session: ${currentSession.name} (${currentSession.id.slice(0, 8)})`)
      } else {
        const sessions = await sessionStore.listSessions()
        if (sessions.length > 0) {
          // 继续最近的会话
          currentSession = sessions[0]
          console.log(`Continuing session: ${currentSession.name} (${currentSession.id.slice(0, 8)})`)
        } else {
          currentSession = await sessionStore.createSession(config.mode, opts.model)
          console.log(`Created new session: ${currentSession.id.slice(0, 8)}`)
        }
      }

      const agent = await createWorldSmithAgent({
        providerConfig: config,
        toolContext,
        projectName: 'WorldSmith',
        beforeToolCall: opts.guard ? createCLISafetyGuard(toolContext.stores.ui) : undefined,
      })

      // 消息追踪
      let messages: AgentMessage[] = [...currentSession.messages]
      let currentAssistantContent = ''
      let currentAssistantThinking = ''
      let currentToolCalls: AgentMessage['toolCalls'] = []

      // 自动保存计时器
      let saveTimer: ReturnType<typeof setTimeout> | null = null
      function scheduleAutoSave(): void {
        if (saveTimer) clearTimeout(saveTimer)
        saveTimer = setTimeout(async () => {
          currentSession.messages = messages
          await sessionStore.saveSession(currentSession)
        }, 2000)
      }

      agent.subscribe((event: AgentEvent) => {
        switch (event.type) {
          case 'agent_start':
            currentAssistantContent = ''
            currentAssistantThinking = ''
            currentToolCalls = []
            break

          case 'message_update':
            if (event.content) {
              currentAssistantContent = event.content
              process.stdout.write(event.content)
            }
            if (event.thinking) {
              currentAssistantThinking = event.thinking
            }
            break

          case 'message_end':
            process.stdout.write('\n\n')
            // 保存助手消息
            const assistantMsg: AgentMessage = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: currentAssistantContent,
              thinking: currentAssistantThinking || undefined,
              timestamp: Date.now(),
              toolCalls: currentToolCalls && currentToolCalls.length > 0 ? currentToolCalls : undefined,
            }
            messages.push(assistantMsg)
            currentAssistantContent = ''
            currentAssistantThinking = ''
            currentToolCalls = []
            scheduleAutoSave()
            break

          case 'tool_execution_start':
            process.stdout.write(`\n🔧 ${event.toolCall.name}(...)\n`)
            if (currentToolCalls) {
              currentToolCalls.push({
                id: event.toolCall.id,
                name: event.toolCall.name,
                args: event.toolCall.args,
                status: 'running',
                startedAt: Date.now(),
              })
            }
            // P2-9: PreToolUse hook
            if (hooks.PreToolUse) {
              const hookResult = runHook(hooks.PreToolUse, event.toolCall.name, event.toolCall.args || {})
              if (hookResult) process.stdout.write(`  [PreToolUse] ${hookResult}\n`)
            }
            // P1-4: 在危险工具执行前自动创建检查点
            if (opts.guard) {
              const toolName = event.toolCall.name
              const dangerousPatterns = ['delete', 'remove', 'destroy', 'drop', 'execute_command', 'shell_session', 'write_file', 'edit_file']
              if (dangerousPatterns.some(p => toolName.toLowerCase().includes(p))) {
                createCheckpoint(dataPath, currentSession.id, messages, `Before ${toolName}`)
              }
            }
            break

          case 'tool_execution_end':
            process.stdout.write(`  ${event.success ? '✅ done' : '❌ failed'}\n`)
            if (currentToolCalls) {
              const tc = currentToolCalls.find(t => t.id === event.toolCallId)
              if (tc) {
                tc.status = event.success ? 'completed' : 'failed'
                tc.result = event.result
                tc.endedAt = Date.now()
              }
            }
            // P2-9: PostToolUse hook
            if (hooks.PostToolUse) {
              const tc = currentToolCalls?.find(t => t.id === event.toolCallId)
              const hookResult = runHook(hooks.PostToolUse, tc?.name || '', { result: event.result, success: event.success })
              if (hookResult) process.stdout.write(`  [PostToolUse] ${hookResult}\n`)
            }
            break

          case 'agent_end':
            // 最终保存
            currentSession.messages = messages
            sessionStore.saveSession(currentSession)
            break

          case 'error':
            process.stderr.write(`\n❌ ${event.error?.message || 'Unknown error'}\n`)
            break
        }
      })

      // 如果有历史消息，恢复到 Agent 上下文
      if (messages.length > 0) {
        console.log(`Restored ${messages.length} messages from previous session`)
      }

      // 如果有 WORLDSMITH.md，注入到首次对话
      let configInjected = !projectConfig

      const readline = await import('readline')
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

      const prompt = (): void => {
        rl.question('You> ', async (input) => {
          const text = input.trim()
          if (!text) { prompt(); return }

          // ── 命令处理 ──
          if (text === '/quit' || text === '/exit') {
            // 保存会话后退出
            currentSession.messages = messages
            await sessionStore.saveSession(currentSession)
            agent.dispose()
            rl.close()
            process.exit(0)
          }

          if (text === '/sessions') {
            const sessions = await sessionStore.listSessions()
            if (sessions.length === 0) {
              console.log('No sessions found.')
            } else {
              console.log('\nSessions:')
              for (const s of sessions) {
                const current = s.id === currentSession.id ? ' ← current' : ''
                console.log(`  ${s.id.slice(0, 8)}  ${s.name}  (${s.messages.length} msgs)${current}`)
              }
              console.log()
            }
            prompt()
            return
          }

          if (text === '/compact') {
            // P0-3: 上下文压缩
            const before = messages.length
            messages = compactMessages(messages)
            const after = messages.length
            console.log(`Compacted: ${before} → ${after} messages`)
            currentSession.messages = messages
            await sessionStore.saveSession(currentSession)
            prompt()
            return
          }

          if (text === '/new') {
            currentSession = await sessionStore.createSession(config.mode, opts.model)
            messages = []
            agent.clearHistory()
            console.log(`New session: ${currentSession.id.slice(0, 8)}`)
            configInjected = false
            prompt()
            return
          }

          if (text.startsWith('/switch ')) {
            const targetId = text.slice(8).trim()
            const target = await sessionStore.getSession(targetId)
            if (!target) {
              // 尝试短 ID 匹配
              const sessions = await sessionStore.listSessions()
              const match = sessions.find(s => s.id.startsWith(targetId))
              if (match) {
                currentSession = match
              } else {
                console.log(`Session not found: ${targetId}`)
                prompt()
                return
              }
            } else {
              currentSession = target
            }
            messages = [...currentSession.messages]
            agent.clearHistory()
            console.log(`Switched to: ${currentSession.name} (${currentSession.id.slice(0, 8)})`)
            configInjected = false
            prompt()
            return
          }

          if (text === '/undo' || text.startsWith('/undo ')) {
            // P1-4: 回滚到检查点
            const checkpoints = loadCheckpoints(dataPath).filter(c => c.sessionId === currentSession.id)
            const cpId = text.startsWith('/undo ') ? text.slice(6).trim() : null

            if (cpId) {
              // 回滚到指定检查点
              const restored = await rollbackCheckpoint(dataPath, cpId, sessionStore)
              if (restored) {
                messages = restored
                agent.clearHistory()
                const cp = loadCheckpoints(dataPath).find(c => c.id === cpId)
                console.log(`Rolled back to checkpoint ${cpId}: ${cp?.description || 'unknown'}`)
              } else {
                console.log(`Checkpoint not found: ${cpId}`)
              }
            } else if (checkpoints.length === 0) {
              console.log('No checkpoints available.')
            } else {
              // 回滚到最近的检查点
              const cp = checkpoints[0]
              const restored = await rollbackCheckpoint(dataPath, cp.id, sessionStore)
              if (restored) {
                messages = restored
                agent.clearHistory()
                console.log(`Rolled back to checkpoint ${cp.id}: ${cp.description}`)
              } else {
                console.log('Failed to restore checkpoint.')
              }
            }
            prompt()
            return
          }

          // P1-5: MCP 命令
          if (text === '/mcp' || text.startsWith('/mcp ')) {
            const mcpManager = (agent as any).getMCPManager?.() as import('../mcp/mcp-manager').MCPManager | null
            if (!mcpManager) {
              console.log('MCP manager not available.')
              prompt()
              return
            }

            const parts = text.split(/\s+/)
            if (parts.length === 1 || parts[1] === 'list') {
              // 列出 MCP 连接
              const states = mcpManager.getConnectionStates()
              if (states.length === 0) {
                console.log('No MCP connections. Use /mcp add <name> <url> to add one.')
              } else {
                console.log('\nMCP Connections:')
                for (const s of states) {
                  const toolCount = s.tools.length
                  console.log(`  ${s.id}  ${s.config.name}  [${s.status}]  ${toolCount} tools`)
                }
                console.log()
              }
            } else if (parts[1] === 'add' && parts.length >= 4) {
              const name = parts[2]
              const url = parts[3]
              const mcpConfig: MCPConnectionConfig = {
                id: crypto.randomUUID().slice(0, 8),
                name,
                transport: 'streamable-http',
                url,
                enabled: true,
              }
              try {
                await mcpManager.addConnection(mcpConfig)
                console.log(`Added MCP server: ${name} (${url})`)
              } catch (err) {
                console.log(`Failed to add MCP server: ${err}`)
              }
            } else if (parts[1] === 'rm' && parts.length >= 3) {
              const id = parts[2]
              try {
                await mcpManager.removeConnection(id)
                console.log(`Removed MCP connection: ${id}`)
              } catch (err) {
                console.log(`Failed to remove MCP connection: ${err}`)
              }
            } else {
              console.log('Usage: /mcp [list] | /mcp add <name> <url> | /mcp rm <id>')
            }
            prompt()
            return
          }

          // P2-7: Repo Map 命令
          if (text === '/repo') {
            console.log(repoMapText)
            prompt()
            return
          }

          // P2-8: Lint/Test/Build 命令
          if (text === '/lint') {
            if (!projectCmds.lint) {
              console.log('No lint command detected for this project.')
            } else {
              console.log(`Running: ${projectCmds.lint}`)
              const result = runProjectCommand(projectCmds.lint, cwd)
              console.log(result.success ? '✅ Lint passed' : '❌ Lint failed')
              if (result.output) console.log(result.output)
            }
            prompt()
            return
          }

          if (text === '/test') {
            if (!projectCmds.test) {
              console.log('No test command detected for this project.')
            } else {
              console.log(`Running: ${projectCmds.test}`)
              const result = runProjectCommand(projectCmds.test, cwd)
              console.log(result.success ? '✅ Tests passed' : '❌ Tests failed')
              if (result.output) console.log(result.output)
            }
            prompt()
            return
          }

          if (text === '/build') {
            if (!projectCmds.build) {
              console.log('No build command detected for this project.')
            } else {
              console.log(`Running: ${projectCmds.build}`)
              const result = runProjectCommand(projectCmds.build, cwd)
              console.log(result.success ? '✅ Build succeeded' : '❌ Build failed')
              if (result.output) console.log(result.output)
            }
            prompt()
            return
          }

          // P2-10: Subagent 命令
          if (text.startsWith('/sub ')) {
            const subPrompt = text.slice(5).trim()
            if (!subPrompt) {
              console.log('Usage: /sub <prompt>')
              prompt()
              return
            }
            const task: SubagentTask = {
              id: crypto.randomUUID().slice(0, 8),
              prompt: subPrompt,
              status: 'pending',
            }
            console.log(`Starting subagent ${task.id}...`)
            const results = await runSubagents([task], config, dataPath, (t) => {
              if (t.status === 'running') console.log(`  Subagent ${t.id} running...`)
            })
            const result = results[0]
            if (result.status === 'completed') {
              console.log(`\n📝 Subagent ${result.id} result:\n${result.result}\n`)
            } else {
              console.log(`\n❌ Subagent ${result.id} failed: ${result.result}\n`)
            }
            prompt()
            return
          }

          if (text === '/help') {
            console.log(`
Commands:
  /quit, /exit     Save and exit
  /new             Create a new session
  /sessions        List all sessions
  /switch <id>     Switch to a session (supports short ID)
  /compact         Compress conversation history
  /undo            Rollback to last checkpoint
  /undo <id>       Rollback to a specific checkpoint
  /mcp             List MCP connections
  /mcp add <n> <url>   Add MCP server (streamable-http)
  /mcp rm <id>     Remove MCP connection
  /repo            Show repo map (file tree + project info)
  /lint            Run lint check
  /test            Run tests
  /build           Run build
  /sub <prompt>    Run a subagent task in parallel
  /help            Show this help
  @path/to/file    Reference a file in your message
`)
            prompt()
            return
          }

          // ── 正常消息处理 ──
          try {
            // P0-2 + P2-7: 首次对话注入 WORLDSMITH.md + Repo Map
            let contextOverride: string | undefined
            if (!configInjected) {
              const contextParts: string[] = []
              if (projectConfig) {
                contextParts.push(`[Project Configuration (WORLDSMITH.md)]\n${projectConfig}`)
              }
              // P2-7: 注入 Repo Map
              contextParts.push(repoMapText)
              // P2-8: 注入项目命令信息
              const cmdParts: string[] = []
              if (projectCmds.lint) cmdParts.push(`lint: ${projectCmds.lint}`)
              if (projectCmds.test) cmdParts.push(`test: ${projectCmds.test}`)
              if (projectCmds.build) cmdParts.push(`build: ${projectCmds.build}`)
              if (cmdParts.length > 0) {
                contextParts.push(`[Project Commands]\n${cmdParts.join('\n')}`)
              }
              contextOverride = contextParts.join('\n\n')
              configInjected = true
            }

            // P1-6: @ 文件引用解析
            const { prompt: resolvedPrompt, files } = resolveFileRefs(text, cwd)

            // 保存用户消息
            const userMsg: AgentMessage = {
              id: crypto.randomUUID(),
              role: 'user',
              content: resolvedPrompt,
              files: files.length > 0 ? files : undefined,
              timestamp: Date.now(),
            }
            messages.push(userMsg)

            await agent.prompt(resolvedPrompt, {
              contextOverride,
              files: files.length > 0 ? files : undefined,
            })
          } catch (err) {
            process.stderr.write(`Error: ${err}\n`)
          }
          prompt()
        })
      }

      console.log('WorldSmith AI Agent CLI')
      console.log(`Model: ${opts.provider}/${opts.model}`)
      console.log(`Data:  ${dataPath}`)
      console.log(`Guard: ${opts.guard ? 'ON' : 'OFF'}`)
      if (projectConfig) console.log('Config: WORLDSMITH.md loaded')
      console.log(`Repo:  ${repoMap.language}${repoMap.framework ? ` / ${repoMap.framework}` : ''} (${repoMap.stats.files} files)`)
      const availCmds = [projectCmds.lint && 'lint', projectCmds.test && 'test', projectCmds.build && 'build'].filter(Boolean)
      if (availCmds.length > 0) console.log(`Cmds:  ${availCmds.join(', ')}`)
      console.log('Type /help for commands\n')
      prompt()
    })

  program.parse()
}
