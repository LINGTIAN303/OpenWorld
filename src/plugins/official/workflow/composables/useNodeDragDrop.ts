// useNodeDragDrop
//
// P3 新增 add method:"drag" 拖拽添加节点。
// 监听容器的 drop / dragover / dragleave 事件,
// 解析 dataTransfer 的 `application/workflow-node-type` mime 拿到节点类型,
// 记录相对容器的落点坐标(用于编辑器定位)。
//
// 用法:
//   const { handleDrop, handleDragOver, handleDragLeave, lastDrop, isDragOver }
//     = useNodeDragDrop()
//   <div @drop="handleDrop" @dragover="handleDragOver" @dragleave="handleDragLeave" />

import { ref } from 'vue'

export interface DropEvent {
  type: string
  x: number
  y: number
}

export function useNodeDragDrop() {
  const lastDrop = ref<DropEvent | null>(null)
  const isDragOver = ref(false)

  function handleDrop(e: DragEvent): void {
    e.preventDefault()
    isDragOver.value = false
    const type = e.dataTransfer?.getData('application/workflow-node-type') ?? ''
    if (!type) return
    const target = e.currentTarget as Element | null
    const rect = target && typeof target.getBoundingClientRect === 'function'
      ? target.getBoundingClientRect()
      : { left: 0, top: 0 }
    lastDrop.value = {
      type,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }

  function handleDragOver(e: DragEvent): void {
    e.preventDefault()
    isDragOver.value = true
  }

  function handleDragLeave(): void {
    isDragOver.value = false
  }

  return {
    handleDrop,
    handleDragOver,
    handleDragLeave,
    lastDrop,
    isDragOver,
  }
}
