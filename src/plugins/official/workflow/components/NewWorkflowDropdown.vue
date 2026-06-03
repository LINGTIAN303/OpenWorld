<template>
  <div class="ws-new-dropdown" ref="rootEl">
    <WsButton
      type="primary-gradient"
      size="md"
      data-testid="new-wf-trigger"
      aria-label="新建工作流"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click.stop="toggle"
    >
      <template #icon>
        <span aria-hidden="true">＋</span>
      </template>
      新建工作流
    </WsButton>

    <div
      v-if="open"
      class="ws-new-dropdown__menu"
      data-testid="new-wf-menu"
      role="menu"
    >
      <button
        type="button"
        class="ws-new-dropdown__item"
        data-testid="new-wf-blank"
        role="menuitem"
        @click="onBlank"
      >
        <span class="ws-new-dropdown__item-icon" aria-hidden="true">📄</span>
        <span class="ws-new-dropdown__item-text">
          <span class="ws-new-dropdown__item-title">从空白开始</span>
          <span class="ws-new-dropdown__item-desc">仅含 start / end,可自由拖入节点</span>
        </span>
      </button>
      <button
        type="button"
        class="ws-new-dropdown__item"
        data-testid="new-wf-template"
        role="menuitem"
        @click.stop="onTemplate"
      >
        <span class="ws-new-dropdown__item-icon" aria-hidden="true">🧩</span>
        <span class="ws-new-dropdown__item-text">
          <span class="ws-new-dropdown__item-title">从模板创建</span>
          <span class="ws-new-dropdown__item-desc">选择预制模板快速搭建</span>
        </span>
      </button>
      <button
        type="button"
        class="ws-new-dropdown__item"
        data-testid="new-wf-import"
        role="menuitem"
        @click="onImport"
      >
        <span class="ws-new-dropdown__item-icon" aria-hidden="true">📥</span>
        <span class="ws-new-dropdown__item-text">
          <span class="ws-new-dropdown__item-title">导入 JSON</span>
          <span class="ws-new-dropdown__item-desc">从已有的 JSON 草稿恢复</span>
        </span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import WsButton from '@/ui/WsButton.vue'
import { useNewWorkflow } from '../composables/useNewWorkflow'

const emit = defineEmits<{
  'create-blank': [name: string]
  'create-template': [detail: { templateId: string; name: string }]
  import: []
}>()

const { showDropdown, open: openState, close, createBlank, createFromTemplate } = useNewWorkflow()

const open = showDropdown
const rootEl = ref<HTMLElement | null>(null)
/** 打开时紧随其后的 click 是打开动作本身,需要忽略避免立刻关掉 */
let ignoreNextOutsideClick = false

function toggle(): void {
  if (open.value) {
    close()
  } else {
    ignoreNextOutsideClick = true
    openState()
  }
}

function onBlank(): void {
  emit('create-blank', '未命名工作流')
  close()
}

function onTemplate(): void {
  emit('create-template', { templateId: 'tpl-default', name: '新模板工作流' })
  close()
}

function onImport(): void {
  emit('import')
  close()
}

function handleOutsideClick(e: MouseEvent): void {
  if (ignoreNextOutsideClick) {
    ignoreNextOutsideClick = false
    return
  }
  const target = e.target as Node | null
  if (!target) return
  if (rootEl.value && !rootEl.value.contains(target)) {
    close()
  }
}

function handleEscape(e: KeyboardEvent): void {
  if (e.key === 'Escape' && open.value) close()
}

let listenersAttached = false

function attachGlobalListeners(): void {
  if (listenersAttached || typeof document === 'undefined') return
  listenersAttached = true
  document.addEventListener('click', handleOutsideClick)
  document.addEventListener('keydown', handleEscape)
}

function detachGlobalListeners(): void {
  if (!listenersAttached || typeof document === 'undefined') return
  listenersAttached = false
  document.removeEventListener('click', handleOutsideClick)
  document.removeEventListener('keydown', handleEscape)
}

onMounted(() => {
  // 挂载即绑定,事件级 ignore flag 解决"打开立刻关闭"
  attachGlobalListeners()
})

watch(open, (isOpen) => {
  if (!isOpen) {
    // 关闭时清掉 ignore 标记,避免下次打开时残留
    ignoreNextOutsideClick = false
  }
})

onBeforeUnmount(() => {
  detachGlobalListeners()
})
</script>

<style scoped>
.ws-new-dropdown {
  position: relative;
  display: inline-block;
}
.ws-new-dropdown__menu {
  position: absolute;
  top: calc(100% + var(--space-2));
  left: 0;
  z-index: 50;
  min-width: 280px;
  padding: var(--space-1);
  background: var(--color-bg-elevated, var(--color-bg-primary));
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md, 8px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ws-new-dropdown__item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  text-align: left;
  font-family: var(--font-family-base);
  color: var(--color-text-primary);
  transition: background var(--duration-fast) var(--ease-default);
}
.ws-new-dropdown__item:hover,
.ws-new-dropdown__item:focus-visible {
  background: var(--color-bg-hover, rgba(255, 255, 255, 0.06));
  outline: none;
}
.ws-new-dropdown__item-icon {
  font-size: 18px;
  line-height: 1;
  flex-shrink: 0;
  margin-top: 2px;
}
.ws-new-dropdown__item-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.ws-new-dropdown__item-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
}
.ws-new-dropdown__item-desc {
  font-size: var(--font-size-xs, 11px);
  color: var(--color-text-secondary);
  line-height: 1.4;
}
</style>
