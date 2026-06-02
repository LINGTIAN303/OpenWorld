<script setup lang="ts">
// Pivot 节点渲染器 — 数据格式转换
import { computed } from 'vue'
import BaseNodeRenderer from './BaseNodeRenderer.vue'
import type { EditorNode } from '../composables/editor-types'
import type { NodeMetadata } from '../composables/useNodeMetadata'

const props = defineProps<{ node: EditorNode; meta: NodeMetadata | null; selected: boolean }>()

const summary = computed(() => {
  const mapping = String(props.node.config.mapping ?? '').slice(0, 30)
  return mapping ? `map: ${mapping}` : '数据映射'
})
</script>

<template>
  <BaseNodeRenderer :node="node" :meta="meta" :summary="summary" :selected="selected" icon-emoji="🔄" />
</template>
