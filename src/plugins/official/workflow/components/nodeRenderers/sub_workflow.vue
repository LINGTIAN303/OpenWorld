<script setup lang="ts">
// SubWorkflow 节点渲染器 — 嵌套子工作流
import { computed } from 'vue'
import BaseNodeRenderer from './BaseNodeRenderer.vue'
import type { EditorNode } from '../composables/editor-types'
import type { NodeMetadata } from '../composables/useNodeMetadata'

const props = defineProps<{ node: EditorNode; meta: NodeMetadata | null; selected: boolean }>()

const summary = computed(() => {
  const id = String(props.node.config.workflow_id ?? '?')
  const ver = props.node.config.version
  return `→ ${id}${ver !== undefined ? ` v${String(ver)}` : ''}`
})
</script>

<template>
  <BaseNodeRenderer :node="node" :meta="meta" :summary="summary" :selected="selected" icon-emoji="🔁" />
</template>
