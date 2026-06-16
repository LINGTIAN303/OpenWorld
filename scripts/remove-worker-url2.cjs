const fs = require('fs')
const path = require('path')

const poolPath = path.join('d:\\本地化AI\\DeepSeek_Home\\worldsmith-build\\src\\core', 'wasmWorkerPool.ts')
let content = fs.readFileSync(poolPath, 'utf8')

// Replace the entire initPool function body
content = content.replace(
  `/** 初始化 Worker 池 */
function initPool(): void {
  if (pool.length > 0 || poolInitAttempted) return
  poolInitAttempted = true

  try {
    for (let i = 0; i < WORKER_COUNT; i++) {
      const worker = new Worker(
        new URL('./wasm.worker.ts', import.meta.url),
        { type: 'module', name: \`wasm-worker-\${i}\` },
      )
      pool.push({ worker, busy: false })
    }
    console.log(\`[WasmWorkerPool] 初始化 \${pool.length} 个 Worker\`)
  } catch (e) {
    console.warn('[WasmWorkerPool] Worker 创建失败，回退到主线程:', e)
    pool = []
  }
}`,
  `/** 初始化 Worker 池 — 打包构建中禁用，WASM 运行在主线程 */
function initPool(): void {
  poolInitAttempted = true
  // Worker pool disabled for packaged builds - Vite cannot bundle WASM in Worker context
  // WASM computations will run on main thread via ensureWasm() fallback
}`
)

fs.writeFileSync(poolPath, content, 'utf8')
console.log('Removed Worker URL reference from wasmWorkerPool.ts')

// Verify
const verify = fs.readFileSync(poolPath, 'utf8')
console.log('Contains new URL:', verify.includes('new URL'))
console.log('Contains new Worker:', verify.includes('new Worker'))
