import type { WorldSmithToolContext } from '../tools/types'
import { buildProjectSummary, formatSummaryForPrompt } from '../context/summary'

export function createContextExtension(ctx: WorldSmithToolContext) {
  return {
    name: 'worldsmith-context',

    onPromptStart(_text: string): string {
      const summary = buildProjectSummary(ctx)
      const injection = formatSummaryForPrompt(summary)
      return injection
    },

    getSystemPromptSuffix(): string {
      return `\n\n[当前项目状态] ${formatSummaryForPrompt(buildProjectSummary(ctx))}`
    },
  }
}
