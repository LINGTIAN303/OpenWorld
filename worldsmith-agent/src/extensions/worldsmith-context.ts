import type { WorldSmithToolContext } from '../tools/types'
import { buildProjectSummary, formatSummaryForPrompt } from '../context/summary'

export function createContextExtension(ctx: WorldSmithToolContext) {
  return {
    name: 'worldsmith-context',

    async onPromptStart(_text: string): Promise<string> {
      const summary = await buildProjectSummary(ctx)
      const injection = formatSummaryForPrompt(summary)
      return injection
    },

    async getSystemPromptSuffix(): Promise<string> {
      const summary = await buildProjectSummary(ctx)
      return `\n\n[当前项目状态] ${formatSummaryForPrompt(summary)}`
    },
  }
}
