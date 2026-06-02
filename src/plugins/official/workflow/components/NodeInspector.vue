<script setup lang="ts">
// NodeInspector — 右侧检查器
//
// Phase 3.6：选中节点时，按其 configSchema 自动渲染表单。
// - 无选中：显示"请选择节点"提示
// - 选中 start/end：显示只读元数据
// - 选中其它：显示 NodeForm

import { ref, watch, type Ref } from 'vue'
import { getNodeSchema, type NodeMetadata } from '../composables/useNodeMetadata'
import { metadataToFormSchema, type FormSchema } from '../composables/useNodeSchema'
import NodeForm from './NodeForm.vue'

const props = defineProps<{
  node: { id: string; type: string; config: Record<string, unknown> } | null
}>()

const emit = defineEmits<{
  'update:config': [value: Record<string, unknown>]
}>()

const metadata: Ref<NodeMetadata | null> = ref(null)
const schema: Ref<FormSchema | null> = ref(null)

async function refresh(): Promise<void> {
  if (!props.node) {
    metadata.value = null
    schema.value = null
    return
  }
  const m = await getNodeSchema(props.node.type)
  metadata.value = m
  schema.value = m ? metadataToFormSchema(m) : null
}

watch(
  () => props.node?.type,
  () => {
    void refresh()
  },
  { immediate: true },
)

function onConfigUpdate(value: Record<string, unknown>): void {
  emit('update:config', value)
}

function colorFor(): string {
  return metadata.value?.color || '#64748b'
}
</script>

<template>
  <div class="node-inspector">
    <div v-if="!node" class="inspector-empty">
      <p>请选择节点</p>
    </div>
    <div v-else class="inspector-content">
      <header class="inspector-header" :style="{ borderLeftColor: colorFor() }">
        <h3 class="inspector-title">
          {{ metadata?.label || node.type }}
        </h3>
        <p class="inspector-type">{{ node.type }}</p>
        <p v-if="metadata?.description" class="inspector-desc">
          {{ metadata.description }}
        </p>
      </header>
      <div class="inspector-body">
        <NodeForm
          :schema="schema"
          :model-value="node.config"
          @update:model-value="onConfigUpdate"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.node-inspector {
  width: 320px;
  height: 100%;
  background: white;
  border-left: 1px solid #e2e8f0;
  overflow-y: auto;
  box-sizing: border-box;
}
.inspector-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #94a3b8;
  font-size: 13px;
}
.inspector-content {
  display: flex;
  flex-direction: column;
}
.inspector-header {
  padding: 12px 16px;
  border-bottom: 1px solid #e2e8f0;
  border-left: 3px solid;
}
.inspector-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}
.inspector-type {
  margin: 2px 0 0 0;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, monospace;
  color: #94a3b8;
}
.inspector-desc {
  margin: 6px 0 0 0;
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
}
.inspector-body {
  padding: 0 16px;
}
</style>
