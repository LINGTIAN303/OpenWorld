// 文件转换路由 — 将文档通过 MarkItDown 微服务转为 Markdown
// 代理前端请求至 Python markitdown 服务

import { Router, type Request, type Response } from 'express'
import { PythonBridge } from '../python-bridge.js'

/**
 * 注册文件转换相关路由
 * @param router Express 路由实例
 * @param bridge Python 微服务桥接实例
 */
export function registerConvertRoutes(router: Router, bridge: PythonBridge): void {
  /**
   * POST /api/convert
   * 接收文件名和 base64 编码的文件内容，转发至 MarkItDown 微服务进行转换
   */
  router.post('/api/convert', async (req: Request, res: Response) => {
    // 检查 markitdown 服务是否启用
    if (!bridge.isServiceEnabled('markitdown')) {
      res.status(503).json({ error: 'markitdown 服务未启用' })
      return
    }

    const { filename, content_base64 } = req.body ?? {}

    // 校验必填字段
    if (!filename || typeof filename !== 'string') {
      res.status(400).json({ error: '缺少 filename 字段' })
      return
    }
    if (!content_base64 || typeof content_base64 !== 'string') {
      res.status(400).json({ error: '缺少 content_base64 字段' })
      return
    }

    // 转发请求至 Python 微服务
    try {
      const result = await bridge.request('markitdown', '/convert', {
        filename,
        content_base64,
      })
      res.json(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      res.status(502).json({ error: `markitdown 服务调用失败: ${message}` })
    }
  })
}
