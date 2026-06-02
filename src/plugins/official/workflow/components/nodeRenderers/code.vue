<script setup lang="ts">
// Code 节点渲染器 — JS/TS 表达式
import { computed } from 'vue'
import BaseNodeRenderer from './BaseNodeRenderer.vue'
import type { EditorNode } from '../composables/editor-types'
import type { NodeMetadata } from '../composables/useNodeMetadata'

const props = defineProps<{ node: EditorNode; meta: NodeMetadata | null; selected: boolean }>()

const summary = computed(() => {
  const lang = String(props.node.config.language ?? 'js')
  const code = String(props.node.config.code ?? '').slice(0, 30)
  return `${lang}: ${code || '…'}`
})
</script>

<template>
  <BaseNodeRenderer :node="node" :meta="meta" :summary="summary" :selected="selected" icon-emoji="𝑓" />
</template>
