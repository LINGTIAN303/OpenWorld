import type { Preview } from '@storybook/vue3'
import '../src/design-tokens/primitive.css'
import '../src/design-tokens/semantic.css'
import '../src/design-tokens/component.css'
import '../src/assets/themes.css'

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'cosmic',
      values: [
        { name: 'cosmic', value: '#0f0f23' },
        { name: 'aurora-abyss', value: '#0a1f1f' },
        { name: 'light', value: '#ffffff' },
        { name: 'forge-ember', value: '#1a0f08' },
        { name: 'ink-scroll', value: '#f5f1e8' },
        { name: 'crystal-prism', value: '#0a0f2a' },
      ],
    },
    controls: { expanded: true },
  },
}

export default preview
