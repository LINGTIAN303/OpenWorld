<script setup lang="ts">
// Parallel 节点渲染器 — 并行 fork-join
import { computed } from 'vue'
import BaseNodeRenderer from './BaseNodeRenderer.vue'
import type { EditorNode } from '../composables/editor-types'
import type { NodeMetadata } from '../composables/useNodeMetadata'

const props = defineProps<{ node: EditorNode; meta: NodeMetadata | null; selected: boolean }>()

const summary = computed(() => {
  const raw = String(props.node.config.branches ?? '').slice(0, 30)
  return raw ? `fork: ${raw}` : '并行分支'
})
</script>

<template>
  <BaseNodeRenderer :node="node" :meta="meta" :summary="summary" :selected="selected" icon-emoji="🍴" />
</template>
