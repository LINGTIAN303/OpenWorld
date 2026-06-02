import type { WorkflowEvent } from './types'

type EventCallback = (event: WorkflowEvent) => void

export class WorkflowEventEmitter {
  private callbacks: Set<EventCallback> = new Set()

  on(callback: EventCallback): () => void {
    this.callbacks.add(callback)
    return () => this.callbacks.delete(callback)
  }

  emit(event: WorkflowEvent): void {
    for (const cb of this.callbacks) {
      try { cb(event) } catch (err) {
        console.error('[WorkflowEventEmitter] 事件回调异常:', err)
      }
    }
  }

  clear(): void {
    this.callbacks.clear()
  }
}
