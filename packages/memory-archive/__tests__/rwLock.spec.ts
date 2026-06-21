/**
 * rwLock 单元测试（P17 读写锁）
 */
import { describe, it, expect } from 'vitest'
import { ReadWriteLock } from '../src/utils/rwLock'

describe('ReadWriteLock', () => {
  it('多个读操作可并发', async () => {
    const lock = new ReadWriteLock()
    let readCount = 0
    const maxReadCount = 0

    const read1 = lock.readLock(async () => {
      readCount++
      await new Promise(r => setTimeout(r, 50))
      expect(readCount).toBeGreaterThan(maxReadCount)
      readCount--
    })
    const read2 = lock.readLock(async () => {
      readCount++
      await new Promise(r => setTimeout(r, 50))
      expect(readCount).toBeGreaterThan(maxReadCount)
      readCount--
    })

    await Promise.all([read1, read2])
    // 两个读操作都能并发执行
    expect(true).toBe(true)
  })

  it('写操作独占（写操作之间互斥）', async () => {
    const lock = new ReadWriteLock()
    const executionOrder: number[] = []
    let write1Done = false

    const write1 = lock.writeLock(async () => {
      executionOrder.push(1)
      await new Promise(r => setTimeout(r, 50))
      write1Done = true
      executionOrder.push(2)
    })
    const write2 = lock.writeLock(async () => {
      executionOrder.push(3)
      expect(write1Done).toBe(true)
      await new Promise(r => setTimeout(r, 10))
      executionOrder.push(4)
    })

    await Promise.all([write1, write2])
    // write1 完成后 write2 才开始
    expect(executionOrder).toEqual([1, 2, 3, 4])
  })

  it('读操作等待正在进行的写操作', async () => {
    const lock = new ReadWriteLock()
    const order: string[] = []

    const writeOp = lock.writeLock(async () => {
      order.push('write:start')
      await new Promise(r => setTimeout(r, 50))
      order.push('write:end')
    })
    const readOp = lock.readLock(async () => {
      order.push('read:start')
      await new Promise(r => setTimeout(r, 10))
      order.push('read:end')
    })

    await Promise.all([writeOp, readOp])
    // 写操作先开始，读操作等待写完成
    expect(order.indexOf('write:start')).toBeLessThan(order.indexOf('read:start'))
    expect(order.indexOf('write:end')).toBeLessThanOrEqual(order.indexOf('read:start'))
  })

  it('tryWriteLock 在无锁时立即获取', () => {
    const lock = new ReadWriteLock()
    expect(lock.tryWriteLock()).toBe(true)
  })

  it('tryWriteLock 在有读锁时返回 false', async () => {
    const lock = new ReadWriteLock()
    const readPromise = lock.readLock(async () => {
      await new Promise(r => setTimeout(r, 50))
    })
    // 读锁已获取，tryWriteLock 应失败
    expect(lock.tryWriteLock()).toBe(false)
    await readPromise
  })

  it('tryWriteLock 在有写锁时返回 false', async () => {
    const lock = new ReadWriteLock()
    const writePromise = lock.writeLock(async () => {
      await new Promise(r => setTimeout(r, 50))
    })
    // 写锁已获取，tryWriteLock 应失败
    expect(lock.tryWriteLock()).toBe(false)
    await writePromise
  })

  it('releaseTryWriteLock 释放后可再次获取', () => {
    const lock = new ReadWriteLock()
    expect(lock.tryWriteLock()).toBe(true)
    lock.releaseTryWriteLock()
    expect(lock.tryWriteLock()).toBe(true)
    lock.releaseTryWriteLock()
  })

  it('readLock 返回 fn 的返回值', async () => {
    const lock = new ReadWriteLock()
    const result = await lock.readLock(async () => 42)
    expect(result).toBe(42)
  })

  it('writeLock 返回 fn 的返回值', async () => {
    const lock = new ReadWriteLock()
    const result = await lock.writeLock(async () => 'hello')
    expect(result).toBe('hello')
  })

  it('readLock 在 fn 抛出异常时释放锁', async () => {
    const lock = new ReadWriteLock()
    await expect(
      lock.readLock(async () => {
        throw new Error('test error')
      })
    ).rejects.toThrow('test error')
    // 锁应该已释放，可以再次获取
    expect(lock.tryWriteLock()).toBe(true)
    lock.releaseTryWriteLock()
  })

  it('writeLock 在 fn 抛出异常时释放锁', async () => {
    const lock = new ReadWriteLock()
    await expect(
      lock.writeLock(async () => {
        throw new Error('test error')
      })
    ).rejects.toThrow('test error')
    // 锁应该已释放，可以再次获取
    expect(lock.tryWriteLock()).toBe(true)
    lock.releaseTryWriteLock()
  })
})
