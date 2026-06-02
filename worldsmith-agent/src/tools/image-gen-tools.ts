import type { ToolDefinition } from '../bridge-types'
import type { IToolContext } from '../toolbus/types'
import { loadApiKey } from '../providers/key-store'
import { persistImage, srcToBlob, getAllImages, getImage, blobToDataUrl, getImagesByPathPrefix } from '../stores/image-persistence'

/** 图像生成请求超时时间 (180 秒 = 3 分钟) */
const IMAGE_GEN_TIMEOUT = 180_000

/** 图像生成的虚拟存储根目录，Agent 通过此路径告知用户图片位置 */
const IMAGE_DIR = '/images/generated'

/**
 * 各供应商的内置代理路径映射
 * 键为供应商标识，值为 Vite 代理路径前缀
 */
const PROVIDER_BASE_URLS: Record<string, string> = {
  anthropic: '/api/anthropic',
  openai: '/api/openai/v1',
  google: '/api/google',
  deepseek: '/api/deepseek',
  groq: '/api/groq/openai/v1',
  openrouter: '/api/openrouter/api/v1',
  zhipu: '/api/zhipu/api/paas/v4',
  qwen: '/api/qwen/compatible-mode/v1',
  minimax: '/api/minimax/v1',
  kimi: '/api/kimi/v1',
}

/** DALL-E 模型名称列表，用于判断是否需要发送 DALL-E 专属参数 */
const DALLE_MODELS = ['dall-e-2', 'dall-e-3']

/** localStorage 键名常量，用于存储图像生成配置 */
const IMAGE_GEN_PROVIDER_KEY = 'worldsmith_image_gen_provider'
const IMAGE_GEN_MODEL_KEY = 'worldsmith_image_gen_model'
const IMAGE_GEN_BASE_URL_KEY = 'worldsmith_image_gen_base_url'
const IMAGE_GEN_API_KEY_KEY = 'worldsmith_image_gen_api_key'

/** 获取当前浏览器源的根 URL，用于拼接绝对路径的 API 请求 */
function getOrigin(): string {
  return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'
}

/**
 * 从 localStorage 读取图像生成配置（供应商 + 模型 + 自定义 Base URL）
 * @returns 配置对象，未配置时返回 null
 */
function getImageGenConfig(): { provider: string; modelId: string; baseUrl?: string } | null {
  const provider = localStorage.getItem(IMAGE_GEN_PROVIDER_KEY) || ''
  const modelId = localStorage.getItem(IMAGE_GEN_MODEL_KEY) || ''
  const baseUrl = localStorage.getItem(IMAGE_GEN_BASE_URL_KEY) || ''
  if (provider && modelId) return { provider, modelId, baseUrl: baseUrl || undefined }
  return null
}

/**
 * 获取图像生成 API Key，采用三级查找策略：
 * 1. 优先使用图像生成专用 API Key（设置面板独立配置）
 * 2. 若为 custom 供应商，尝试用自定义 hostname 查找 key-store
 * 3. 最后用供应商名查找 key-store（与主聊天共享）
 *
 * @param provider 图像生成供应商名称
 * @param customBaseUrl 自定义供应商的 Base URL
 * @returns 找到的 API Key 字符串，未找到返回空字符串
 */
async function getImageGenApiKey(provider: string, customBaseUrl?: string): Promise<string> {
  const dedicatedKey = localStorage.getItem(IMAGE_GEN_API_KEY_KEY)
  if (dedicatedKey) return dedicatedKey

  if (provider === 'custom' && customBaseUrl) {
    try {
      const url = new URL(customBaseUrl)
      const storeId = 'custom:' + url.hostname
      const key = await loadApiKey(storeId)
      if (key) return key
    } catch {}
  }

  const key = await loadApiKey(provider)
  return key || ''
}

/**
 * 解析图像生成 API 的最终请求 URL
 *
 * 自定义供应商：构造 /api/custom-proxy 代理路径，通过 X-Target-Base-Url 头传递目标
 * 内置供应商：拼接内置代理路径 + /images/generations
 *
 * @returns 包含 url（绝对路径）和 proxyHeaders 的对象，不支持的供应商返回 null
 */
function resolveApiUrl(provider: string, customBaseUrl?: string): { url: string; proxyHeaders: Record<string, string> } | null {
  if (customBaseUrl && /^https?:\/\//.test(customBaseUrl)) {
    try {
      const parsed = new URL(customBaseUrl)
      let basePath = parsed.pathname.replace(/\/+$/, '')
      if (!basePath) basePath = '/v1'
      const proxyPath = `/api/custom-proxy${basePath}/images/generations`
      return {
        url: `${getOrigin()}${proxyPath}`,
        proxyHeaders: { 'X-Target-Base-Url': `${parsed.protocol}//${parsed.host}` },
      }
    } catch {
      return null
    }
  }

  const base = PROVIDER_BASE_URLS[provider]
  if (!base) return null

  return {
    url: `${getOrigin()}${base}/images/generations`,
    proxyHeaders: {},
  }
}

/**
 * 构建图片的虚拟存储路径
 * 格式: /images/generated/{YYYY-MM-DD}/{sanitized-caption}-{blockId}.png
 * 按日期分组，文件名综合用户提供的标题和系统生成的 blockId
 */
function buildImagePath(blockId: string, caption?: string): string {
  const date = new Date()
  const dateDir = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const safeName = (caption || 'untitled').replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, '_').slice(0, 40)
  return `${IMAGE_DIR}/${dateDir}/${safeName}-${blockId}.png`
}

/**
 * image_generate 工具
 *
 * 调用 AI 图像生成 API 创建图片。支持任何兼容 OpenAI images/generations 格式的 API。
 * 生成成功后自动通过 appendBlock 展示图片，同时异步持久化到 IndexedDB。
 * DALL-E 模型会额外发送 quality、style、response_format 等专属参数。
 */
const imageGenerateTool: ToolDefinition = {
  name: 'image_generate',
  description: '使用 AI 图像生成模型创建图片。支持 DALL-E、Stability AI 等兼容 OpenAI images/generations 格式的 API。生成成功后自动展示图片并持久化存储。可指定尺寸、数量和风格。',
  parameters: {
    prompt: {
      type: 'string',
      description: '图像生成的文本描述，越详细越好。例如："一座矗立在悬崖上的哥特式城堡，暴风雨的天空，闪电照亮塔楼，奇幻风格"',
      required: true,
    },
    size: {
      type: 'string',
      description: '图片尺寸。可选值: 256x256, 512x512, 1024x1024, 1024x1792, 1792x1024。默认 1024x1024',
      required: false,
    },
    n: {
      type: 'number',
      description: '生成图片数量，1-4。默认 1',
      required: false,
    },
    quality: {
      type: 'string',
      description: '图片质量。可选值: standard, hd。hd 仅 DALL-E 3 支持。默认 standard',
      required: false,
    },
    style: {
      type: 'string',
      description: '图片风格。可选值: vivid, natural。仅 DALL-E 3 支持。默认 vivid',
      required: false,
    },
    caption: {
      type: 'string',
      description: '图片说明文字，展示在图片下方',
      required: false,
    },
  },
  execute: async (args: Record<string, unknown>, ctx: IToolContext): Promise<string> => {
    const prompt = String(args.prompt)
    if (!prompt.trim()) {
      return JSON.stringify({ ok: false, error: 'prompt 不能为空' })
    }

    const config = getImageGenConfig()
    if (!config) {
      return JSON.stringify({
        ok: false,
        error: '图像生成未配置。请在设置面板中配置图像生成供应商和模型（如 DALL-E 3、Stability AI 等）。',
      })
    }

    const apiKey = await getImageGenApiKey(config.provider, config.baseUrl)
    if (!apiKey) {
      return JSON.stringify({
        ok: false,
        error: `图像生成供应商 ${config.provider} 未配置 API Key。请在设置面板的"绘图"子面板中填入 API Key。`,
      })
    }

    const resolved = resolveApiUrl(config.provider, config.baseUrl)
    if (!resolved) {
      return JSON.stringify({
        ok: false,
        error: `不支持的图像生成供应商: ${config.provider}`,
      })
    }

    const isDalle = DALLE_MODELS.includes(config.modelId)

    const validSizes = ['256x256', '512x512', '1024x1024', '1024x1792', '1792x1024']
    const size = validSizes.includes(args.size as string) ? String(args.size) : '1024x1024'
    const n = Math.max(1, Math.min(4, Number(args.n) || 1))

    const body: Record<string, unknown> = {
      model: config.modelId,
      prompt,
      size,
      n,
    }

    // DALL-E 专属参数：仅对 DALL-E 模型发送，避免其他供应商报错
    if (isDalle) {
      body.quality = args.quality === 'hd' ? 'hd' : 'standard'
      if (config.modelId === 'dall-e-3') {
        body.style = args.style === 'natural' ? 'natural' : 'vivid'
      }
      body.response_format = 'b64_json'
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), IMAGE_GEN_TIMEOUT)

    try {
      const resp = await fetch(resolved.url, {
        method: 'POST',
        headers: { ...headers, ...resolved.proxyHeaders },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '')
        return JSON.stringify({
          ok: false,
          error: `图像生成 API 返回 ${resp.status}: ${errText.slice(0, 500)}`,
        })
      }

      const json = await resp.json()
      const images: Array<{ url?: string; b64_json?: string; revised_prompt?: string }> = json?.data || []

      if (images.length === 0) {
        return JSON.stringify({ ok: false, error: 'API 未返回图片数据' })
      }

      const results: Array<{ id: string; path: string; revisedPrompt?: string }> = []

      for (const img of images) {
        let src: string
        if (img.b64_json) {
          src = `data:image/png;base64,${img.b64_json}`
        } else if (img.url) {
          src = img.url
        } else {
          continue
        }

        const blockId = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const caption = args.caption ? String(args.caption) : undefined
        const imagePath = buildImagePath(blockId, caption)

        ctx.appendBlock?.({
          type: 'image',
          id: blockId,
          src,
          caption,
          collapsible: true,
        })

        // 异步持久化到 IndexedDB，不阻塞生成流程
        srcToBlob(src).then(blob => {
          persistImage({
            id: blockId,
            path: imagePath,
            blob,
            prompt,
            model: config.modelId,
            provider: config.provider,
            size,
            createdAt: Date.now(),
            caption,
          }).catch(() => {})
        }).catch(() => {})

        results.push({
          id: blockId,
          path: imagePath,
          revisedPrompt: img.revised_prompt,
        })
      }

      return JSON.stringify({
        ok: true,
        count: results.length,
        directory: IMAGE_DIR,
        images: results,
        message: `已生成 ${results.length} 张图片，图片会自动显示在消息中。所有图片已持久化存储在 ${IMAGE_DIR} 目录，可通过 image_list 查看历史图片，通过 image_show 重新展示。`,
      })
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return JSON.stringify({ ok: false, error: '图像生成请求超时（3分钟），请稍后重试或使用更小的尺寸。' })
      }
      return JSON.stringify({
        ok: false,
        error: `图像生成失败: ${err instanceof Error ? err.message : String(err)}`,
      })
    } finally {
      clearTimeout(timeout)
    }
  },
}

/**
 * image_gen_config 工具
 *
 * 查看当前图像生成配置状态，包括供应商、模型、API Key 是否已配置、存储目录等。
 * Agent 可在不确定配置状态时调用此工具确认。
 */
const imageGenConfigTool: ToolDefinition = {
  name: 'image_gen_config',
  description: '查看当前图像生成配置信息和图片存储目录。当需要确认图像生成是否已配置或查看图片存储位置时使用此工具。',
  parameters: {},
  execute: async (_args: Record<string, unknown>, _ctx: IToolContext): Promise<string> => {
    const config = getImageGenConfig()
    if (!config) {
      return JSON.stringify({
        ok: true,
        configured: false,
        directory: IMAGE_DIR,
        hint: '图像生成未配置。请在设置面板中配置图像生成供应商和模型。',
      })
    }

    const hasKey = !!(await getImageGenApiKey(config.provider, config.baseUrl))

    return JSON.stringify({
      ok: true,
      configured: true,
      provider: config.provider,
      modelId: config.modelId,
      baseUrl: config.baseUrl || '(使用内置代理)',
      hasApiKey: hasKey,
      directory: IMAGE_DIR,
      hint: `生成的图片存储在 ${IMAGE_DIR} 目录下，按日期分组。使用 image_list 查看所有图片，使用 image_show 按 ID 重新展示图片。`,
    })
  },
}

/**
 * image_list 工具
 *
 * 列出所有已生成的图片信息（ID、路径、提示词、模型、时间）。
 * 支持按路径前缀筛选（例如按日期目录），支持 limit 限制返回数量。
 * 返回的列表按创建时间倒序排列。
 */
const imageListTool: ToolDefinition = {
  name: 'image_list',
  description: '列出所有已生成的图片。返回图片 ID、路径、提示词、模型、创建时间等信息。可按路径前缀筛选。当用户询问之前生成过哪些图片、图片存在哪里时使用此工具。',
  parameters: {
    path_prefix: {
      type: 'string',
      description: '按路径前缀筛选，如 "/images/generated/2026-05-28"。留空则列出所有图片',
      required: false,
    },
    limit: {
      type: 'number',
      description: '最多返回的图片数量，默认 20',
      required: false,
    },
  },
  execute: async (args: Record<string, unknown>, _ctx: IToolContext): Promise<string> => {
    const pathPrefix = String(args.path_prefix || '').trim()
    const limit = Math.max(1, Math.min(100, Number(args.limit) || 20))

    let images: Array<{ id: string; path: string; prompt: string; model: string; provider: string; size: string; createdAt: number; caption?: string }>

    if (pathPrefix) {
      const persisted = await getImagesByPathPrefix(pathPrefix)
      images = persisted.map(img => ({
        id: img.id,
        path: img.path,
        prompt: img.prompt,
        model: img.model,
        provider: img.provider,
        size: img.size,
        createdAt: img.createdAt,
        caption: img.caption,
      }))
    } else {
      const persisted = await getAllImages()
      images = persisted.map(img => ({
        id: img.id,
        path: img.path,
        prompt: img.prompt,
        model: img.model,
        provider: img.provider,
        size: img.size,
        createdAt: img.createdAt,
        caption: img.caption,
      }))
    }

    images.sort((a, b) => b.createdAt - a.createdAt)
    const total = images.length
    images = images.slice(0, limit)

    return JSON.stringify({
      ok: true,
      total,
      showing: images.length,
      directory: IMAGE_DIR,
      images: images.map(img => ({
        id: img.id,
        path: img.path,
        prompt: img.prompt.slice(0, 100) + (img.prompt.length > 100 ? '...' : ''),
        model: img.model,
        size: img.size,
        createdAt: new Date(img.createdAt).toISOString(),
        caption: img.caption,
      })),
      hint: '使用 image_show 工具并传入图片 ID 可重新展示图片。',
    })
  },
}

/**
 * image_show 工具
 *
 * 根据图片 ID 从 IndexedDB 取出 Blob 并重新展示在消息中。
 * 使用 blobToDataUrl 转换 Blob 为 Data URL（而非 Object URL），确保刷新后图片仍然可用。
 * 跨会话可用——即使当前会话中未生成该图片，只要 IndexedDB 中有记录即可展示。
 */
const imageShowTool: ToolDefinition = {
  name: 'image_show',
  description: '重新展示已存储的图片。当用户要求查看之前生成的图片、重新展示某张图片时使用此工具。通过 image_list 获取图片 ID。',
  parameters: {
    image_id: {
      type: 'string',
      description: '要展示的图片 ID，从 image_list 获取',
      required: true,
    },
  },
  execute: async (args: Record<string, unknown>, ctx: IToolContext): Promise<string> => {
    const imageId = String(args.image_id).trim()
    if (!imageId) {
      return JSON.stringify({ ok: false, error: '请提供图片 ID' })
    }

    const persisted = await getImage(imageId)
    if (!persisted) {
      return JSON.stringify({ ok: false, error: `未找到图片: ${imageId}。请使用 image_list 查看可用图片。` })
    }

    const src = await blobToDataUrl(persisted.blob)

    ctx.appendBlock?.({
      type: 'image',
      id: persisted.id,
      src,
      caption: persisted.caption,
      collapsible: true,
    })

    return JSON.stringify({
      ok: true,
      id: persisted.id,
      path: persisted.path,
      prompt: persisted.prompt,
      model: persisted.model,
      size: persisted.size,
      createdAt: new Date(persisted.createdAt).toISOString(),
      caption: persisted.caption,
      message: `图片已重新展示。路径: ${persisted.path}`,
    })
  },
}

/** 图像生成工具集：生成、配置查询、列表、重新展示 */
export const imageGenTools = [imageGenerateTool, imageGenConfigTool, imageListTool, imageShowTool]
