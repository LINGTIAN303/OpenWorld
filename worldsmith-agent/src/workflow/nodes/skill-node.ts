import type { NodeTypeDefinition, NodeOutput } from '../types'

export const skillNode: NodeTypeDefinition = {
  type: 'skill',
  category: 'builtin',
  label: 'Skill',
  icon: '🎯',
  color: '#8B5CF6',
  pluginId: 'workflow',
  description: '激活一个 Skill 执行',
  configSchema: {
    skill_id: { type: 'string', label: 'Skill ID', required: true },
    prompt: { type: 'string', label: '提示词', required: true },
    output_preference_channel: { type: 'select', label: '输出通道', options: ['chat', 'a2ui', 'plugin', 'file'] },
    output_preference_component: { type: 'string', label: '输出组件' },
    allowed_tools: { type: 'array', label: '限制工具' },
    timeout: { type: 'number', label: '超时(ms)' },
  },
  async execute(config, ctx, api): Promise<NodeOutput> {
    const startTime = Date.now()
    const skillId = api.resolveVars(config.skill_id as string, ctx)
    const prompt = api.resolveVars(config.prompt as string, ctx)

    const loadResult = await api.callTool('load_skill', { skill_id: skillId })
    let parsed: any
    try { parsed = JSON.parse(loadResult) } catch { parsed = { ok: false, error: loadResult } }

    if (!parsed.ok) {
      return { status: 'failed', data: null, error: `Skill "${skillId}" 加载失败: ${parsed.error}`, duration: Date.now() - startTime }
    }

    const instructions = parsed.instructions || ''
    const fullPrompt = `${instructions}\n\n${prompt}`

    const result = await api.callTool('execute_command', { command: fullPrompt })
    let outputData: unknown = result
    try { outputData = JSON.parse(result) } catch {}

    return { status: 'success', data: outputData, duration: Date.now() - startTime }
  },
}
