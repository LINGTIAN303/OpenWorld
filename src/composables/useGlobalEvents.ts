import { onMounted, onBeforeUnmount } from 'vue'

type EventHandler = (e: Event) => void

export function useGlobalEvents() {
  const registrations: { event: string; handler: EventHandler }[] = []

  function on(event: string, handler: EventHandler) {
    registrations.push({ event, handler })
  }

  onMounted(() => {
    for (const { event, handler } of registrations) {
      window.addEventListener(event, handler)
    }
  })

  onBeforeUnmount(() => {
    for (const { event, handler } of registrations) {
      window.removeEventListener(event, handler)
    }
    registrations.length = 0
  })

  return { on }
}
