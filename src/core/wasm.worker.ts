/**
 * WASM Worker — 在 Web Worker 中运行 WASM 重计算，避免阻塞 UI 主线程
 *
 * 架构：
 *   主线程 → postMessage({ method, args }) → Worker 加载 WASM 执行 → postMessage({ id, result/error })
 *
 * Worker 内部维持 WorldSmithCore 单例，首次调用时懒加载 WASM 模块。
 * 后续调用直接复用已初始化的实例，无重复初始化开销。
 */

/// Worker 与主线程之间的消息协议
export interface WorkerRequest {
  id: number
  method: string
  args: unknown[]
}

export interface WorkerResponse {
  id: number
  result?: unknown
  error?: string
}

/// WASM 模块类型声明（运行时动态导入，类型宽松处理）
interface WasmModule {
  WorldSmithCore: new () => {
    [method: string]: (...args: any[]) => any
  }
}

let wasmModule: WasmModule | null = null
let wasmInstance: { [method: string]: (...args: any[]) => any } | null = null

async function ensureWasm(): Promise<{ [method: string]: (...args: any[]) => any }> {
  if (wasmInstance) return wasmInstance

  try {
    // @ts-ignore — Vite/wasm-pack 动态导入
    wasmModule = await import('@worldsmith/core')
    if (!wasmModule?.WorldSmithCore) {
      throw new Error('WASM 模块缺少 WorldSmithCore 导出')
    }
    wasmInstance = new wasmModule.WorldSmithCore()
    if (typeof wasmInstance.validateEntity !== 'function') {
      throw new Error('WASM 核心库版本不匹配，缺少 validateEntity 方法')
    }
    return wasmInstance
  } catch (e: any) {
    wasmInstance = null
    throw new Error(`WASM Worker 加载失败: ${e?.message || String(e)}`)
  }
}

/// 消息处理
self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, method, args } = e.data

  try {
    const core = await ensureWasm()
    if (typeof core[method] !== 'function') {
      throw new Error(`WASM 方法 "${method}" 不存在`)
    }
    const result = core[method](...args)
    const response: WorkerResponse = { id, result }
    self.postMessage(response)
  } catch (err: any) {
    const response: WorkerResponse = {
      id,
      error: err?.message || String(err),
    }
    self.postMessage(response)
  }
}
