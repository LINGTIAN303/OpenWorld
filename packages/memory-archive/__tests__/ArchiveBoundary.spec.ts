/**
 * ArchiveBoundary 单元测试
 */
import { describe, it, expect } from 'vitest'
import { ArchiveBoundary } from '../src/core/ArchiveBoundary'

describe('ArchiveBoundary', () => {
  it('初始边界为 0', () => {
    const boundary = new ArchiveBoundary(400000)
    expect(boundary.current).toBe(0)
  })

  it('shouldArchive 在 token 数达到阈值时返回 true', () => {
    const boundary = new ArchiveBoundary(400000)
    expect(boundary.shouldArchive(400000)).toBe(true)
    expect(boundary.shouldArchive(500000)).toBe(true)
  })

  it('shouldArchive 在 token 数未达阈值时返回 false', () => {
    const boundary = new ArchiveBoundary(400000)
    expect(boundary.shouldArchive(399999)).toBe(false)
    expect(boundary.shouldArchive(0)).toBe(false)
  })

  it('advanceBoundary 推进边界', () => {
    const boundary = new ArchiveBoundary(400000)
    boundary.advanceBoundary(10)
    expect(boundary.current).toBe(10)
    boundary.advanceBoundary(20)
    expect(boundary.current).toBe(20)
  })

  it('advanceBoundary 不回退边界', () => {
    const boundary = new ArchiveBoundary(400000)
    boundary.advanceBoundary(20)
    expect(boundary.current).toBe(20)
    boundary.advanceBoundary(10) // 尝试回退
    expect(boundary.current).toBe(20) // 保持不变
  })

  it('reset 重置边界为 0', () => {
    const boundary = new ArchiveBoundary(400000)
    boundary.advanceBoundary(50)
    expect(boundary.current).toBe(50)
    boundary.reset()
    expect(boundary.current).toBe(0)
  })

  it('restore 恢复边界到指定值', () => {
    const boundary = new ArchiveBoundary(400000)
    boundary.advanceBoundary(30)
    boundary.restore(15)
    expect(boundary.current).toBe(15)
  })

  it('updateThreshold 更新归档阈值', () => {
    const boundary = new ArchiveBoundary(400000)
    expect(boundary.shouldArchive(300000)).toBe(false)
    boundary.updateThreshold(200000)
    expect(boundary.shouldArchive(300000)).toBe(true)
  })
})
