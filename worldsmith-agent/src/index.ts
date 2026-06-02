/**
 * worldsmith-agent 包入口
 *
 * 统一导出所有公开 API，包括：
 * - Agent 创建和配置
 * - 工具定义和类型
 * - 会话管理
 * - 上下文构建和注入
 * - Skill 注册管理
 * - Provider 配置和 Key 存储
 * - Embedding（向量嵌入）服务
 * - 图像生成和持久化
 * - 日志和限流
 */

export { createWorldSmithAgent, getToolsForSkills, ALL_TOOLS, internalRegistry } from './agent'
export type { CreateAgentOptions } from './agent'
export { CoreBackend } from './bridge'
export type { IAgentBackend } from './bridge'
export type { AgentEvent, AgentEventListener, AgentConfig, ToolDefinition, ToolParameter, PromptOptions, ImageAttachment, UsageData, ThinkingLevel, ChatMode, A2UIMessage, A2UIComponent, MessageBlock, TableBlock, ChoiceBlock, CodeBlockData, EntityCardBlock, AlertBlock, StatBlock, ListBlock, ProgressBlock, ComparisonBlock, TimelineBlock, ImageBlock, AccordionBlock } from './bridge-types'
export type { WorldSmithToolContext, EntityLike, RelationLike } from './tools/types'
export { DefaultToolBus } from './toolbus/toolbus'
export type { ToolBus } from './toolbus/toolbus'
export type { IToolContext, IToolStores, IEntityStore, IRelationStore, IFileStore, ISettingsStore, IUIStore } from './toolbus/types'
export { MCPManager } from './mcp/mcp-manager'
export { MCPToolAdapter } from './mcp/mcp-adapter'
export type { MCPConnectionConfig, MCPTransportType, MCPToolInfo, MCPConnectionState } from './mcp/types'
export type { AgentSession, AgentMessage, AgentStateSnapshot, ToolCallRecord, ProviderMode, ModelInfo, ImageAttachment as SessionImageAttachment, FileAttachment, SessionUsage } from './session/types'
export type { ProviderConfig, CloudProviderConfig, LocalProviderConfig, CustomProviderConfig, CloudProvider, LocalApiType, CustomApiType } from './providers/config'
export { DEFAULT_CLOUD_CONFIGS } from './providers/config'
export { storeApiKey, loadApiKey, removeApiKey, hasApiKey } from './providers/key-store'
export { listSessions, getSession, saveSession, deleteSession, createSession, pinSession, unpinSession, countSessions } from './session/manager'
export { buildContextInjection, invalidateContextCache } from './context/builder'
export { buildSystemPrompt } from './context/injector'
export { buildProjectSummary, formatSummaryForPrompt, truncateMessages } from './context/summary'
export { logger, setLogLevel } from './utils/logger'
export { checkRateLimit, recordRequest, recordUsage, getUsageSummary } from './utils/rate-limit'
export { SKILL_REGISTRY, getEnabledSkills, getAllSkills, toggleSkill } from './skills/registry'
export type { SkillMeta } from './skills/registry'
export { resolvePluginToolNames, buildPluginCapabilityPrompt, registerPluginCapability, getPluginCapability, getAllPluginCapabilities, resolveRelatedPlugins } from './skills/plugin-bridge'
export type { PluginCapability } from './skills/plugin-bridge'
export { outputTools, outputTable, outputChoice, outputCode, outputEntityCard, outputAlert, outputStat, outputList, outputProgress, outputComparison, outputTimeline, outputImage, outputAccordion } from './tools/output-tools'
export { recallMemory, formatMemoryForPrompt } from './tools/memory'
export { generateEmbedding, generateEmbeddings, cosineSimilarity, clearEmbeddingCache, getEmbeddingConfig, saveEmbeddingConfig } from './embedding/service'
export type { EmbeddingConfig } from './embedding/service'
export { putVector, putVectors, getVector, deleteVector, getCollection, searchSimilar, deleteCollection, getCollectionSize } from './embedding/vector-store'
export type { VectorRecord, SearchResult as VectorSearchResult } from './embedding/vector-store'
export { indexEntity, indexEntities, removeEntityIndex, indexMemoryEntry, removeMemoryIndex, syncEntityIndex, semanticSearch, semanticSearchEntities, semanticSearchMemory, isEmbeddingReady, getEmbeddingStats } from './embedding/index'
export type { SemanticSearchResult } from './embedding/index'
export { EMBEDDING_PRESETS } from './embedding/service'
export { storeImages, getImages, removeImages, type StoredImage } from './tools/vision-tools'
export { imageGenTools } from './tools/image-gen-tools'
export { persistImage, getImage, getImagesByPathPrefix, getAllImages, deleteImage, deleteImagesByPrefix, getImageCount, srcToBlob, downloadBlob, blobToDataUrl } from './stores/image-persistence'
export type { PersistedImage } from './stores/image-persistence'
