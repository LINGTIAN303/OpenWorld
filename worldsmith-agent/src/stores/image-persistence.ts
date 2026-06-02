/**
 * 图像持久化存储模块
 * 基于 IndexedDB 实现，用于存储通过 AI 生成的图片 Blob 数据
 *
 * 数据库: worldsmith_images (v2)
 * 对象仓库: images (keyPath: id)
 * 索引: createdAt, provider, path
 *
 * 虚拟路径格式: /images/generated/{date}/{caption}-{blockId}.png
 * 存储路径让 Agent 知道图片的"目录位置"，便于跨会话查找
 */

const DB_NAME = 'worldsmith_images'
const DB_VERSION = 2
const STORE_NAME = 'images'

/** 持久化存储的图片记录 */
export interface PersistedImage {
  /** 唯一标识，与 appendBlock 的 blockId 对应 */
  id: string
  /** 虚拟文件路径，例如 /images/generated/2026-05-28/castle-img-a3k9x2.png */
  path: string
  /** 图片二进制数据 */
  blob: Blob
  /** 生成图片时使用的提示词 */
  prompt: string
  /** 图像生成模型 ID，例如 dall-e-3 */
  model: string
  /** 图像生成供应商，例如 openai / custom */
  provider: string
  /** 图片尺寸，例如 1024x1024 */
  size: string
  /** 创建时间戳 (ms) */
  createdAt: number
  /** 图片说明文字 (可选) */
  caption?: string
}

/**
 * 打开 IndexedDB 数据库连接
 * 自动处理数据库升级：v1→v2 时为新数据库添加 path 索引；已存在的数据库补充添加 path 索引
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt', { unique: false })
        store.createIndex('provider', 'provider', { unique: false })
        store.createIndex('path', 'path', { unique: false })
      } else {
        const tx = req.transaction
        if (tx) {
          const store = tx.objectStore(STORE_NAME)
          if (!store.indexNames.contains('path')) {
            store.createIndex('path', 'path', { unique: false })
          }
        }
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/**
 * 存储或更新一张图片到 IndexedDB
 * 如果 id 已存在则覆盖（同一个 block 重新生成时）
 */
export async function persistImage(image: PersistedImage): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.put(image)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

/** 根据图片 ID 获取单张图片记录 */
export async function getImage(id: string): Promise<PersistedImage | undefined> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req = store.get(id)
    req.onsuccess = () => { db.close(); resolve(req.result ?? undefined) }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

/**
 * 按虚拟路径前缀查询图片
 * 使用 IDBKeyRange.bound 进行前缀匹配，例如查询 /images/generated/2026-05-28 下所有图片
 * \uffff 是 Unicode 最大字符，确保 bound 范围覆盖所有以该前缀开头的 key
 */
export async function getImagesByPathPrefix(prefix: string): Promise<PersistedImage[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const index = store.index('path')
    const range = IDBKeyRange.bound(prefix, prefix + '\uffff')
    const req = index.getAll(range)
    req.onsuccess = () => { db.close(); resolve(req.result ?? []) }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

/** 获取所有已存储的图片，按创建时间排序（由 createdAt 索引保证顺序） */
export async function getAllImages(): Promise<PersistedImage[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const index = store.index('createdAt')
    const req = index.getAll()
    req.onsuccess = () => { db.close(); resolve(req.result ?? []) }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

/** 根据图片 ID 删除单张图片 */
export async function deleteImage(id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.delete(id)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

/**
 * 按路径前缀批量删除图片
 * 使用游标遍历匹配记录并逐个删除
 * @returns 实际删除的图片数量
 */
export async function deleteImagesByPrefix(prefix: string): Promise<number> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const index = store.index('path')
    const range = IDBKeyRange.bound(prefix, prefix + '\uffff')
    const req = index.openCursor(range)
    let count = 0
    req.onsuccess = () => {
      const cursor = req.result
      if (cursor) {
        cursor.delete()
        count++
        cursor.continue()
      }
    }
    tx.oncomplete = () => { db.close(); resolve(count) }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

/** 获取已存储的图片总数 */
export async function getImageCount(): Promise<number> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req = store.count()
    req.onsuccess = () => { db.close(); resolve(req.result) }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

/**
 * 将图片 URL 或 Data URL 下载并转换为 Blob 对象
 * 用于异步持久化：先展示图片，再后台获取 blob 存储
 */
export function srcToBlob(src: string): Promise<Blob> {
  return fetch(src).then(r => r.blob())
}

/**
 * 触发浏览器下载 Blob 数据为文件
 * 创建临时 <a> 标签触发下载，下载完成后清理 Object URL 防止内存泄漏
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * 将 Blob 转换为 Base64 Data URL 字符串
 * 相比 Object URL，Data URL 刷新后仍有效且不会造成内存泄漏
 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
