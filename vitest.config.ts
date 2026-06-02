import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/__tests__/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/ui/Ws*.vue',
        'src/ui/__tests__/primitives/**',
        'src/plugins/official/workflow/composables/use*.ts',
      ],
      exclude: [
        'src/ui/__tests__/**',
        'src/ui/__stories__/**',
        '**/*.spec.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
