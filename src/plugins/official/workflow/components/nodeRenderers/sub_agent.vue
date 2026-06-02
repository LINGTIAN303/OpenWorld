<script setup lang="ts">
// SubAgent 节点渲染器 — 派生子 Agent
import { computed } from 'vue'
import BaseNodeRenderer from './BaseNodeRenderer.vue'
import type { EditorNode } from '../composables/editor-types'
import type { NodeMetadata } from '../composables/useNodeMetadata'

const props = defineProps<{ node: EditorNode; meta: NodeMetadata | null; selected: boolean }>()

const summary = computed(() => {
  const type = String(props.node.config.agent_type ?? '?')
  const prompt = String(props.node.config.prompt ?? '').slice(0, 24)
  return `agent=${type}${prompt ? ` · ${prompt}` : ''}`
})
</script>

<template>
  <BaseNodeRenderer :node="node" :meta="meta" :summary="summary" :selected="selected" icon-emoji="👥" />
</template>
