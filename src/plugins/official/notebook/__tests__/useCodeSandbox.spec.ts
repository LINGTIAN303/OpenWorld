import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockTranspileModule = vi.fn()
vi.mock('typescript', () => ({
  default: { transpileModule: mockTranspileModule, ScriptTarget: { ES2020: 2 }, ModuleKind: { None: 0 } },
  transpileModule: mockTranspileModule,
  ScriptTarget: { ES2020: 2 },
  ModuleKind: { None: 0 },
}))

import { useCodeSandbox } from '../composables/useCodeSandbox'

type MessageCallback = (event: MessageEvent) => void
let capturedHandler: MessageCallback | null = null
let capturedIframe: HTMLIFrameElement | null = null

const originalCreateElement = document.createElement.bind(document)

vi.spyOn(window, 'addEventListener').mockImplementation((type: string, handler: any) => {
  if (type === 'message') capturedHandler = handler as MessageCallback
})
vi.spyOn(window, 'removeEventListener').mockImplementation(() => {})

vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
  if (tag !== 'iframe') return originalCreateElement(tag)
  const iframe = originalCreateElement('iframe')
  Object.defineProperty(iframe, 'sandbox', {
    value: { add: vi.fn(), contains: vi.fn(() => true) },
    configurable: true,
  })
  const fakeContentWindow = { postMessage: vi.fn() }
  Object.defineProperty(iframe, 'contentWindow', {
    value: fakeContentWindow,
    configurable: true,
    writable: true,
  })
  capturedIframe = iframe
  return iframe
})

function dispatchOutput(logs: string[]) {
  if (capturedHandler && capturedIframe) {
    capturedHandler(new MessageEvent('message', {
      data: { type: 'code-output', logs },
      source: capturedIframe.contentWindow,
    }))
  }
}

describe('useCodeSandbox', () => {
  beforeEach(() => {
    mockTranspileModule.mockReset()
    capturedHandler = null
    capturedIframe = null
    document.body.innerHTML = ''
  })

  describe('基础守卫', () => {
    it('空代码返回 "(无代码)"', async () => {
      expect(await useCodeSandbox().execute('', 'javascript')).toBe('(无代码)')
    })
    it('空白代码返回 "(无代码)"', async () => {
      expect(await useCodeSandbox().execute('   ', 'javascript')).toBe('(无代码)')
    })
    it('正在执行时返回 "正在执行中..."', async () => {
      const { execute, isRunning } = useCodeSandbox()
      isRunning.value = true
      expect(await execute('1+1', 'javascript')).toBe('正在执行中...')
    })
  })

  describe('JSON 执行', () => {
    it('有效 JSON 返回格式化结果', async () => {
      expect(await useCodeSandbox().execute('{"a":1,"b":[2,3]}', 'json'))
        .toBe(JSON.stringify({ a: 1, b: [2, 3] }, null, 2))
    })
    it('非法 JSON 返回解析错误', async () => {
      expect(await useCodeSandbox().execute('{invalid}', 'json')).toContain('JSON 解析错误')
    })
  })

  describe('Python 执行', () => {
    it('返回 Python 暂未加载提示', async () => {
      expect(await useCodeSandbox().execute('print("hello")', 'python'))
        .toContain('Python 执行需要 Pyodide')
    })
  })

  describe('TypeScript 转译', () => {
    it('成功转译并调用 transpileModule', async () => {
      mockTranspileModule.mockReturnValue({ outputText: 'console.log("ok")' })
      const promise = useCodeSandbox().execute('const x: number = 1', 'typescript')
      await new Promise(r => setTimeout(r, 10))
      expect(mockTranspileModule).toHaveBeenCalled()
      dispatchOutput(['ok'])
      await promise
    })

    it('转译失败返回错误前缀', async () => {
      mockTranspileModule.mockImplementation(() => { throw new Error('类型错误') })
      expect(await useCodeSandbox().execute('const x: number = "str"', 'typescript'))
        .toContain('ERROR: TypeScript 转译失败')
    })
  })

  describe('JavaScript iframe 执行', () => {
    it('创建隐藏 iframe 添加 allow-scripts', async () => {
      const promise = useCodeSandbox().execute('1+1', 'javascript')
      expect(capturedIframe).not.toBeNull()
      expect(capturedIframe!.style.display).toBe('none')
      expect(capturedIframe!.sandbox.add).toHaveBeenCalledWith('allow-scripts')
      dispatchOutput([])
      await promise
    })

    it('成功收到 postMessage 输出', async () => {
      const promise = useCodeSandbox().execute('console.log("hello")', 'javascript')
      dispatchOutput(['hello'])
      expect(await promise).toBe('hello')
    })

    it('发生错误返回 ERROR: 前缀', async () => {
      const promise = useCodeSandbox().execute('throw new Error("test")', 'javascript')
      dispatchOutput(['ERROR: test'])
      expect(await promise).toContain('ERROR:')
    })

    it('多个日志行用换行连接', async () => {
      const promise = useCodeSandbox().execute('1+1', 'javascript')
      dispatchOutput(['line1', 'line2'])
      expect(await promise).toBe('line1\nline2')
    })

    it('无输出时返回 "(无输出)"', async () => {
      const promise = useCodeSandbox().execute('1+1', 'javascript')
      dispatchOutput([])
      expect(await promise).toBe('(无输出)')
    })

    it('isRunning 在执行前后正确切换', async () => {
      const { execute, isRunning } = useCodeSandbox()
      const promise = execute('1+1', 'javascript')
      expect(isRunning.value).toBe(true)
      dispatchOutput(['ok'])
      await promise
      expect(isRunning.value).toBe(false)
    })
  })

  describe('超时处理', () => {
    it('5 秒后超时返回提示', async () => {
      vi.useFakeTimers()
      const { execute } = useCodeSandbox()
      const promise = execute('1+1', 'javascript')
      await vi.advanceTimersByTimeAsync(5000)
      expect(await promise).toBe('执行超时（5秒限制）')
      vi.useRealTimers()
    })
  })

  describe('HTML 注入防护', () => {
    it('代码中的 </script> 被转义为 <\\/script>', async () => {
      const promise = useCodeSandbox().execute('var x = "</script>"', 'javascript')
      const srcdoc = (capturedIframe as any).srcdoc as string
      expect(srcdoc).toContain('<\\/script>')
      expect(srcdoc.split('</script>').length - 1).toBe(1)
      dispatchOutput([])
      await promise
    })
  })
})
