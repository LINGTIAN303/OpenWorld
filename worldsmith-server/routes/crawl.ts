// Crawl4AI 路由 — 将前端抓取请求转发至 Python 微服务
// 检查服务启用状态，未启用返回 503；转发失败返回 502

import { Router, type Request, type Response } from 'express'
import { PythonBridge } from '../python-bridge.js'

/**
 * 注册 Crawl4AI 相关路由
 * @param router Express 路由器实例
 * @param bridge Python 微服务桥接实例
 */
export function registerCrawlRoutes(router: Router, bridge: PythonBridge): void {
  /**
   * POST /api/crawl
   * 抓取指定 URL 的网页内容
   * 请求体: { url: string, max_length?: number, output_format?: string }
   */
  router.post('/api/crawl', async (req: Request, res: Response) => {
    // 检查 crawl4ai 服务是否启用
    if (!bridge.isServiceEnabled('crawl4ai')) {
      res.status(503).json({ error: 'Crawl4AI 服务未启用' })
      return
    }

    try {
      const result = await bridge.request('crawl4ai', '/crawl', req.body)
      res.json(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      res.status(502).json({ error: `Crawl4AI 服务请求失败: ${message}` })
    }
  })
}
