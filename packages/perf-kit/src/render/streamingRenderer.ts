import { ref, watch, onBeforeUnmount, type Ref, type WatchSource } from 'vue'
import { rafThrottle } from './rafThrottle'

/**
 * 流式渲染节流器：将高频源数据变化合并为 rAF 级别的渲染更新。
 *
 * 用法：
 *   const displayContent = useStreamingRenderer(() => msg.content)
 *   // template 中使用 displayContent.value 代替 msg.content
 */
export function useStreamingRenderer<T>(
  source: WatchSource<T>,
  options?: { initialValue?: T }
): Ref<T> {
  const display = ref(options?.initialValue) as Ref<T>
  let latest: T | undefined = options?.initialValue

  const update = rafThrottle(() => {
    if (latest !== undefined) display.value = latest
  })

  const stop = watch(source, (val) => {
    latest = val
    update()
  }, { immediate: true })

  onBeforeUnmount(() => {
    stop()
    update.cancel()
  })

  return display
}
