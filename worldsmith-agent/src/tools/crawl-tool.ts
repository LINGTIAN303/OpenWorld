/**
 * 深度网页爬取工具
 *
 * 优先使用本地 Crawl4AI 后端服务（支持 JS 渲染、反检测、结构化提取），
 * 后端不可用时自动降级到 Jina Reader API。
 */

import type { ToolDefinition } from '../bridge-types'

/** Crawl4AI 后端服务地址 */
const CRAWL4AI_BACKEND = 'http://localhost:3100/api/crawl'

/** Jina Reader API 基础地址 */
const JINA_READER_BASE = 'https://r.jina.ai'

/**
 * web_crawl — 深度爬取网页内容
 * 比 web_fetch 更强大：支持 JS 渲染页面、反检测、提取结构化数据。
 * 优先调用本地 Crawl4AI 后端，失败后降级到 Jina Reader。
 */
export const crawlTool: ToolDefinition = {
  name: 'web_crawl',
  description:
    '深度爬取网页内容。比 web_fetch 更强大：支持 JS 渲染页面、反检测、提取结构化数据。使用场景：爬取维基百科/百科条目作为世界观素材、抓取需要登录或 JS 渲染的页面、批量采集参考资料。',
  parameters: {
    url: {
      type: 'string',
      description: '要爬取的网页 URL',
      required: true,
    },
    max_length: {
      type: 'number',
      description: '返回内容的最大字符数，默认8000',
      required: false,
    },
    output_format: {
      type: 'string',
      description: '输出格式: markdown(默认)/fit_markdown(去噪)/cleaned_html',
      required: false,
    },
  },
  execute: async (args, _ctx) => {
    const url = String(args.url)
    const maxLength = Number(args.max_length) || 8000
    const outputFormat = String(args.output_format || 'markdown')

    // 1. 校验 URL 格式
    if (!url.match(/^https?:\/\//i)) {
      return JSON.stringify({ error: 'URL 必须以 http:// 或 https:// 开头', url })
    }

    // 2. 尝试调用 Crawl4AI 后端
    try {
      const backendResp = await fetch(CRAWL4AI_BACKEND, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, max_length: maxLength, output_format: outputFormat }),
      })

      if (backendResp.ok) {
        const data = await backendResp.json()
        // 后端已处理截断和格式，直接返回
        return JSON.stringify({
          url,
          content: data.content ?? data.markdown ?? '',
          length: data.length ?? (data.content ?? data.markdown ?? '').length,
          truncated: data.truncated ?? false,
          format: outputFormat,
        })
      }
      // 后端返回非 2xx，降级到 Jina
    } catch {
      // 后端不可达（网络错误），降级到 Jina
    }

    // 3. 降级：使用 Jina Reader API
    try {
      const jinaUrl = `${JINA_READER_BASE}/${url}`
      const jinaResp = await fetch(jinaUrl, {
        method: 'GET',
        headers: {
          Accept: 'text/markdown',
          'X-Return-Format': 'markdown',
        },
      })

      if (!jinaResp.ok) {
        const errText = await jinaResp.text()
        return JSON.stringify({
          error: `Crawl4AI 后端不可用，Jina Reader 也失败 (${jinaResp.status}): ${errText.slice(0, 200)}`,
          url,
        })
      }

      const rawContent = await jinaResp.text()

      if (!rawContent || rawContent.trim().length === 0) {
        return JSON.stringify({ error: '网页内容为空或无法解析', url })
      }

      // 4. 截断到 max_length 并添加降级提示
      const truncated = rawContent.length > maxLength
      const content = truncated
        ? rawContent.slice(0, maxLength) + '\n\n...[内容已截断]'
        : rawContent

      return JSON.stringify({
        url,
        content,
        length: rawContent.length,
        truncated,
        format: 'markdown',
        note: 'Crawl4AI 后端不可用，已降级为 Jina Reader 模式（不支持 JS 渲染和反检测）',
      })
    } catch (err: any) {
      return JSON.stringify({
        error: `爬取网页失败: ${err.message || String(err)}`,
        url,
      })
    }
  },
}

export const crawlTools: ToolDefinition[] = [crawlTool]
