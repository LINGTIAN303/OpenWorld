<script setup lang="ts">
// InlineNodeEditor — 节点 inline 编辑表单
//
// P3 新增:跟随节点下方的 3 段折叠编辑(basic / config / advanced)。
// 复用 NodeForm 渲染 config 段,emit('update:config', newConfig) 由父组件接。
// basic / advanced 段占位(节点 metadata 字段后续 P4 再丰富)。

import { computed, ref } from 'vue'
import WsCollapse from '@/ui/WsCollapse.vue'
import NodeForm from '@/plugins/official/workflow/components/NodeForm.vue'
import { useNodeSchema } from '@/plugins/official/workflow/composables/useNodeSchema'

interface NodeLike {
  id: string
  type: string
  config?: Record<string, unknown>
}

const props = defineProps<{
  node: NodeLike
}>()

const emit = defineEmits<{
  'update:config': [config: Record<string, unknown>]
  save: []
  close: []
}>()

const { getFor } = useNodeSchema()
const config = ref<Record<string, unknown>>({ ...(props.node.config ?? {}) })
const schema = computed(() => getFor(props.node.type))

const panels = [
  { key: 'basic', title: '基本信息' },
  { key: 'config', title: '配置' },
  { key: 'advanced', title: '高级' },
]

function onConfigUpdate(newConfig: Record<string, unknown>): void {
  config.value = newConfig
  emit('update:config', newConfig)
}

function onSave(): void {
  emit('update:config', config.value)
  emit('save')
}

function onCancel(): void {
  emit('close')
}
</script>

<template>
  <div class="inline-node-editor" data-testid="inline-node-editor">
    <WsCollapse :panels="panels" :default-expanded="['basic', 'config']">
      <template #basic>
        <div class="inline-section">
          <p class="inline-meta">节点 ID:{{ node.id }}</p>
          <p class="inline-meta">类型:{{ node.type }}</p>
        </div>
      </template>
      <template #config>
        <div class="inline-section">
          <NodeForm
            v-if="schema"
            :schema="schema"
            :model-value="config"
            @update:model-value="onConfigUpdate"
          />
          <p v-else class="inline-meta">该节点无配置项</p>
        </div>
      </template>
      <template #advanced>
        <div class="inline-section">
          <p class="inline-meta">高级选项(P4 接入重试 / 超时 / 错误处理)</p>
        </div>
      </template>
    </WsCollapse>
    <div class="inline-actions">
      <button
        type="button"
        class="inline-btn"
        data-testid="inline-cancel"
        @click="onCancel"
      >
        取消
      </button>
      <button
        type="button"
        class="inline-btn inline-btn--primary"
        data-testid="inline-save"
        @click="onSave"
      >
        保存
      </button>
    </div>
  </div>
</template>

<style scoped>
.inline-node-editor {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 6px;
  min-width: 320px;
  max-width: 480px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  box-shadow: 0 4px 12px var(--color-shadow-medium);
  padding: 8px;
  z-index: 100;
}
.inline-section {
  padding: 8px;
  font-size: 12px;
}
.inline-meta {
  margin: 4px 0;
  color: var(--color-text-secondary);
}
.inline-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--color-border-default);
}
.inline-btn {
  background: transparent;
  border: 1px solid var(--color-border-default);
  border-radius: 4px;
  padding: 4px 10px;
  font: inherit;
  font-size: 12px;
  color: var(--color-text-primary);
  cursor: pointer;
}
.inline-btn:hover {
  background: var(--color-bg-hover);
}
.inline-btn--primary {
  background: var(--color-primary);
  color: var(--color-text-on-primary, white);
  border-color: var(--color-primary);
}
</style>
