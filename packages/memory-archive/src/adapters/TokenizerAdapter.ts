/**
 * 分词器适配器接口（H2.2 新增）
 *
 * 用于关键词提取和检索时的文本分词。
 * 框架内置简单分词实现（按字符切分），宿主可注入 jieba 等专业分词库以提升中文检索精度。
 *
 * 零硬依赖原则：框架不直接依赖任何分词库，通过此接口解耦。
 * 宿主可在项目其余层中实现额外附挂（如 jieba、nodejieba 等）。
 *
 * 使用场景：
 * 1. RuleBasedLlmAdapter.extractKeywords：中文分词提取关键词
 * 2. RecallEngine.keywordSearch：查询文本分词
 */

export interface TokenizerAdapter {
  /**
   * 是否就绪
   *
   * 未就绪时框架降级为简单分词（按字符切分）。
   */
  isReady(): boolean

  /**
   * 分词
   *
   * 将文本切分为词语数组。
   * 中文应切分为有意义的词语（如"人工智能"→["人工","智能"]或["人工智能"]），
   * 英文按空格和标点切分。
   *
   * @param text 待分词的文本
   * @returns 词语数组
   */
  tokenize(text: string): string[]

  /**
   * 提取关键词（可选，未实现时框架使用 tokenize + 词频统计）
   *
   * @param text 待提取的文本
   * @param maxCount 最大关键词数量
   * @returns 关键词数组
   */
  extractKeywords?(text: string, maxCount?: number): string[]
}
