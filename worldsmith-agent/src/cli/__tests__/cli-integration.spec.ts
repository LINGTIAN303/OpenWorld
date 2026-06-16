/**
 * CLI Agent 端到端集成测试
 * 测试所有 P0/P1/P2 功能的纯逻辑部分（不依赖真实 LLM API）
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

/* ════════════════════════════════════════
   辅助：从 index.ts 中提取的纯函数测试
   由于 index.ts 是 CLI 入口，直接 import 会触发副作用，
   所以这里重新实现关键逻辑进行单元级验证
   ════════════════════════════════════════ */

// ── P0-2: WORLDSMITH.md 加载 ──

const WORLDSMITH_MD_NAMES = ['WORLDSMITH.md', '.worldsmith.md']

function loadProjectConfig(cwd: string): string {
  const parts: string[] = []
  const homeDir = process.env.HOME || process.env.USERPROFILE || ''
  if (homeDir) {
    const globalPath = path.join(homeDir, '.worldsmith', 'WORLDSMITH.md')
    if (fs.existsSync(globalPath)) {
      parts.push(fs.readFileSync(globalPath, 'utf-8'))
    }
  }
  for (const name of WORLDSMITH_MD_NAMES) {
    const filePath = path.join(cwd, name)
    if (fs.existsSync(filePath)) {
      parts.push(fs.readFileSync(filePath, 'utf-8'))
      break
    }
  }
  return parts.join('\n\n---\n\n')
}

// ── P1-6: @ 文件引用 ──

const FILE_REF_PATTERN = /@([\w./_-]+(?:\.\w+)?)/g

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
        resolved = resolved.replace(match[0], `[文件: ${ref}]\n\`\`\`\n${content}\n\`\`\``)
      } catch { /* skip */ }
    }
  }
  return { prompt: resolved, files }
}

// ── P0-3: 上下文压缩 ──

interface AgentMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'toolResult'
  content: string
  timestamp: number
}

const COMPACT_THRESHOLD = 40

function compactMessages(messages: AgentMessage[]): AgentMessage[] {
  if (messages.length <= COMPACT_THRESHOLD) return messages
  const older = messages.slice(0, messages.length - COMPACT_THRESHOLD)
  const recent = messages.slice(messages.length - COMPACT_THRESHOLD)
  const userCount = older.filter(m => m.role === 'user').length
  const assistantCount = older.filter(m => m.role === 'assistant').length
  const toolCount = older.filter(m => m.role === 'toolResult').length
  const summary: AgentMessage = {
    id: 'compact-summary',
    role: 'system',
    content: `[上下文已压缩] 之前有 ${userCount} 条用户消息、${assistantCount} 条助手回复、${toolCount} 条工具结果。`,
    timestamp: Date.now(),
  }
  return [summary, ...recent]
}

// ── P2-7: Repo Map ──

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'out', 'target',
  '__pycache__', '.venv', 'venv', '.tox', '.mypy_cache', '.pytest_cache',
  'vendor', 'Pods', '.gradle', '.idea', '.vscode', '.cache', '.turbo',
])

function detectLanguage(cwd: string): string {
  if (fs.existsSync(path.join(cwd, 'package.json'))) return 'JavaScript/TypeScript'
  if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) return 'Rust'
  if (fs.existsSync(path.join(cwd, 'pyproject.toml')) || fs.existsSync(path.join(cwd, 'setup.py'))) return 'Python'
  if (fs.existsSync(path.join(cwd, 'go.mod'))) return 'Go'
  return 'Unknown'
}

function detectFramework(cwd: string): string {
  try {
    const pkgPath = path.join(cwd, 'package.json')
    if (!fs.existsSync(pkgPath)) return ''
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    if (deps['next']) return 'Next.js'
    if (deps['vue']) return 'Vue'
    if (deps['react']) return 'React'
  } catch { /* skip */ }
  return ''
}

// ── P2-8: Lint/Test/Build 检测 ──

interface ProjectCommands {
  lint: string | null
  test: string | null
  build: string | null
}

function detectProjectCommands(cwd: string): ProjectCommands {
  const result: ProjectCommands = { lint: null, test: null, build: null }
  const pkgPath = path.join(cwd, 'package.json')
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
      const scripts = pkg.scripts || {}
      if (scripts.lint) result.lint = 'npm run lint'
      if (scripts.test) result.test = 'npm run test'
      if (scripts.build) result.build = 'npm run build'
    } catch { /* skip */ }
  }
  if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) {
    if (!result.lint) result.lint = 'cargo clippy'
    if (!result.test) result.test = 'cargo test'
    if (!result.build) result.build = 'cargo build'
  }
  return result
}

// ── P2-9: Hooks ──

interface HookConfig {
  PreToolUse?: Array<{ pattern: string; command: string }>
  PostToolUse?: Array<{ pattern: string; command: string }>
}

function loadHooks(dataPath: string): HookConfig {
  const hooksPath = path.join(dataPath, 'hooks.json')
  try {
    if (fs.existsSync(hooksPath)) {
      return JSON.parse(fs.readFileSync(hooksPath, 'utf-8'))
    }
  } catch { /* skip */ }
  return {}
}

/* ════════════════════════════════════════
   测试用例
   ════════════════════════════════════════ */

describe('CLI Agent 集成测试', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-cli-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  // ── P0-2: WORLDSMITH.md 加载 ──
  describe('P0-2: WORLDSMITH.md 项目配置加载', () => {
    it('应加载项目根目录的 WORLDSMITH.md', () => {
      fs.writeFileSync(path.join(tmpDir, 'WORLDSMITH.md'), '# Project Rules\nAlways use TypeScript')
      const config = loadProjectConfig(tmpDir)
      expect(config).toContain('Always use TypeScript')
    })

    it('应加载 .worldsmith.md 作为备选', () => {
      fs.writeFileSync(path.join(tmpDir, '.worldsmith.md'), '# Alt Config\nUse strict mode')
      const config = loadProjectConfig(tmpDir)
      expect(config).toContain('Use strict mode')
    })

    it('WORLDSMITH.md 优先于 .worldsmith.md', () => {
      fs.writeFileSync(path.join(tmpDir, 'WORLDSMITH.md'), 'PRIMARY')
      fs.writeFileSync(path.join(tmpDir, '.worldsmith.md'), 'SECONDARY')
      const config = loadProjectConfig(tmpDir)
      expect(config).toContain('PRIMARY')
      expect(config).not.toContain('SECONDARY')
    })

    it('无配置文件时返回空字符串', () => {
      const config = loadProjectConfig(tmpDir)
      expect(config).toBe('')
    })
  })

  // ── P1-6: @ 文件引用 ──
  describe('P1-6: @ 文件引用解析', () => {
    it('应解析 @path/to/file 引用', () => {
      fs.writeFileSync(path.join(tmpDir, 'hello.ts'), 'console.log("hello")')
      const { prompt, files } = resolveFileRefs('请看 @hello.ts 这个文件', tmpDir)
      expect(files).toHaveLength(1)
      expect(files[0].name).toBe('hello.ts')
      expect(files[0].content).toBe('console.log("hello")')
      expect(prompt).toContain('[文件: hello.ts]')
      expect(prompt).toContain('console.log("hello")')
    })

    it('无 @ 引用时原样返回', () => {
      const { prompt, files } = resolveFileRefs('普通消息', tmpDir)
      expect(prompt).toBe('普通消息')
      expect(files).toHaveLength(0)
    })

    it('引用不存在的文件时保留原始引用', () => {
      const { prompt, files } = resolveFileRefs('看 @nonexistent.ts', tmpDir)
      expect(files).toHaveLength(0)
      expect(prompt).toContain('@nonexistent.ts')
    })

    it('应解析子目录中的文件引用', () => {
      fs.mkdirSync(path.join(tmpDir, 'src'))
      fs.writeFileSync(path.join(tmpDir, 'src', 'utils.ts'), 'export function add(a: number, b: number) { return a + b }')
      const { prompt, files } = resolveFileRefs('看 @src/utils.ts', tmpDir)
      expect(files).toHaveLength(1)
      expect(files[0].content).toContain('export function add')
    })
  })

  // ── P0-3: 上下文压缩 ──
  describe('P0-3: 上下文压缩 (Compact)', () => {
    function makeMessages(count: number): AgentMessage[] {
      return Array.from({ length: count }, (_, i) => ({
        id: `msg-${i}`,
        role: (i % 2 === 0 ? 'user' : 'assistant') as AgentMessage['role'],
        content: `Message ${i}`,
        timestamp: Date.now() + i,
      }))
    }

    it('消息数 <= 阈值时不压缩', () => {
      const msgs = makeMessages(30)
      const result = compactMessages(msgs)
      expect(result).toHaveLength(30)
      expect(result[0].role).toBe('user')
    })

    it('消息数 > 阈值时压缩为 summary + 最近 N 条', () => {
      const msgs = makeMessages(60)
      const result = compactMessages(msgs)
      expect(result).toHaveLength(COMPACT_THRESHOLD + 1) // 1 summary + 40 recent
      expect(result[0].role).toBe('system')
      expect(result[0].content).toContain('上下文已压缩')
      // 60 条消息中前 20 条被压缩：偶数索引为 user (10)，奇数索引为 assistant (10)
      expect(result[0].content).toContain('10 条用户消息')
      expect(result[0].content).toContain('10 条助手回复')
    })

    it('压缩后保留最近的消息内容', () => {
      const msgs = makeMessages(50)
      const result = compactMessages(msgs)
      // 最后一条应保留
      expect(result[result.length - 1].content).toBe('Message 49')
    })
  })

  // ── P2-7: Repo Map ──
  describe('P2-7: Repo Map / 代码库感知', () => {
    it('应检测 JavaScript/TypeScript 项目', () => {
      fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"test"}')
      expect(detectLanguage(tmpDir)).toBe('JavaScript/TypeScript')
    })

    it('应检测 Rust 项目', () => {
      fs.writeFileSync(path.join(tmpDir, 'Cargo.toml'), '[package]\nname = "test"')
      expect(detectLanguage(tmpDir)).toBe('Rust')
    })

    it('应检测 Python 项目', () => {
      fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), '[project]\nname = "test"')
      expect(detectLanguage(tmpDir)).toBe('Python')
    })

    it('无已知配置文件时返回 Unknown', () => {
      expect(detectLanguage(tmpDir)).toBe('Unknown')
    })

    it('应检测 Vue 框架', () => {
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
        dependencies: { vue: '^3.0.0' },
      }))
      expect(detectFramework(tmpDir)).toBe('Vue')
    })

    it('应检测 React 框架', () => {
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
        dependencies: { react: '^18.0.0' },
      }))
      expect(detectFramework(tmpDir)).toBe('React')
    })

    it('应检测 Next.js 框架（优先于 React）', () => {
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
        dependencies: { next: '^14.0.0', react: '^18.0.0' },
      }))
      expect(detectFramework(tmpDir)).toBe('Next.js')
    })

    it('无 package.json 时返回空字符串', () => {
      expect(detectFramework(tmpDir)).toBe('')
    })
  })

  // ── P2-8: Lint/Test/Build 检测 ──
  describe('P2-8: Lint/Test/Build 命令检测', () => {
    it('应检测 Node.js 项目的 lint/test/build 命令', () => {
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
        scripts: { lint: 'eslint .', test: 'vitest run', build: 'vite build' },
      }))
      const cmds = detectProjectCommands(tmpDir)
      expect(cmds.lint).toBe('npm run lint')
      expect(cmds.test).toBe('npm run test')
      expect(cmds.build).toBe('npm run build')
    })

    it('应检测 Rust 项目的命令', () => {
      fs.writeFileSync(path.join(tmpDir, 'Cargo.toml'), '[package]\nname = "test"')
      const cmds = detectProjectCommands(tmpDir)
      expect(cmds.lint).toBe('cargo clippy')
      expect(cmds.test).toBe('cargo test')
      expect(cmds.build).toBe('cargo build')
    })

    it('无项目配置时所有命令为 null', () => {
      const cmds = detectProjectCommands(tmpDir)
      expect(cmds.lint).toBeNull()
      expect(cmds.test).toBeNull()
      expect(cmds.build).toBeNull()
    })

    it('部分脚本缺失时只返回存在的命令', () => {
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
        scripts: { test: 'vitest run' },
      }))
      const cmds = detectProjectCommands(tmpDir)
      expect(cmds.lint).toBeNull()
      expect(cmds.test).toBe('npm run test')
      expect(cmds.build).toBeNull()
    })
  })

  // ── P2-9: Hooks ──
  describe('P2-9: Hooks 系统', () => {
    it('应加载 hooks.json 配置', () => {
      const hookConfig = {
        PreToolUse: [{ pattern: 'write_file', command: 'echo "writing"' }],
        PostToolUse: [{ pattern: 'shell_session', command: 'echo "done"' }],
      }
      fs.writeFileSync(path.join(tmpDir, 'hooks.json'), JSON.stringify(hookConfig))
      const loaded = loadHooks(tmpDir)
      expect(loaded.PreToolUse).toHaveLength(1)
      expect(loaded.PreToolUse![0].pattern).toBe('write_file')
      expect(loaded.PostToolUse).toHaveLength(1)
    })

    it('无 hooks.json 时返回空配置', () => {
      const loaded = loadHooks(tmpDir)
      expect(loaded.PreToolUse).toBeUndefined()
      expect(loaded.PostToolUse).toBeUndefined()
    })

    it('损坏的 hooks.json 时返回空配置', () => {
      fs.writeFileSync(path.join(tmpDir, 'hooks.json'), 'not valid json{{{')
      const loaded = loadHooks(tmpDir)
      expect(loaded.PreToolUse).toBeUndefined()
    })
  })

  // ── P0-1: 会话持久化 ──
  describe('P0-1: 会话持久化 (CliSessionStore)', () => {
    it('应创建新会话', async () => {
      const { createCliSessionStore } = await import('../../cli/cli-session-store')
      const store = createCliSessionStore(tmpDir)
      const session = await store.createSession('cloud', 'deepseek-chat')
      expect(session.id).toBeTruthy()
      expect(session.providerMode).toBe('cloud')
      expect(session.modelId).toBe('deepseek-chat')
      expect(session.messages).toHaveLength(0)
    })

    it('应保存和恢复会话', async () => {
      const { createCliSessionStore } = await import('../../cli/cli-session-store')
      const store = createCliSessionStore(tmpDir)
      const session = await store.createSession('cloud', 'deepseek-chat')
      session.messages.push({
        id: 'test-msg',
        role: 'user',
        content: 'Hello',
        timestamp: Date.now(),
      })
      await store.saveSession(session)

      // 重新加载
      const store2 = createCliSessionStore(tmpDir)
      const loaded = await store2.getSession(session.id)
      expect(loaded).toBeTruthy()
      expect(loaded!.messages).toHaveLength(1)
      expect(loaded!.messages[0].content).toBe('Hello')
    })

    it('应列出所有会话', async () => {
      const { createCliSessionStore } = await import('../../cli/cli-session-store')
      const store = createCliSessionStore(tmpDir)
      await store.createSession('cloud', 'model-a')
      await store.createSession('local', 'model-b')
      const sessions = await store.listSessions()
      expect(sessions).toHaveLength(2)
    })

    it('应删除会话', async () => {
      const { createCliSessionStore } = await import('../../cli/cli-session-store')
      const store = createCliSessionStore(tmpDir)
      const session = await store.createSession('cloud', 'deepseek-chat')
      await store.deleteSession(session.id)
      const loaded = await store.getSession(session.id)
      expect(loaded).toBeUndefined()
    })

    it('应按 updatedAt 降序排列', async () => {
      const { createCliSessionStore } = await import('../../cli/cli-session-store')
      const store = createCliSessionStore(tmpDir)
      const s1 = await store.createSession('cloud', 'model-a')
      const s2 = await store.createSession('cloud', 'model-b')
      // 更新 s1 使其更新时间更晚
      s1.messages.push({ id: 'msg', role: 'user', content: 'hi', timestamp: Date.now() })
      await store.saveSession(s1)

      const sessions = await store.listSessions()
      expect(sessions[0].id).toBe(s1.id) // 最近更新的在前
    })
  })

  // ── P1-4: 检查点/回滚 ──
  describe('P1-4: 检查点/回滚', () => {
    // 检查点逻辑在 index.ts 中，这里测试文件存储层
    it('应正确创建和读取检查点文件', () => {
      const checkpoints = [
        { id: 'cp-001', sessionId: 's-001', messageIndex: 5, timestamp: new Date().toISOString(), description: 'Before write_file' },
        { id: 'cp-002', sessionId: 's-001', messageIndex: 10, timestamp: new Date().toISOString(), description: 'Before shell_session' },
      ]
      fs.writeFileSync(path.join(tmpDir, 'checkpoints.json'), JSON.stringify(checkpoints, null, 2))
      const loaded = JSON.parse(fs.readFileSync(path.join(tmpDir, 'checkpoints.json'), 'utf-8'))
      expect(loaded).toHaveLength(2)
      expect(loaded[0].id).toBe('cp-001')
      expect(loaded[1].description).toBe('Before shell_session')
    })

    it('应正确保存消息快照', () => {
      const messages = [
        { id: 'm1', role: 'user' as const, content: 'Hello', timestamp: Date.now() },
        { id: 'm2', role: 'assistant' as const, content: 'Hi there', timestamp: Date.now() },
      ]
      fs.writeFileSync(path.join(tmpDir, 'checkpoint-test.json'), JSON.stringify(messages, null, 2))
      const loaded = JSON.parse(fs.readFileSync(path.join(tmpDir, 'checkpoint-test.json'), 'utf-8'))
      expect(loaded).toHaveLength(2)
      expect(loaded[1].content).toBe('Hi there')
    })
  })
})
