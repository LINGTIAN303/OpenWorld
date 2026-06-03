import type { Meta, StoryObj } from '@storybook/vue3'
import EditorPreferencesCard from '../components/editor/EditorPreferencesCard.vue'
import { useEditorPreferences } from '../composables/useEditorPreferences'

const meta: Meta<typeof EditorPreferencesCard> = {
  title: 'Workflow/Editor/EditorPreferencesCard',
  component: EditorPreferencesCard,
  tags: ['autodocs'],
  argTypes: {},
}
export default meta

type Story = StoryObj<typeof EditorPreferencesCard>

/**
 * 默认状态:sidebar 编辑 + click/drag 添加,hover delay slider 不可用。
 */
export const Default: Story = {
  render: () => ({
    components: { EditorPreferencesCard },
    setup() {
      const prefs = useEditorPreferences()
      prefs.reset()
      return { prefs }
    },
    template: `
      <div style="padding: 24px; background: var(--color-bg-canvas, #0b1020); min-height: 100vh;">
        <EditorPreferencesCard data-testid="story-pref" />
      </div>
    `,
  }),
}

/**
 * 编辑方式选 hover,hover delay slider 启用。
 */
export const HoverMode: Story = {
  render: () => ({
    components: { EditorPreferencesCard },
    setup() {
      const prefs = useEditorPreferences()
      prefs.reset()
      prefs.setEditMethod('hover')
      prefs.value.hoverDelayMs = 500
      return { prefs }
    },
    template: `
      <div style="padding: 24px; background: var(--color-bg-canvas, #0b1020); min-height: 100vh;">
        <EditorPreferencesCard />
      </div>
    `,
  }),
}

/**
 * 编辑方式选 inline,slider disabled。
 */
export const InlineMode: Story = {
  render: () => ({
    components: { EditorPreferencesCard },
    setup() {
      const prefs = useEditorPreferences()
      prefs.reset()
      prefs.setEditMethod('inline')
      prefs.toggleAddMethod('contextmenu')
      return { prefs }
    },
    template: `
      <div style="padding: 24px; background: var(--color-bg-canvas, #0b1020); min-height: 100vh;">
        <EditorPreferencesCard />
      </div>
    `,
  }),
}

/**
 * 全部 3 个 add method 都启用。
 */
export const AllAddMethods: Story = {
  render: () => ({
    components: { EditorPreferencesCard },
    setup() {
      const prefs = useEditorPreferences()
      prefs.reset()
      prefs.toggleAddMethod('contextmenu')
      return { prefs }
    },
    template: `
      <div style="padding: 24px; background: var(--color-bg-canvas, #0b1020); min-height: 100vh;">
        <EditorPreferencesCard />
      </div>
    `,
  }),
}

/**
 * 配合 onSave 事件记录。
 */
export const WithActionLog: Story = {
  render: () => ({
    components: { EditorPreferencesCard },
    setup() {
      const prefs = useEditorPreferences()
      prefs.reset()
      return { prefs, log: (label: string, e: unknown) => console.log(`[story] ${label}`, e) }
    },
    template: `
      <div style="padding: 24px; background: var(--color-bg-canvas, #0b1020); min-height: 100vh;">
        <p style="margin: 0 0 12px 0; color: var(--color-text-secondary); font-size: 12px;">
          修改选项、点击保存,事件在浏览器控制台输出
        </p>
        <EditorPreferencesCard @save="() => log('save', null)" />
      </div>
    `,
  }),
}
