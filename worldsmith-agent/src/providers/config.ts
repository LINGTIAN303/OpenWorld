/**
 * 供应商配置类型定义
 *
 * 支持三种部署模式：
 * - cloud: 内置云端供应商（Anthropic、OpenAI、Google 等）
 * - local: 本地模型服务（Ollama、LM Studio、vLLM 等）
 * - custom: 自定义 API 端点（兼容 OpenAI/Anthropic 格式的第三方服务）
 */

/** 部署模式 */
export type ProviderMode = 'cloud' | 'local' | 'custom'

/** 内置云端供应商 */
export type CloudProvider = 'anthropic' | 'openai' | 'google' | 'deepseek' | 'groq' | 'openrouter' | 'zhipu' | 'qwen' | 'minimax' | 'kimi'

/** 本地模型 API 类型 */
export type LocalApiType = 'ollama' | 'lm-studio' | 'vllm' | 'llama-cpp'

/** 自定义 API 兼容模式 */
export type CustomApiType = 'openai-compatible' | 'anthropic-compatible'

/** 云端供应商配置 */
export interface CloudProviderConfig {
  provider: CloudProvider
  modelId: string
  apiKey: string
}

/** 本地模型配置 */
export interface LocalProviderConfig {
  endpoint: string
  apiType: LocalApiType
  modelId: string
}

/** 自定义 API 配置 */
export interface CustomProviderConfig {
  baseUrl: string
  apiKey: string
  apiType: CustomApiType
  modelId: string
  /** 上下文窗口大小 (token 数) */
  contextWindow?: number
  /** 最大输出 token 数 */
  maxTokens?: number
}

/** 联合供应商配置类型 */
export type ProviderConfig =
  | ({ mode: 'cloud' } & CloudProviderConfig)
  | ({ mode: 'local' } & LocalProviderConfig)
  | ({ mode: 'custom' } & CustomProviderConfig)

/** 各云端供应商的默认模型 */
export const DEFAULT_CLOUD_CONFIGS: Record<CloudProvider, { provider: CloudProvider; modelId: string }> = {
  anthropic: { provider: 'anthropic', modelId: 'claude-sonnet-4-6' },
  openai: { provider: 'openai', modelId: 'gpt-5.4' },
  google: { provider: 'google', modelId: 'gemini-2.5-flash' },
  deepseek: { provider: 'deepseek', modelId: 'deepseek-v4-flash' },
  groq: { provider: 'groq', modelId: 'openai/gpt-oss-120b' },
  openrouter: { provider: 'openrouter', modelId: 'openai/gpt-4o' },
  zhipu: { provider: 'zhipu', modelId: 'glm-5.1' },
  qwen: { provider: 'qwen', modelId: 'qwen3.6-plus' },
  minimax: { provider: 'minimax', modelId: 'MiniMax-M3' },
  kimi: { provider: 'kimi', modelId: 'kimi-k2.6' },
}

/** 本地模式的默认配置（Ollama 默认地址） */
export const DEFAULT_LOCAL_CONFIG: Omit<LocalProviderConfig, 'modelId'> = {
  endpoint: 'http://localhost:11434',
  apiType: 'ollama',
}
