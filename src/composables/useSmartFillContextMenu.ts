import { ref, readonly, onMounted, onUnmounted } from 'vue'

export function useSmartFillContextMenu() {
  const visible = ref(false)
  const x = ref(0)
  const y = ref(0)
  const entityType = ref<string | undefined>()
  const entityId = ref<string | undefined>()
  const entityName = ref<string | undefined>()

  function onContextMenu(e: MouseEvent) {
    const target = e.target as Element
    const entityEl = target.closest('[data-entity-id]')
    if (!entityEl) return

    e.preventDefault()
    x.value = e.clientX
    y.value = e.clientY
    entityId.value = entityEl.getAttribute('data-entity-id') || undefined
    entityType.value = entityEl.getAttribute('data-entity-type') || undefined
    entityName.value = entityEl.getAttribute('data-entity-name') || undefined
    visible.value = true
  }

  function onDocumentClick() {
    if (visible.value) {
      visible.value = false
    }
  }

  function close() {
    visible.value = false
  }

  onMounted(() => {
    document.addEventListener('contextmenu', onContextMenu)
    document.addEventListener('click', onDocumentClick)
  })

  onUnmounted(() => {
    document.removeEventListener('contextmenu', onContextMenu)
    document.removeEventListener('click', onDocumentClick)
  })

  return {
    visible: readonly(visible),
    x: readonly(x),
    y: readonly(y),
    entityType: readonly(entityType),
    entityId: readonly(entityId),
    entityName: readonly(entityName),
    close,
  }
}
