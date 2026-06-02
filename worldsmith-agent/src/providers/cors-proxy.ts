/**
 * CORS 跨域代理工具
 *
 * 在 Vite 开发模式下，将供应商 API 请求代理到本地 dev server 的路由，
 * 避免浏览器 CORS 限制。生产模式下直接使用原始 URL。
 *
 * 代理映射:
 *   anthropic → /api/anthropic
 *   openai    → /api/openai
 *   google    → /api/google
 */

/** Vite 开发模式下的代理路径映射 */
const VITE_PROXY_MAP: Record<string, string> = {
  anthropic: '/api/anthropic',
  openai: '/api/openai',
  google: '/api/google',
}

/**
 * 根据供应商和原始 URL 解析最终的代理路径
 *
 * 规则：
 * - 非浏览器环境：直接返回原始 URL
 * - localhost / 127.0.0.1 / 0.0.0.0：直接返回（本地服务无需代理）
 * - Vite 开发模式 + 已配置供应商：返回代理路径
 * - 其他情况：返回原始 URL（生产环境由反向代理处理）
 *
 * @param baseUrl 供应商原始 API URL
 * @param provider 供应商标识
 * @returns 解析后的 URL 或代理路径
 */
export function proxyUrl(baseUrl: string, provider: string): string {
  if (typeof window === 'undefined') return baseUrl
  const localPrefixes = ['http://localhost', 'http://127.0.0.1', 'http://0.0.0.0']
  if (localPrefixes.some(p => baseUrl.startsWith(p))) return baseUrl
  const proxyPath = VITE_PROXY_MAP[provider]
  if (proxyPath && typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV) return proxyPath
  return baseUrl
}
