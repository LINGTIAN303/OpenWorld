/**
 * API Key 加密存储模块
 *
 * 使用 Web Crypto API (AES-GCM) 对 API Key 进行加密后存入 localStorage。
 * 加密密钥派生自设备指纹（userAgent + hostname），因此密钥在不同设备/域名下无法解密。
 *
 * 存储格式: localStorage key = "worldsmith_ak_{provider}", value = Base64(iv || ciphertext)
 *
 * 使用流程:
 *   storeApiKey('openai', 'sk-xxx') → 加密 → localStorage
 *   loadApiKey('openai') → localStorage 读取 → 解密 → 返回明文
 */

/** localStorage 键名前缀，用于区分 API Key 和其他存储数据 */
const STORAGE_PREFIX = 'worldsmith_ak_'

/**
 * 派生加密密钥
 * 基于设备指纹（userAgent + hostname）通过 SHA-256 哈希生成 256 位 AES-GCM 密钥
 * 这确保了密钥在同一设备同域下可解密，更换设备/域名后无法解密
 */
async function getDeviceKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyMaterial = encoder.encode(navigator.userAgent + location.hostname + 'worldsmith-key-v1')
  const hash = await crypto.subtle.digest('SHA-256', keyMaterial)
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

/**
 * 使用 AES-GCM 加密文本
 * 每次加密使用随机 12 字节 IV，IV 拼接在密文前一同 Base64 编码
 * 返回格式: Base64(IV[12 bytes] || ciphertext)
 */
async function encrypt(text: string): Promise<string> {
  const key = await getDeviceKey()
  const encoder = new TextEncoder()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(text))
  const combined = new Uint8Array(iv.length + encrypted.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(encrypted), iv.length)
  return btoa(String.fromCharCode(...combined))
}

/**
 * 解密 Base64 编码的密文
 * 从开头提取 12 字节 IV，剩余部分为密文，使用 AES-GCM 解密
 */
async function decrypt(encoded: string): Promise<string> {
  const key = await getDeviceKey()
  const combined = Uint8Array.from(atob(encoded), c => c.charCodeAt(0))
  const iv = combined.slice(0, 12)
  const data = combined.slice(12)
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  return new TextDecoder().decode(decrypted)
}

/**
 * 加密并存储 API Key
 * @param provider 供应商名称，如 'openai'、'custom:api.example.com'
 * @param key 明文的 API Key
 */
export async function storeApiKey(provider: string, key: string): Promise<void> {
  const encrypted = await encrypt(key)
  localStorage.setItem(STORAGE_PREFIX + provider, encrypted)
}

/**
 * 加载并解密 API Key
 * @param provider 供应商名称
 * @returns 解密的 API Key，未找到或解密失败返回空字符串
 */
export async function loadApiKey(provider: string): Promise<string> {
  const raw = localStorage.getItem(STORAGE_PREFIX + provider)
  if (!raw) return ''
  try {
    return await decrypt(raw)
  } catch {
    return ''
  }
}

/** 删除指定供应商的 API Key */
export function removeApiKey(provider: string): void {
  localStorage.removeItem(STORAGE_PREFIX + provider)
}

/** 检查指定供应商是否已存储 API Key（仅检查是否存在，不解密） */
export function hasApiKey(provider: string): boolean {
  return !!localStorage.getItem(STORAGE_PREFIX + provider)
}
