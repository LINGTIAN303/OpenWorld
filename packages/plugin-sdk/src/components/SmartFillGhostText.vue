<template>
  <span
    v-if="visible && suggestion"
    class="sf-ghost-text"
    aria-hidden="true"
  >{{ displayText }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  visible: boolean
  suggestion: string
  currentText: string
}>()

const displayText = computed(() => {
  if (!props.suggestion || !props.currentText) return props.suggestion
  // 如果建议以当前文本开头，只显示追加部分
  if (props.suggestion.startsWith(props.currentText)) {
    return props.suggestion.slice(props.currentText.length)
  }
  return props.suggestion
})
</script>

<style scoped>
.sf-ghost-text {
  color: var(--text-tertiary, rgba(255, 255, 255, 0.35));
  opacity: 0.5;
  pointer-events: none;
  user-select: none;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
