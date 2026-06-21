import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

/**
 * memory-archive 独立 vitest 配置
 *
 * 不依赖 Vue 插件和 jsdom 环境，纯 Node.js 环境测试。
 */
export default defineConfig({
  test: {
    root: resolve(__dirname),
    environment: 'node',
    globals: true,
    include: ['__tests__/**/*.spec.ts'],
  },
  resolve: {
    alias: {
      '@worldsmith/memory-archive$': resolve(__dirname, 'src'),
      '@worldsmith/memory-archive/types': resolve(__dirname, 'src/types'),
      '@worldsmith/memory-archive/core': resolve(__dirname, 'src/core'),
      '@worldsmith/memory-archive/adapters': resolve(__dirname, 'src/adapters'),
      '@worldsmith/memory-archive/storage': resolve(__dirname, 'src/storage'),
      '@worldsmith/memory-archive/embedding': resolve(__dirname, 'src/embedding'),
      '@worldsmith/memory-archive/utils': resolve(__dirname, 'src/utils'),
    },
  },
})
