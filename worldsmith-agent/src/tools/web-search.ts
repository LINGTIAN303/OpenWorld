/**
 * 联网搜索工具
 *
 * 支持三种搜索引擎：Tavily、SerpAPI、Bing。
 * API Key 通过设置存储获取。搜索结果包含标题、URL 和最多 300 字符的摘要。
 */

import type { ToolDefinition } from '../bridge-types'

/**
 * web_search — 联网搜索
 * 自动根据设置中的 search engine 配置选择对应的 API 调用。
 * 支持的搜索引擎：tavily（默认）、serpapi、bing。
 */
export const webSearchTool: ToolDefinition = {
  name: 'web_search',
  description: '搜索互联网获取最新信息。返回搜索结果摘要列表（标题+摘要+URL）。使用场景：查找参考资料、历史事实、文化背景、灵感素材。如需深入了解某条结果，用 web_fetch 阅读全文。',
  parameters: {
    query: { type: 'string', description: '搜索查询关键词', required: true },
    max_results: { type: 'number', description: '返回结果数量上限，默认5', required: false },
  },
  execute: async (args, ctx) => {
    const query = String(args.query)
    const maxResults = Number(args.max_results) || 5

    const settings = ctx.stores.settings as any
    const searchConfig = settings?.getSearchConfig?.() || {}
    const engine = searchConfig.engine || 'tavily'
    const apiKey = searchConfig.apiKey || ''

    if (!apiKey) {
      return JSON.stringify({
        error: '未配置搜索 API Key',
        hint: '请在 AI 助手设置中配置搜索 API Key（支持 Tavily / SerpAPI / Bing）',
        query,
      })
    }

    try {
      if (engine === 'tavily') {
        return await searchTavily(query, maxResults, apiKey)
      }
      if (engine === 'serpapi') {
        return await searchSerpApi(query, maxResults, apiKey)
      }
      if (engine === 'bing') {
        return await searchBing(query, maxResults, apiKey)
      }
      return JSON.stringify({ error: `不支持的搜索引擎: ${engine}`, query })
    } catch (err: any) {
      return JSON.stringify({
        error: `搜索失败: ${err.message || String(err)}`,
        query,
      })
    }
  },
}

/** Tavily 搜索 API（POST 请求，支持 include_answer 额外结果） */
async function searchTavily(query: string, maxResults: number, apiKey: string): Promise<string> {
  const resp = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults,
      include_answer: true,
      search_depth: 'basic',
    }),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Tavily API ${resp.status}: ${text}`)
  }
  const data = await resp.json()
  const results = (data.results || []).map((r: any) => ({
    title: r.title,
    url: r.url,
    snippet: r.content?.slice(0, 300),
  }))
  return JSON.stringify({
    query,
    answer: data.answer || '',
    results,
  })
}

/** SerpAPI 搜索（GET 请求，api_key 为查询参数） */
async function searchSerpApi(query: string, maxResults: number, apiKey: string): Promise<string> {
  const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${apiKey}&num=${maxResults}`
  const resp = await fetch(url)
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`SerpAPI ${resp.status}: ${text}`)
  }
  const data = await resp.json()
  const results = (data.organic_results || []).map((r: any) => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet?.slice(0, 300),
  }))
  return JSON.stringify({ query, answer: data.answer_box?.snippet || '', results })
}

/** Bing 搜索 API（GET 请求，Ocp-Apim-Subscription-Key 头鉴权） */
async function searchBing(query: string, maxResults: number, apiKey: string): Promise<string> {
  const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=${maxResults}`
  const resp = await fetch(url, {
    headers: { 'Ocp-Apim-Subscription-Key': apiKey },
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Bing API ${resp.status}: ${text}`)
  }
  const data = await resp.json()
  const results = (data.webPages?.value || []).map((r: any) => ({
    title: r.name,
    url: r.url,
    snippet: r.snippet?.slice(0, 300),
  }))
  return JSON.stringify({ query, answer: '', results })
}

export const webSearchTools: ToolDefinition[] = [webSearchTool]
