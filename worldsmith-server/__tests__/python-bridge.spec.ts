import { describe, it, expect } from 'vitest'
import { PythonBridge, parseServiceConfig } from '../python-bridge'

describe('parseServiceConfig', () => {
  it('应正确解析完整的服务配置', () => {
    const config = parseServiceConfig({
      crawl4ai: { port: 8101, enabled: true },
      markitdown: { port: 8102, enabled: true },
      turbovec: { port: 8103, enabled: false },
    })
    expect(config.crawl4ai.port).toBe(8101)
    expect(config.crawl4ai.enabled).toBe(true)
    expect(config.markitdown.port).toBe(8102)
    expect(config.markitdown.enabled).toBe(true)
    expect(config.turbovec.port).toBe(8103)
    expect(config.turbovec.enabled).toBe(false)
  })

  it('缺失的服务应使用默认值（端口默认，enabled 为 false）', () => {
    const config = parseServiceConfig({
      crawl4ai: { port: 8101, enabled: true },
    })
    expect(config.crawl4ai.port).toBe(8101)
    expect(config.crawl4ai.enabled).toBe(true)
    // markitdown 和 turbovec 应使用默认值
    expect(config.markitdown.port).toBe(8102)
    expect(config.markitdown.enabled).toBe(false)
    expect(config.turbovec.port).toBe(8103)
    expect(config.turbovec.enabled).toBe(false)
  })

  it('空配置应全部使用默认值', () => {
    const config = parseServiceConfig({})
    expect(config.crawl4ai.port).toBe(8101)
    expect(config.crawl4ai.enabled).toBe(false)
    expect(config.markitdown.port).toBe(8102)
    expect(config.markitdown.enabled).toBe(false)
    expect(config.turbovec.port).toBe(8103)
    expect(config.turbovec.enabled).toBe(false)
  })
})

describe('PythonBridge', () => {
  it('应正确构造服务 URL', () => {
    const bridge = new PythonBridge({
      crawl4ai: { port: 8101, enabled: true },
      markitdown: { port: 8102, enabled: true },
      turbovec: { port: 8103, enabled: false },
    })
    expect(bridge.getServiceUrl('crawl4ai')).toBe('http://localhost:8101')
    expect(bridge.getServiceUrl('markitdown')).toBe('http://localhost:8102')
    expect(bridge.getServiceUrl('turbovec')).toBe('http://localhost:8103')
  })

  it('isServiceEnabled 应反映配置状态', () => {
    const bridge = new PythonBridge({
      crawl4ai: { port: 8101, enabled: true },
      markitdown: { port: 8102, enabled: false },
      turbovec: { port: 8103, enabled: false },
    })
    expect(bridge.isServiceEnabled('crawl4ai')).toBe(true)
    expect(bridge.isServiceEnabled('markitdown')).toBe(false)
    expect(bridge.isServiceEnabled('turbovec')).toBe(false)
  })

  it('healthCheck 对未启用的服务应返回 false', async () => {
    const bridge = new PythonBridge({
      crawl4ai: { port: 8101, enabled: false },
      markitdown: { port: 8102, enabled: false },
      turbovec: { port: 8103, enabled: false },
    })
    // 未启用的服务，不需要真正发请求
    const result = await bridge.healthCheck('crawl4ai')
    expect(result).toBe(false)
  })
})
