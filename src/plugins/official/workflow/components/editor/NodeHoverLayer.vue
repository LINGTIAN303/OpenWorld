<script setup lang="ts">
// NodeHoverLayer — 节点 hover 浮层(editMethod='hover' 时使用)
//
// P3 新增:鼠标悬停在节点上 hoverDelayMs 毫秒后,显示此浮层。
// 280px 宽,fixed 定位,viewport 溢出时自动 flip 到 anchor 左侧。
// 复用 NodeForm 渲染配置,emit('confirm', config) / emit('cancel')。

import { computed } from 'vue'
import NodeForm from '@/plugins/official/workflow/components/NodeForm.vue'
import { useNodeSchemaSimple } from '@/plugins/official/workflow/composables/useNodeSchema'

interface NodeLike {
  id: string
  type: string
  config?: Record<string, unknown>
}

interface AnchorPoint {
  x: number
  y: number
}

const props = defineProps<{
  node: NodeLike | null
  anchor: AnchorPoint
}>()

const emit = defineEmits<{
  confirm: [config: Record<string, unknown>]
  cancel: []
}>()

const { getFor } = useNodeSchemaSimple()

const LAYER_WIDTH = 280
const GAP = 8
const VIEWPORT_MARGIN = 8

const placement = computed(() => {
  const a = props.anchor
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024
  const wouldOverflow = a.x + LAYER_WIDTH + GAP + VIEWPORT_MARGIN > vw
  if (wouldOverflow) {
    return {
      flip: 'left' as const,
      left: Math.max(0, a.x - LAYER_WIDTH - GAP),
      top: a.y,
    }
  }
  return {
    flip: 'right' as const,
    left: a.x + GAP,
    top: a.y,
  }
})

const schema = computed(() => props.node ? getFor(props.node.type) : null)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="node"
      data-testid="hover-layer"
      :data-flip="placement.flip"
      class="hover-layer"
      :style="{ left: placement.left + 'px', top: placement.top + 'px' }"
    >
      <NodeForm
        v-if="schema"
        :schema="schema"
        :model-value="node.config ?? {}"
        @update:model-value="(c) => emit('confirm', c)"
      />
      <div class="hover-actions">
        <button
          type="button"
          class="hover-btn"
          data-testid="hover-cancel"
          @click="emit('cancel')"
        >
          取消
        </button>
        <button
          type="button"
          class="hover-btn hover-btn--primary"
          data-testid="hover-confirm"
          @click="emit('confirm', node.config ?? {})"
        >
          确认
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.hover-layer {
  position: fixed;
  z-index: 9998;
  width: 280px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  box-shadow: 0 4px 12px var(--color-shadow-medium);
  padding: 8px;
}
.hover-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--color-border-default);
}
.hover-btn {
  background: transparent;
  border: 1px solid var(--color-border-default);
  border-radius: 4px;
  padding: 4px 10px;
  font: inherit;
  font-size: 12px;
  color: var(--color-text-primary);
  cursor: pointer;
}
.hover-btn:hover {
  background: var(--color-bg-hover);
}
.hover-btn--primary {
  background: var(--color-primary);
  color: var(--color-text-on-primary, white);
  border-color: var(--color-primary);
}
</style>
