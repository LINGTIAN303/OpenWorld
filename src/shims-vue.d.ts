// shims-vue.d.ts — Vue SFC 模块声明
//
// Phase 4.5 修复：项目此前缺 shim，导致 .vue 文件在 .ts 里 import 时 tsc 报错
// `Cannot find module './X.vue' or its corresponding type declarations`。
//
// 标 include `src/**/*.vue` 时，TS 编译器需要 .vue 的类型声明（默认只能从 vue-loader / vite-plugin-vue 等构建时拿到）。
// 这里是纯类型 shim：实际编译由 Vite 处理；只为了让 tsc 通过 `import X from './X.vue'`。
//
// 类型从 *.vue 取：直接 import `../composables/editor-types.ts` 等独立 .ts 类型模块，
// 不依赖 .vue 文件 re-export 类型 — 更稳。

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const component: DefineComponent<{}, {}, any>
  export default component
}
