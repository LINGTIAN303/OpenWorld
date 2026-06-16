/**
 * 网页抓取工具
 *
 * 通过 Jina Reader API (r.jina.ai) 将任意网页转换为干净的 Markdown 文本。
 * 适用于深入阅读搜索结果中的网页内容。
 */

import type { ToolDefinition } from '../bridge-types'
import type { ToolMeta } from '@worldsmith/agent-core'
import { smartFetch } from '../utils/smart-fetch'

/**
 * web_fetch — 抓取网页内容
 * 使用 Jina Reader API，返回纯 Markdown 格式的网页正文。
 * 支持 max_length 参数控制返回内容的字符数（默认 8000）。
 */
export const webFetchTool: ToolDefinition = {
  name: 'web_fetch',
  description: '抓取指定 URL 的网页全文内容并转为纯文本。使用场景：深入阅读 web_search 结果中的网页、获取特定网页的详细内容。注意：URL 必须是完整的 http/https 地址。对于长文章会截断到合理长度。',
  parameters: {
    url: { type: 'string', description: '要读取的网页 URL', required: true },
    max_length: { type: 'number', description: '返回内容的最大字符数，默认8000', required: false },
  },
  meta: {
    permission: 'safe',
    category: 'search',
    alwaysAvailable: true,
    displayName: '网页抓取',
  } satisfies ToolMeta,
  execute: async (args, _ctx) => {
    const url = String(args.url)
    const maxLength = Number(args.max_length) || 8000

    if (!url.match(/^https?:\/\//i)) {
      return JSON.stringify({ error: 'URL 必须以 http:// 或 https:// 开头', url })
    }

    try {
      const jinaUrl = `https://r.jina.ai/${url}`
      const resp = await smartFetch(jinaUrl, {
        method: 'GET',
        headers: {
          'Accept': 'text/markdown',
          'X-Return-Format': 'markdown',
        },
      })

      if (!resp.ok) {
        const text = await resp.text()
        throw new Error(`Jina Reader API ${resp.status}: ${text.slice(0, 200)}`)
      }

      const content = await resp.text()

      if (!content || content.trim().length === 0) {
        return JSON.stringify({ error: '网页内容为空或无法解析', url })
      }

      const trimmed = content.length > maxLength
        ? content.slice(0, maxLength) + '\n\n...[内容已截断]'
        : content

      return JSON.stringify({
        url,
        content: trimmed,
        length: content.length,
        truncated: content.length > maxLength,
      })
    } catch (err: any) {
      return JSON.stringify({
        error: `读取网页失败: ${err.message || String(err)}`,
        url,
      })
    }
  },
}

export const webFetchTools: ToolDefinition[] = [webFetchTool]
