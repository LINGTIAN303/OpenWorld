<template>
  <div class="ws-tree" role="tree">
    <WsTreeNode
      v-for="node in data"
      :key="node[keyField]"
      :node="node"
      :key-field="keyField"
      :label-field="labelField"
      :children-field="childrenField"
      :level="0"
      :selected-keys="selectedKeys"
      :expanded-keys="expandedKeys"
      @toggle="onToggle"
      @select="onSelect"
    >
      <template #default="slotProps"><slot v-bind="slotProps" /></template>
    </WsTreeNode>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import WsTreeNode from './WsTreeNode.vue'

export interface TreeNode {
  [key: string]: any
  children?: TreeNode[]
}

const props = withDefaults(defineProps<{
  data: TreeNode[]
  keyField?: string
  labelField?: string
  childrenField?: string
  defaultExpandAll?: boolean
  selectedKeys?: string[]
}>(), {
  keyField: 'key',
  labelField: 'label',
  childrenField: 'children',
  defaultExpandAll: false,
  selectedKeys: () => [],
})

const emit = defineEmits<{
  select: [node: TreeNode]
  toggle: [key: string, expanded: boolean]
}>()

const expandedKeys = ref<Set<string>>(new Set())

watch(() => props.data, () => {
  if (props.defaultExpandAll) {
    const keys = new Set<string>()
    function walk(nodes: TreeNode[]) {
      for (const n of nodes) {
        keys.add(n[props.keyField])
        const children = n[props.childrenField]
        if (children?.length) walk(children)
      }
    }
    walk(props.data)
    expandedKeys.value = keys
  }
}, { immediate: true })

function onToggle(key: string) {
  const next = new Set(expandedKeys.value)
  if (next.has(key)) next.delete(key); else next.add(key)
  expandedKeys.value = next
  emit('toggle', key, next.has(key))
}

function onSelect(node: TreeNode) {
  emit('select', node)
}
</script>

<style scoped>
.ws-tree { font-size: var(--font-size-sm); }
</style>
