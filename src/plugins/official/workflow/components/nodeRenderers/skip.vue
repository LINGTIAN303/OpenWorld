<script setup lang="ts">
// Skip 节点渲染器 — 条件满足时跳过
import { computed } from 'vue'
import BaseNodeRenderer from './BaseNodeRenderer.vue'
import type { EditorNode } from '../composables/editor-types'
import type { NodeMetadata } from '../composables/useNodeMetadata'

const props = defineProps<{ node: EditorNode; meta: NodeMetadata | null; selected: boolean }>()

const summary = computed(() => {
  const when = String(props.node.config.when ?? '').slice(0, 30)
  return `skip when ${when || '…'}`
})
</script>

<template>
  <BaseNodeRenderer :node="node" :meta="meta" :summary="summary" :selected="selected" icon-emoji="⏭️" />
</template>
