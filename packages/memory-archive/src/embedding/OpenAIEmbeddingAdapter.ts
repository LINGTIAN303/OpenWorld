/**
 * OpenAI 兼容 Embedding 适配器
 *
 * 支持 OpenAI 及任何 OpenAI 兼容的 embedding API（如 Azure OpenAI、本地部署等）。
 * 通过 fetch API 调用，无硬依赖。
 */

import type { EmbeddingAdapter } from '../adapters/EmbeddingAdapter'

export interface OpenAIEmbeddingAdapterOptions {
  apiKey: string
  baseURL?: string // 默认 'https://api.openai.com/v1'
  model?: string // 默认 'text-embedding-3-small'
  batchSize?: number // 默认 100
  /** 自定义 fetch（用于测试或代理） */
  fetchFn?: typeof fetch
}

export class OpenAIEmbeddingAdapter implements EmbeddingAdapter {
  private apiKey: string
  private baseURL: string
  private model: string
  private batchSize: number
  private fetchFn: typeof fetch

  constructor(options: OpenAIEmbeddingAdapterOptions) {
    this.apiKey = options.apiKey
    this.baseURL = options.baseURL || 'https://api.openai.com/v1'
    this.model = options.model || 'text-embedding-3-small'
    this.batchSize = options.batchSize || 100
    this.fetchFn = options.fetchFn || fetch
  }

  isReady(): boolean {
    return !!this.apiKey
  }

  async embed(text: string): Promise<number[]> {
    const results = await this.embedBatch([text])
    return results[0]
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.isReady()) {
      throw new Error('EmbeddingAdapter not ready: apiKey is missing')
    }

    const results: number[][] = []
    // 分批处理
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize)
      const batchResults = await this.embedBatchInternal(batch)
      results.push(...batchResults)
    }
    return results
  }

  private async embedBatchInternal(texts: string[]): Promise<number[][]> {
    const response = await this.fetchFn(`${this.baseURL}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    })

    if (!response.ok) {
      throw new Error(`Embedding API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    // OpenAI 返回格式：{ data: [{ embedding: number[] }, ...] }
    return data.data.map((item: { embedding: number[] }) => item.embedding)
  }
}
