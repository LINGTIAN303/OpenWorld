/**
 * 会话管理器
 *
 * 基于 Dexie (IndexedDB) 实现 Agent 会话的持久化存储。
 * 提供会话的 CRUD 操作，以及在删除会话时级联清理 IndexedDB 中的图片数据。
 *
 * 数据库: worldsmith-agent (v1)
 * 表: sessions (索引: id, name, updatedAt, providerMode)
 */

import Dexie, { type Table } from 'dexie'
import type { AgentSession } from './types'
import { deleteImage } from '../stores/image-persistence'

/** Dexie 数据库类，封装 sessions 表 */
class AgentDB extends Dexie {
  sessions!: Table<AgentSession, string>

  constructor() {
    super('worldsmith-agent')
    this.version(1).stores({
      sessions: 'id, name, updatedAt, providerMode',
    })
  }
}

/** 懒加载的单例数据库实例 */
let db: AgentDB | null = null

function getDb(): AgentDB {
  if (!db) {
    db = new AgentDB()
  }
  return db
}

/** 列出所有会话，按更新时间倒序 */
export async function listSessions(): Promise<AgentSession[]> {
  try {
    return await getDb().sessions.orderBy('updatedAt').reverse().toArray()
  } catch {
    return []
  }
}

/** 获取单个会话 */
export async function getSession(id: string): Promise<AgentSession | undefined> {
  try {
    return await getDb().sessions.get(id)
  } catch {
    return undefined
  }
}

/** 保存或更新会话（自动更新 updatedAt 时间戳） */
export async function saveSession(session: AgentSession): Promise<void> {
  try {
    session.updatedAt = new Date().toISOString()
    await getDb().sessions.put(session)
  } catch (err) {
    console.warn('[AgentDB] saveSession failed:', err)
  }
}

/**
 * 删除会话及其关联的 IndexedDB 图片
 *
 * 删除流程：
 * 1. 读取会话的所有消息
 * 2. 遍历 messages → blocks，收集所有 type === 'image' 的 block ID
 * 3. 并行调用 deleteImage 清理 IndexedDB 中的图片 blob
 * 4. 删除 Dexie 中的会话记录
 *
 * 使用 Promise.allSettled 确保图片删除失败不影响会话记录删除
 */
export async function deleteSession(id: string): Promise<void> {
  try {
    const session = await getDb().sessions.get(id)
    if (session?.messages) {
      const imageIds: string[] = []
      for (const msg of session.messages) {
        if (msg.blocks) {
          for (const block of msg.blocks) {
            if (block.type === 'image' && block.id) {
              imageIds.push(block.id)
            }
          }
        }
      }
      await Promise.allSettled(imageIds.map(imgId => deleteImage(imgId)))
    }
    await getDb().sessions.delete(id)
  } catch (err) {
    console.warn('[AgentDB] deleteSession failed:', err)
  }
}

/** 创建新会话，使用 crypto.randomUUID() 生成唯一 ID */
export async function createSession(providerMode: string, modelId: string): Promise<AgentSession> {
  const session: AgentSession = {
    id: crypto.randomUUID(),
    name: '新会话',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    providerMode: providerMode as any,
    modelId,
    messages: [],
    metadata: { totalTokens: 0, totalCost: 0, toolCallCount: 0 },
  }
  await saveSession(session)
  return session
}

/** 固定（收藏）会话，防止自动清理 */
export async function pinSession(id: string): Promise<void> {
  try {
    const session = await getDb().sessions.get(id)
    if (session) {
      session.pinned = true
      session.updatedAt = new Date().toISOString()
      await getDb().sessions.put(session)
    }
  } catch (err) {
    console.warn('[AgentDB] pinSession failed:', err)
  }
}

/** 取消固定会话 */
export async function unpinSession(id: string): Promise<void> {
  try {
    const session = await getDb().sessions.get(id)
    if (session) {
      session.pinned = false
      session.updatedAt = new Date().toISOString()
      await getDb().sessions.put(session)
    }
  } catch (err) {
    console.warn('[AgentDB] unpinSession failed:', err)
  }
}

/** 统计会话总数（用于会话上限控制） */
export async function countSessions(): Promise<number> {
  try {
    return await getDb().sessions.count()
  } catch {
    return 0
  }
}
