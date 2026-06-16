import { shallowRef, triggerRef, type ShallowRef } from 'vue'

/**
 * shallowRef 数组操作工具，避免 .filter()/.map() 创建新数组。
 * 直接修改原数组 + triggerRef，减少响应式开销。
 */
export function useShallowArray<T extends Record<string, any>>(
  keyField: keyof T & string
): {
  items: ShallowRef<T[]>
  setAll: (newItems: T[]) => void
  push: (item: T) => void
  unshift: (item: T) => void
  removeById: (id: T[keyof T]) => void
  updateById: (id: T[keyof T], changes: Partial<T>) => void
  indexOf: (id: T[keyof T]) => number
  findById: (id: T[keyof T]) => T | undefined
  /** 手动触发响应式更新（直接修改 items.value 后调用） */
  trigger: () => void
} {
  const items = shallowRef<T[]>([]) as ShallowRef<T[]>

  function setAll(newItems: T[]) {
    items.value = newItems
  }

  function push(item: T) {
    items.value.push(item)
    triggerRef(items)
  }

  function unshift(item: T) {
    items.value.unshift(item)
    triggerRef(items)
  }

  function removeById(id: T[keyof T]) {
    const idx = items.value.findIndex((e) => (e as any)[keyField] === id)
    if (idx !== -1) {
      items.value.splice(idx, 1)
      triggerRef(items)
    }
  }

  function updateById(id: T[keyof T], changes: Partial<T>) {
    const idx = items.value.findIndex((e) => (e as any)[keyField] === id)
    if (idx !== -1) {
      Object.assign(items.value[idx], changes)
      triggerRef(items)
    }
  }

  function indexOf(id: T[keyof T]): number {
    return items.value.findIndex((e) => (e as any)[keyField] === id)
  }

  function findById(id: T[keyof T]): T | undefined {
    return items.value.find((e) => (e as any)[keyField] === id)
  }

  function trigger() {
    triggerRef(items)
  }

  return { items, setAll, push, unshift, removeById, updateById, indexOf, findById, trigger }
}
