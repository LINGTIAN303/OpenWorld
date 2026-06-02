import { ref } from 'vue'
import { storage } from '../core'

const STORAGE_KEY_LAST_RUN = 'ws-autocleanup-lastrun'
const INTERVAL_MS = 24 * 60 * 60 * 1000

export function useAutoCleanup() {
  const lastRunAt = ref<number>(
    Number(localStorage.getItem(STORAGE_KEY_LAST_RUN)) || 0
  )

  async function runIfNeeded(): Promise<number> {
    const now = Date.now()
    if (now - lastRunAt.value < INTERVAL_MS) return 0

    let cleaned = 0
    try {
      const all = await storage.kvGetAll()
      for (const [key, value] of all) {
        let shouldDelete = false

        if (key.startsWith('ws-cache:')) {
          try {
            const parsed = JSON.parse(value)
            if (parsed.expiresAt && parsed.expiresAt < now) {
              shouldDelete = true
            }
          } catch {}
        }

        if (key.startsWith('ws-temp:')) {
          try {
            const parsed = JSON.parse(value)
            const age = now - (parsed.createdAt || 0)
            if (age > INTERVAL_MS) {
              shouldDelete = true
            }
          } catch {}
        }

        if (shouldDelete) {
          await storage.kvDelete(key)
          cleaned++
        }
      }

      lastRunAt.value = now
      localStorage.setItem(STORAGE_KEY_LAST_RUN, String(now))
    } catch (e) {
      console.warn('[useAutoCleanup] failed:', e)
    }

    return cleaned
  }

  async function forceRun(): Promise<number> {
    lastRunAt.value = 0
    return runIfNeeded()
  }

  return { lastRunAt, runIfNeeded, forceRun }
}
