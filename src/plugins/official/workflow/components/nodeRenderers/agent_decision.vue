<script setup lang="ts">
// AgentDecision 节点渲染器 — LLM 决策
import { computed } from 'vue'
import BaseNodeRenderer from './BaseNodeRenderer.vue'
import type { EditorNode } from '../composables/editor-types'
import type { NodeMetadata } from '../composables/useNodeMetadata'

const props = defineProps<{ node: EditorNode; meta: NodeMetadata | null; selected: boolean }>()

const summary = computed(() => {
  const prompt = String(props.node.config.prompt ?? '').slice(0, 30)
  return `? ${prompt || '决策…'}`
})
</script>

<template>
  <BaseNodeRenderer :node="node" :meta="meta" :summary="summary" :selected="selected" icon-emoji="🧠" />
</template>
