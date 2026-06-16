const fs = require('fs')
const path = require('path')

const poolPath = path.join('d:\\本地化AI\\DeepSeek_Home\\worldsmith-build\\src\\core', 'wasmWorkerPool.ts')

const newContent = `/**
 * WASM Worker 池 — 打包构建中禁用
 *
 * 在开发模式下使用 Worker 池执行 WASM 重计算，
 * 在打包构建中回退到主线程（Vite 无法在 Worker 中打包 WASM）。
 *
 * 重计算方法将直接在主线程同步执行。
 */

// ─── 重计算方法集合 ───

const HEAVY_METHODS = new Set([
  // 图算法
  'algoForceLayout',
  'algoDijkstraPath',
  'algoAstar',
  'algoTopologicalSort',
  'algoConnectedComponents',
  'algoTarjanScc',
  'algoPageRank',
  'algoCommunityDetection',
  'algoBetweennessCentrality',
  // 地形
  'algoTerrainHeightmapGenerate',
  'algoHydraulicErosion',
  'algoViewshed',
  // 约束求解
  'algoConstraintSolve',
  // 诊断
  'runDiagnostics',
  'validatePack',
  'validateEntities',
  // DXF
  'algoDxfParse',
  // 多边形布尔
  'algoPolygonBoolean',
])

/** 判断某方法是否属于重计算 */
export function isHeavyMethod(method: string): boolean {
  return HEAVY_METHODS.has(method)
}

/**
 * 通过 Worker 池执行 WASM 方法 — 打包构建中直接回退到主线程
 */
export async function callViaWorker(
  method: string,
  args: unknown[],
  fallbackFn?: () => any,
): Promise<unknown> {
  if (fallbackFn) return fallbackFn()
  throw new Error(\`Worker 不可用，且无回退函数: \${method}\`)
}

/** 销毁 Worker 池 — 打包构建中为空操作 */
export function terminatePool(): void {
  // No-op in packaged build
}
`

fs.writeFileSync(poolPath, newContent, 'utf8')
console.log('Completely rewrote wasmWorkerPool.ts (Worker pool disabled for build)')

// Verify
const verify = fs.readFileSync(poolPath, 'utf8')
console.log('Contains new URL:', verify.includes('new URL'))
console.log('Contains new Worker:', verify.includes('new Worker'))
console.log('Contains import.meta:', verify.includes('import.meta'))
