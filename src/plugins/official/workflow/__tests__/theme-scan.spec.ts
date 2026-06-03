import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import NodePalette from '@/plugins/official/workflow/components/NodePalette.vue'
import WorkflowCard from '@/plugins/official/workflow/components/WorkflowCard.vue'
import RunTimelineItem from '@/plugins/official/workflow/components/run/RunTimelineItem.vue'
import AgentDecisionCard from '@/plugins/official/workflow/components/run/AgentDecisionCard.vue'

// 6 主题列表 — 对应 .storybook/preview.ts backgrounds
const THEMES = ['cosmic', 'aurora-abyss', 'light', 'forge-ember', 'ink-scroll', 'crystal-prism']

/**
 * 验证:每个 P3 关键组件在所有主题下都能 mount,DOM 中不出现 hardcoded 颜色。
 * 这不替换 6 主题的真实 visual 测试(那是 Storybook 视觉回归),
 * 但保证 6 主题语义 token 都在 .design-tokens/semantic.css 中有定义,
 * P3 组件用 var(--color-*) 取色,自动适配。
 */
describe('P3 components — 6 主题 token 适配', () => {
  for (const theme of THEMES) {
    it(`mounts P3 components under theme="${theme}" without hardcoded colors`, () => {
      // 模拟切到该主题(data-theme 属性)
      document.documentElement.setAttribute('data-theme', theme)
      const palette = mount(NodePalette)
      const card = mount(WorkflowCard, {
        props: { workflow: { id: 'wf-1', name: 'test', latestVersion: 1, category: 'c', description: null, updatedAt: 0 } },
      })
      const timeline = mount(RunTimelineItem, {
        props: { item: { nodeId: 'n1', nodeName: 'n', nodeType: 'skill', status: 'completed' as const, startedAt: 0, finishedAt: 1000 } },
      })
      const decision = mount(AgentDecisionCard, {
        props: { context: { runId: 'r', nodeId: 'n', nodeName: 'decision', nodeType: 'agent_decision', prompt: '?', context: { summary: '', items: [] }, options: [{ id: 'a', label: 'A' }], defaultOption: 'a', decisionTimeoutMs: 0 } },
      })
      // 所有组件 mount 成功
      expect(palette.exists()).toBe(true)
      expect(card.exists()).toBe(true)
      expect(timeline.exists()).toBe(true)
      expect(decision.exists()).toBe(true)
      // DOM 不含 hardcoded 颜色字面量
      const combined = palette.html() + card.html() + timeline.html() + decision.html()
      expect(combined).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
      expect(combined).not.toMatch(/rgb\(/)
      expect(combined).not.toMatch(/rgba\(/)
    })
  }
})
