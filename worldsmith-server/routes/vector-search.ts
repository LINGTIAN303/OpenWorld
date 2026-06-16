/**
 * 向量检索路由 — 转发请求至 TurboVec Python 微服务
 * 提供 /api/vector/add、/api/vector/search、/api/vector/delete 三个端点
 */

import { Router, type Request, type Response } from 'express'
import { PythonBridge } from '../python-bridge.js'

/**
 * 注册向量检索相关路由
 * @param router Express Router 实例
 * @param bridge PythonBridge 实例，用于与 TurboVec 微服务通信
 */
export function registerVectorSearchRoutes(router: Router, bridge: PythonBridge): void {
  // 添加向量
  router.post('/api/vector/add', async (req: Request, res: Response) => {
    if (!bridge.isServiceEnabled('turbovec')) {
      res.status(503).json({ error: '向量检索服务未启用' })
      return
    }
    try {
      const result = await bridge.request('turbovec', '/add', req.body)
      res.json(result)
    } catch (err) {
      res.status(502).json({
        error: '向量检索服务请求失败',
        detail: err instanceof Error ? err.message : String(err),
      })
    }
  })

  // 搜索向量
  router.post('/api/vector/search', async (req: Request, res: Response) => {
    if (!bridge.isServiceEnabled('turbovec')) {
      res.status(503).json({ error: '向量检索服务未启用' })
      return
    }
    try {
      const result = await bridge.request('turbovec', '/search', req.body)
      res.json(result)
    } catch (err) {
      res.status(502).json({
        error: '向量检索服务请求失败',
        detail: err instanceof Error ? err.message : String(err),
      })
    }
  })

  // 删除向量
  router.post('/api/vector/delete', async (req: Request, res: Response) => {
    if (!bridge.isServiceEnabled('turbovec')) {
      res.status(503).json({ error: '向量检索服务未启用' })
      return
    }
    try {
      const result = await bridge.request('turbovec', '/delete', req.body)
      res.json(result)
    } catch (err) {
      res.status(502).json({
        error: '向量检索服务请求失败',
        detail: err instanceof Error ? err.message : String(err),
      })
    }
  })
}
