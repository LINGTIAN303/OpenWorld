/**
 * 爬取→解析→索引 流水线
 *
 * 编排完整的内容采集流程：
 * 1. crawl  — 调用 Crawl4AI 后端爬取网页
 * 2. kb_save — 将爬取内容保存到知识库（可选）
 * 3. vector_index — 将内容索引到向量库（可选）
 */

import { indexEntity, isEmbeddingReady } from '../embedding/index'
import { kbWrite } from '../kb/kb-store'
import type { EntityLike } from '../tools/types'

// ─── 接口定义 ────────────────────────────────────────────────────────────

/** 单个流水线步骤的执行结果 */
export interface PipelineStepResult {
  step: string
  success: boolean
  data?: any
  error?: string
}

/** 爬取流水线的配置选项 */
export interface CrawlPipelineOptions {
  /** 要爬取的网页 URL */
  url: string
  /** 返回内容的最大字符数，默认 8000 */
  maxLength?: number
  /** 输出格式: markdown(默认) / fit_markdown / cleaned_html */
  outputFormat?: string
  /** 是否自动索引到向量库，默认 true */
  autoIndex?: boolean
  /** 是否保存到知识库，默认 true */
  saveToKB?: boolean
  /** 知识库路径，默认自动生成 ref/{hostname}/{timestamp} */
  kbPath?: string
  /** 知识库作用域，默认 'project' */
  kbScope?: 'global' | 'project'
}

// ─── 常量 ────────────────────────────────────────────────────────────────

/** Crawl4AI 后端服务地址 */
const CRAWL4AI_BACKEND = 'http://localhost:3100/api/crawl'

// ─── 辅助函数 ────────────────────────────────────────────────────────────

/** 从 URL 中提取主机名，用于标签和路径生成 */
function extractHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    // URL 解析失败时，用简单方式提取
    const match = url.match(/^(?:https?:\/\/)?([^/]+)/)
    return match ? match[1].replace(/^www\./, '') : 'unknown'
  }
}

/** 生成时间戳字符串，用于唯一标识 */
function generateTimestamp(): string {
  return Date.now().toString(36)
}

// ─── 主流程 ──────────────────────────────────────────────────────────────

/**
 * 执行爬取→解析→索引流水线
 *
 * 按顺序执行三个步骤，每步结果记录到 PipelineStepResult 数组中。
 * 如果爬取步骤失败，后续步骤不会执行，直接返回已有结果。
 *
 * @param options 流水线配置
 * @returns 每个步骤的执行结果数组
 */
export async function executeCrawlPipeline(
  options: CrawlPipelineOptions,
): Promise<PipelineStepResult[]> {
  const results: PipelineStepResult[] = []

  const {
    url,
    maxLength = 8000,
    outputFormat = 'markdown',
    autoIndex = true,
    saveToKB = true,
    kbPath,
    kbScope = 'project',
  } = options

  // ── 步骤 1：爬取 ──────────────────────────────────────────────────

  let markdown = ''

  try {
    const resp = await fetch(CRAWL4AI_BACKEND, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        max_length: maxLength,
        output_format: outputFormat,
      }),
    })

    if (!resp.ok) {
      // 后端返回非 2xx 状态码
      const errorText = await resp.text().catch(() => '')
      results.push({
        step: 'crawl',
        success: false,
        error: `Crawl4AI 返回错误 (${resp.status}): ${errorText.slice(0, 200)}`,
      })
      return results
    }

    const data = await resp.json()
    markdown = data.content ?? data.markdown ?? ''

    if (!markdown || markdown.trim().length === 0) {
      results.push({
        step: 'crawl',
        success: false,
        error: '爬取到的内容为空',
      })
      return results
    }

    results.push({
      step: 'crawl',
      success: true,
      data: {
        url,
        contentLength: markdown.length,
        truncated: data.truncated ?? false,
        format: outputFormat,
      },
    })
  } catch (err) {
    // 网络错误或后端不可达
    results.push({
      step: 'crawl',
      success: false,
      error: `Crawl4AI 后端不可达: ${err instanceof Error ? err.message : String(err)}`,
    })
    return results
  }

  // ── 步骤 2：保存到知识库 ──────────────────────────────────────────

  const hostname = extractHostname(url)
  const timestamp = generateTimestamp()

  if (saveToKB) {
    try {
      // 默认路径格式：ref/{hostname}/{timestamp}
      const resolvedKbPath = kbPath || `ref/${hostname}/${timestamp}`

      // 生成摘要：取内容前 200 字符
      const summary = markdown.slice(0, 200).replace(/\n/g, ' ').trim()

      const entry = await kbWrite({
        path: resolvedKbPath,
        scope: kbScope,
        content: markdown,
        mimeType: 'text/markdown',
        tags: ['crawled', 'pipeline', hostname],
        summary,
      })

      results.push({
        step: 'kb_save',
        success: true,
        data: {
          id: entry.id,
          path: entry.path,
          scope: entry.scope,
        },
      })
    } catch (err) {
      results.push({
        step: 'kb_save',
        success: false,
        error: `保存到知识库失败: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }

  // ── 步骤 3：向量索引 ──────────────────────────────────────────────

  if (autoIndex) {
    // 检查 embedding 服务是否就绪
    if (!isEmbeddingReady()) {
      results.push({
        step: 'vector_index',
        success: false,
        error: 'Embedding 服务未就绪（缺少 API Key 配置）',
      })
    } else {
      try {
        // 构造虚拟 EntityLike 对象，用于索引
        const virtualEntity: EntityLike = {
          id: `crawled_${timestamp}`,
          name: hostname,
          type: 'crawled_content',
          description: markdown.slice(0, 2000),
          properties: { source: url },
          tags: ['crawled'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }

        await indexEntity(virtualEntity)

        results.push({
          step: 'vector_index',
          success: true,
          data: {
            entityId: virtualEntity.id,
            name: virtualEntity.name,
          },
        })
      } catch (err) {
        results.push({
          step: 'vector_index',
          success: false,
          error: `向量索引失败: ${err instanceof Error ? err.message : String(err)}`,
        })
      }
    }
  }

  return results
}
