<script setup lang="ts">
// CanvasContextMenu — Canvas 右键菜单
//
// P3 新增:7 个高频节点类型直显 + 1 个折叠入口「更多(N)」。
// 用 useCanvasContextMenu 拿 isOpen / position / close,
// 选中 emit('pick', type),由父组件(WorkflowEditorView) 接收后转 addNode。
//
// 7 直显类型按 spec §5.1 (NodePalette 一致):
//   start / sub_agent / agent_decision / skill / condition / loop / skip
// 折叠入口 emit 'more',由父组件展开完整列表。

import { useCanvasContextMenu } from '../../composables/useCanvasContextMenu'

const emit = defineEmits<{
  pick: [type: string]
}>()

const { isOpen, position, close } = useCanvasContextMenu()

interface MenuEntry {
  type: string
  label: string
}

const directEntries: MenuEntry[] = [
  { type: 'start', label: '开始' },
  { type: 'sub_agent', label: 'Sub Agent' },
  { type: 'agent_decision', label: 'Agent 决策' },
  { type: 'skill', label: '调用 Skill' },
  { type: 'condition', label: '条件分支' },
  { type: 'loop', label: '循环' },
  { type: 'skip', label: '跳过' },
]

function onPick(type: string): void {
  emit('pick', type)
  close()
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      data-testid="canvas-ctx-menu"
      class="canvas-ctx-menu"
      :style="{ left: position.x + 'px', top: position.y + 'px' }"
      @click.stop
    >
      <button
        v-for="entry in directEntries"
        :key="entry.type"
        :data-testid="`ctx-item-${entry.type}`"
        class="ctx-item"
        type="button"
        @click="onPick(entry.type)"
      >
        {{ entry.label }}
      </button>
      <div class="ctx-divider" />
      <button
        data-testid="ctx-item-more"
        class="ctx-item ctx-item--more"
        type="button"
        @click="onPick('more')"
      >
        更多 (7)
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.canvas-ctx-menu {
  position: fixed;
  z-index: 9999;
  min-width: 180px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  box-shadow: 0 4px 16px var(--color-shadow-medium);
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ctx-item {
  display: block;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  padding: 6px 10px;
  font: inherit;
  font-size: 12px;
  color: var(--color-text-primary);
  border-radius: 4px;
  cursor: pointer;
}
.ctx-item:hover {
  background: var(--color-bg-hover);
}
.ctx-item--more {
  color: var(--color-text-secondary);
  font-style: italic;
}
.ctx-divider {
  height: 1px;
  background: var(--color-border-default);
  margin: 2px 0;
}
</style>
