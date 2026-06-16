import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'

import type { AgentSession } from '../session/types'
import { readJson, writeJson } from './stores/json-store'

/** 索引条目：用于快速列表，无需读取完整会话文件 */
interface SessionIndexEntry {
  id: string
  name: string
  updatedAt: string
  providerMode: string
  modelId: string
}

const SESSIONS_DIR = 'sessions'
const INDEX_KEY = 'sessions-index'

/** 确保会话目录存在 */
function ensureSessionsDir(dataPath: string): string {
  const dir = path.join(dataPath, SESSIONS_DIR)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

/** 读取索引文件 */
function readIndex(dataPath: string): SessionIndexEntry[] {
  return readJson<SessionIndexEntry[]>(dataPath, INDEX_KEY, [])
}

/** 写入索引文件 */
function writeIndex(dataPath: string, index: SessionIndexEntry[]): void {
  writeJson(dataPath, INDEX_KEY, index)
}

/** 从完整会话对象提取索引条目 */
function toIndexEntry(session: AgentSession): SessionIndexEntry {
  return {
    id: session.id,
    name: session.name,
    updatedAt: session.updatedAt,
    providerMode: session.providerMode,
    modelId: session.modelId,
  }
}

/** 列出所有会话，按 updatedAt 降序排列 */
async function listSessions(dataPath: string): Promise<AgentSession[]> {
  const index = readIndex(dataPath)
  const sessions: AgentSession[] = []
  for (const entry of index) {
    const session = await getSession(dataPath, entry.id)
    if (session) {
      sessions.push(session)
    }
  }
  sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  return sessions
}

/** 获取单个会话 */
async function getSession(
  dataPath: string,
  id: string,
): Promise<AgentSession | undefined> {
  const sessionsDir = path.join(dataPath, SESSIONS_DIR)
  const filePath = path.join(sessionsDir, `${id}.json`)
  try {
    if (!fs.existsSync(filePath)) return undefined
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as AgentSession
  } catch {
    return undefined
  }
}

/** 保存/更新会话，自动更新 updatedAt 并同步索引 */
async function saveSession(dataPath: string, session: AgentSession): Promise<void> {
  ensureSessionsDir(dataPath)

  session.updatedAt = new Date().toISOString()

  const sessionsDir = path.join(dataPath, SESSIONS_DIR)
  const filePath = path.join(sessionsDir, `${session.id}.json`)
  fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8')

  // 同步索引
  const index = readIndex(dataPath)
  const idx = index.findIndex((e) => e.id === session.id)
  const entry = toIndexEntry(session)
  if (idx >= 0) {
    index[idx] = entry
  } else {
    index.push(entry)
  }
  writeIndex(dataPath, index)
}

/** 删除会话文件并同步索引 */
async function deleteSession(dataPath: string, id: string): Promise<void> {
  const sessionsDir = path.join(dataPath, SESSIONS_DIR)
  const filePath = path.join(sessionsDir, `${id}.json`)
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }

  // 同步索引
  const index = readIndex(dataPath)
  const filtered = index.filter((e) => e.id !== id)
  if (filtered.length !== index.length) {
    writeIndex(dataPath, filtered)
  }
}

/** 创建新会话 */
async function createSession(
  dataPath: string,
  providerMode: string,
  modelId: string,
  chatMode?: 'normal' | 'deep' | 'explore',
): Promise<AgentSession> {
  const now = new Date().toISOString()
  const session: AgentSession = {
    id: crypto.randomUUID(),
    name: `Session ${now.replace(/[T].*/, '')}`,
    createdAt: now,
    updatedAt: now,
    providerMode: providerMode as AgentSession['providerMode'],
    modelId,
    messages: [],
    metadata: {
      totalTokens: 0,
      totalCost: 0,
      toolCallCount: 0,
    },
    chatMode,
  }

  await saveSession(dataPath, session)
  return session
}

/** 工厂函数：创建绑定到指定 dataPath 的会话存储 */
export function createCliSessionStore(dataPath: string) {
  return {
    listSessions: () => listSessions(dataPath),
    getSession: (id: string) => getSession(dataPath, id),
    saveSession: (session: AgentSession) => saveSession(dataPath, session),
    deleteSession: (id: string) => deleteSession(dataPath, id),
    createSession: (
      providerMode: string,
      modelId: string,
      chatMode?: 'normal' | 'deep' | 'explore',
    ) => createSession(dataPath, providerMode, modelId, chatMode),
  }
}
