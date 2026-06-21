/**
 * LLM 适配器接口（新增）
 *
 * 用于归档流程 Step 4 生成摘要（2K-5K）。
 * 框架内置规则降级实现（RuleBasedLlmAdapter），LLM 不可用时自动降级。
 * 宿主应注入真实 LLM 实现以获得高质量摘要。
 */

export interface LlmAdapter {
  /** 是否就绪（未就绪时降级为规则提取） */
  isReady(): boolean
  /**
   * 生成摘要
   * @param messages 待摘要的消息列表
   * @param maxLength 摘要最大长度（字符数）
   * @returns 摘要文本
   */
  summarize(messages: { role: string; content: string }[], maxLength: number): Promise<string>
  /**
   * 评估重要性（0-1）
   * @param messages 待评估的消息列表
   * @returns 重要性评分，0-1
   */
  assessImportance(messages: { role: string; content: string }[]): Promise<number>
  /**
   * 提取关键词
   * @param messages 待提取的消息列表
   * @returns 关键词列表
   */
  extractKeywords(messages: { role: string; content: string }[]): Promise<string[]>
}
