import { CoreBackend } from './bridge'
import type { IAgentBackend } from './bridge'
import type { AgentConfig } from './bridge-types'
import type { ToolDefinition } from './bridge-types'
import type { IToolContext } from './toolbus/types'
import type { ProviderConfig } from './providers/config'
import { buildSystemPrompt } from './context/injector'
import { findSkillById, getEnabledSkills, resolveToolNames, CAPABILITY_TO_TOOL } from './skills/registry'
import { loadSkillPrompt, loadSkillReference, loadSkillAsset } from './skills/loader'
import { entityCrudTools } from './tools/entity-crud'
import { relationManageTools } from './tools/relation-manage'
import { contentSearchTools } from './tools/content-search'
import { dailyTaskTools } from './tools/daily-task'
import { webSearchTools } from './tools/web-search'
import { webFetchTools } from './tools/web-fetch'
import { a2uiTools } from './tools/a2ui-tools'
import { a2uiHelperTools } from './tools/a2ui-helpers'
import { memoryTools } from './tools/memory'
import { projectTools } from './tools/project-io'
import { retrofitTools } from './tools/retrofit-tools'
import { schemaTools } from './tools/schema-tools'
import { algoTools } from './tools/algo-tools'
import { fileTools } from './tools/file-tools'
import { pluginTools } from './tools/plugin-tools'
import { moduleBuilderTools } from './tools/module-builder-tools'
import { terminalTools } from './tools/terminal-tools'
import { webCliTools } from './tools/web-cli-tools'
import { fsTools } from './tools/fs-tools'
import { pkgTools } from './tools/pkg-tools'
import { gitTools } from './tools/git-tools'
import { sysTools } from './tools/sys-tools'
import { terminalLauncherTools } from './tools/terminal-launcher-tools'
import { orchestratorTools } from './tools/orchestrator-tools'
import { workflowTools } from './tools/workflow-tools'
import { outputTools } from './tools/output-tools'
import { visionTools } from './tools/vision-tools'
import { imageGenTools } from './tools/image-gen-tools'
import { kbTools } from './tools/kb-tools'
import { personaTools } from './tools/persona'
import { PLUGIN_BACKEND_TOOLS } from './tools/plugin-backend-tools'
import { InternalChainRegistry } from './toolbus/internal-registry'
import { entityCoreDescriptor } from '@worldsmith/entity-core'
import { pluginSdkDescriptor } from '@worldsmith/plugin-sdk'
import { canvasEngineDescriptor } from '@worldsmith/canvas-engine'
import { uiKitDescriptor } from '@worldsmith/ui-kit'

const ALL_TOOLS_MAP = new Map<string, typeof entityCrudTools[0]>()

function registerAllTools(): void {
  const all = [
    ...entityCrudTools,
    ...relationManageTools,
    ...contentSearchTools,
    ...dailyTaskTools,
    ...webSearchTools,
    ...webFetchTools,
    ...a2uiTools,
    ...a2uiHelperTools,
    ...memoryTools,
    ...projectTools,
    ...retrofitTools,
    ...schemaTools,
    ...algoTools,
    ...fileTools,
    ...pluginTools,
    ...moduleBuilderTools,
    ...terminalTools,
    ...webCliTools,
    ...orchestratorTools,
    ...workflowTools,
    ...outputTools,
    ...visionTools,
    ...imageGenTools,
    ...kbTools,
    ...personaTools,
  ]
  for (const t of all) {
    ALL_TOOLS_MAP.set(t.name, t)
  }
}

registerAllTools()

export const internalRegistry = new InternalChainRegistry()
internalRegistry.register(entityCoreDescriptor)
internalRegistry.register(pluginSdkDescriptor)
internalRegistry.register(canvasEngineDescriptor)
internalRegistry.register(uiKitDescriptor)

const REFERENCE_PRELOAD_MAX_TOKENS = 3000

function estimateTokens(text: string): number {
  return Math.ceil(text.length * 0.3)
}

const loadSkillTool: ToolDefinition = {
  name: 'load_skill',
  description: 'Load and activate a skill by its id. This will inject the skill instructions into your context, giving you specialized capabilities. Available skills are listed in the "Available Skills" section of your system prompt. Call this tool when the user task matches a skill description. Small reference documents (≤2) are automatically preloaded. For additional references, use load_skill_reference.',
  parameters: {
    skill_id: { type: 'string', description: 'The skill id to activate (e.g. "worldbuilding", "content-craft", "analysis-engine", "retrofit-architect", "web-scout", "roleplay")', required: true },
  },
  execute: async (args: Record<string, unknown>, _ctx: IToolContext) => {
    const skillId = String(args.skill_id)
    const skill = findSkillById(skillId)
    if (!skill) {
      const available = getEnabledSkills().map(s => s.id).join(', ')
      return JSON.stringify({ ok: false, error: `Skill "${skillId}" not found`, available })
    }
    const prompt = await loadSkillPrompt(skill)
    if (!prompt) {
      return JSON.stringify({ ok: false, error: `Skill "${skillId}" has no instructions` })
    }
    const toolList = skill.capabilities
      ? [...skill.baseTools, ...skill.capabilities.internal.map(c => CAPABILITY_TO_TOOL[c] || c), ...skill.capabilities.cli.map(c => CAPABILITY_TO_TOOL[c] || c), ...skill.capabilities.mcp.map(c => CAPABILITY_TO_TOOL[c] || c)]
      : [...skill.baseTools, ...skill.allowedTools]

    const result: Record<string, unknown> = {
      ok: true,
      skill: skillId,
      name: skill.name,
      availableTools: toolList,
      instructions: prompt,
    }

    if (skill.references && skill.references.length > 0 && skill.references.length <= 2) {
      const refs: Record<string, string> = {}
      let totalTokens = estimateTokens(prompt)

      for (const refPath of skill.references) {
        if (totalTokens >= REFERENCE_PRELOAD_MAX_TOKENS) break
        const content = await loadSkillReference(skill, refPath)
        if (content) {
          const tokens = estimateTokens(content)
          if (totalTokens + tokens <= REFERENCE_PRELOAD_MAX_TOKENS) {
            const shortKey = refPath.replace('references/', '').replace(/\.md$/, '')
            refs[shortKey] = content
            totalTokens += tokens
          }
        }
      }

      if (Object.keys(refs).length > 0) {
        result.references = refs
      }
    }

    if (skill.references && skill.references.length > 2) {
      result.referencesAvailable = skill.references.map(r => r.replace('references/', '').replace(/\.md$/,''))
    }

    return JSON.stringify(result)
  },
}

const loadReferenceTool: ToolDefinition = {
  name: 'load_skill_reference',
  description: 'Load a reference document from an active skill. Note: small reference sets (≤2 files) are already preloaded when you call load_skill. Use this tool for additional references or skills with 3+ references. Returns the full reference content.',
  parameters: {
    skill_id: { type: 'string', description: 'The skill id that contains the reference', required: true },
    ref_path: { type: 'string', description: 'The reference file name (e.g. "references/algo-catalog.md")', required: true },
  },
  execute: async (args: Record<string, unknown>, _ctx: IToolContext) => {
    const skillId = String(args.skill_id)
    const refPath = String(args.ref_path)
    const skill = findSkillById(skillId)
    if (!skill) {
      return JSON.stringify({ ok: false, error: `Skill "${skillId}" not found` })
    }
    const content = await loadSkillReference(skill, refPath)
    if (!content) {
      return JSON.stringify({ ok: false, error: `Reference "${refPath}" not found in skill "${skillId}"` })
    }
    return JSON.stringify({ ok: true, skill: skillId, reference: refPath, content })
  },
}

const loadAssetTool: ToolDefinition = {
  name: 'load_skill_asset',
  description: 'Load a template or static resource from an active skill. Use when you need entity templates, output format templates, or other assets referenced in the skill instructions.',
  parameters: {
    skill_id: { type: 'string', description: 'The skill id that contains the asset', required: true },
    asset_path: { type: 'string', description: 'The asset file name (e.g. "entity-templates.yaml")', required: true },
  },
  execute: async (args: Record<string, unknown>, _ctx: IToolContext) => {
    const skillId = String(args.skill_id)
    const assetPath = String(args.asset_path)
    const skill = findSkillById(skillId)
    if (!skill) {
      return JSON.stringify({ ok: false, error: `Skill "${skillId}" not found` })
    }
    const content = await loadSkillAsset(skill, assetPath)
    if (!content) {
      return JSON.stringify({ ok: false, error: `Asset "${assetPath}" not found in skill "${skillId}"` })
    }
    return JSON.stringify({ ok: true, skill: skillId, asset: assetPath, content })
  },
}

export const SKILL_META_TOOLS = [loadSkillTool, loadReferenceTool, loadAssetTool]

export function getToolsForSkills(activeSkillIds: string[]): typeof entityCrudTools[0][] {
  const toolNames = resolveToolNames(activeSkillIds)
  const tools: typeof entityCrudTools[0][] = []
  const seen = new Set<string>()

  for (const name of toolNames) {
    const t = ALL_TOOLS_MAP.get(name)
    if (t && !seen.has(name)) {
      tools.push(t)
      seen.add(name)
    }
  }

  const registryTools = internalRegistry.resolve(
    activeSkillIds.flatMap(id => {
      const skill = findSkillById(id)
      return skill?.capabilities
        ? [...skill.capabilities.internal, ...skill.capabilities.cli, ...skill.capabilities.mcp]
        : []
    }),
    'web',
  )
  for (const t of registryTools) {
    if (!seen.has(t.name)) {
      tools.push(t)
      seen.add(t.name)
    }
  }

  tools.push(...SKILL_META_TOOLS)

  return tools
}

export const ALL_TOOLS = [
  ...entityCrudTools,
  ...relationManageTools,
  ...contentSearchTools,
  ...dailyTaskTools,
  ...webSearchTools,
  ...webFetchTools,
  ...a2uiTools,
  ...a2uiHelperTools,
  ...memoryTools,
  ...projectTools,
  ...retrofitTools,
  ...schemaTools,
  ...algoTools,
  ...fileTools,
  ...pluginTools,
  ...moduleBuilderTools,
  ...terminalTools,
  ...webCliTools,
  ...fsTools,
  ...pkgTools,
  ...gitTools,
  ...sysTools,
  ...terminalLauncherTools,
  ...orchestratorTools,
  ...workflowTools,
  ...PLUGIN_BACKEND_TOOLS,
  ...outputTools,
  ...visionTools,
  ...imageGenTools,
  ...kbTools,
  ...personaTools,
  ...SKILL_META_TOOLS,
]

export interface CreateAgentOptions {
  providerConfig: ProviderConfig
  toolContext: IToolContext
  tools?: AgentConfig['tools']
  beforeToolCall?: AgentConfig['beforeToolCall']
  projectName?: string
  personaPreset?: string
}

export async function createWorldSmithAgent(options: CreateAgentOptions): Promise<IAgentBackend> {
  const systemPrompt = buildSystemPrompt({
    projectName: options.projectName || 'WorldSmith',
    entityTypes: options.toolContext.projectInfo.entityTypes,
    relationTypes: options.toolContext.projectInfo.relationTypes,
    platform: options.toolContext.platform,
    personaPreset: options.personaPreset,
  })

  const config: AgentConfig = {
    providerConfig: options.providerConfig,
    systemPrompt,
    tools: options.tools || ALL_TOOLS,
    toolContext: options.toolContext,
    beforeToolCall: options.beforeToolCall,
  }

  const backend = new CoreBackend(config)
  await backend.initialize()
  return backend
}

export { DefaultToolBus } from './toolbus/toolbus'
export type { ToolBus } from './toolbus/toolbus'
export { MCPManager } from './mcp/mcp-manager'
export { MCPToolAdapter } from './mcp/mcp-adapter'
export type { MCPConnectionConfig, MCPTransportType, MCPToolInfo, MCPConnectionState } from './mcp/types'
