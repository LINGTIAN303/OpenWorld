/**
 * 向量嵌入适配器接口（内置默认实现）
 *
 * 框架提供 OpenAIEmbeddingAdapter 默认实现。
 * 宿主可替换为其他 embedding 提供商。
 */

export interface EmbeddingAdapter {
  /** 是否就绪（未就绪时跳过向量生成，等日任务补全） */
  isReady(): boolean
  embed(text: string): Promise<number[]>
  embedBatch(texts: string[]): Promise<number[][]>
}
