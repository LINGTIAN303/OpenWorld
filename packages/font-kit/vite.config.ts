import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@worldsmith/entity-core': resolve(__dirname, '../entity-core/src/index.ts'),
      '@worldsmith/entity-core/stores': resolve(__dirname, '../entity-core/src/stores/index.ts'),
      '@worldsmith/entity-core/core': resolve(__dirname, '../entity-core/src/core/index.ts'),
      '@worldsmith/entity-core/types': resolve(__dirname, '../entity-core/src/types/index.ts'),
      '@worldsmith/entity-core/composables': resolve(__dirname, '../entity-core/src/composables/index.ts'),
      '@worldsmith/entity-core/traits': resolve(__dirname, '../entity-core/src/traits/index.ts'),
      '@worldsmith/entity-core/facets': resolve(__dirname, '../entity-core/src/facets/index.ts'),
      '@worldsmith/entity-core/relations': resolve(__dirname, '../entity-core/src/relations/index.ts'),
    },
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.mjs',
    },
    outDir: 'dist',
    minify: false,
    sourcemap: true,
    rollupOptions: {
      external: (id: string) => !id.startsWith('.') && !id.startsWith('/') && !id.startsWith('src/'),
    },
  },
})
