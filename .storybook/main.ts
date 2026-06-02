import type { StorybookConfig } from '@storybook/vue3-vite'
import { fileURLToPath } from 'node:url'

const config: StorybookConfig = {
  stories: [
    '../src/ui/__stories__/**/*.mdx',
    '../src/ui/__stories__/**/*.stories.@(js|ts)',
    '../src/plugins/official/workflow/__stories__/**/*.stories.@(js|ts)',
  ],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-a11y',
  ],
  framework: {
    name: '@storybook/vue3-vite',
    options: {},
  },
  docs: {},
  viteFinal: async (config) => {
    config.resolve = config.resolve ?? {}
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@': fileURLToPath(new URL('../src', import.meta.url)),
    }
    return config
  },
}

export default config
