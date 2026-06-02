<template>
  <div
    class="view-container"
    @contextmenu.prevent="onViewContext"
  >
    <div v-if="!hasView" class="view-empty">
      <WsIcon name="globe" :size="56" class="view-empty-icon" />
      <h2>WorldSmith</h2>
      <p>选择一个视图开始管理你的世界观</p>
    </div>
    <Transition name="ws-fade" mode="out-in">
      <component v-if="hasView && viewComp" :is="viewComp" :key="uiStore.currentView + ':' + uiStore.viewRefreshKey" />
    </Transition>
    <div v-if="hasView && !viewComp" class="view-empty">
      <p>视图加载中... ({{ uiStore.currentView }})</p>
    </div>

    <div
      v-if="jumpBackMenu.show"
      class="vc-ctx-menu"
      :style="{ left: jumpBackMenu.x + 'px', top: jumpBackMenu.y + 'px' }"
    >
      <div class="vc-ctx-item" @click="jumpBackToCustom">↩ 跳回自定义视窗</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, provide, toRef, reactive, onBeforeUnmount } from 'vue'
import { useUIStore } from '../stores/uiStore'
import { usePluginStore } from '@worldsmith/entity-core'
import WsIcon from './WsIcon.vue'

const uiStore = useUIStore()
const pluginStore = usePluginStore()
provide('moduleViewId', toRef(uiStore, 'currentView'))

const hasView = computed(() => !!uiStore.currentView)
const viewComp = computed(() => uiStore.viewComponent)

const jumpBackMenu = reactive({ show: false, x: 0, y: 0 })

function onViewContext(e: MouseEvent) {
  if (!uiStore._jumpBackViewId) return
  jumpBackMenu.x = e.clientX
  jumpBackMenu.y = e.clientY
  jumpBackMenu.show = true
  document.addEventListener('click', closeJumpBackMenu, { once: true })
}

function closeJumpBackMenu() {
  jumpBackMenu.show = false
}

function jumpBackToCustom() {
  jumpBackMenu.show = false
  const targetView = uiStore._jumpBackViewId
  if (targetView) {
    uiStore._jumpBackViewId = null
    const v = pluginStore.getView(targetView)
    if (v) uiStore.viewComponent = v.component
    uiStore.setView(targetView)
  }
}

onBeforeUnmount(() => {
  document.removeEventListener('click', closeJumpBackMenu)
})
</script>

<style scoped>
.view-container {
  flex: 1;
  overflow: auto;
  padding: 0;
  background: var(--content-bg);
}
.view-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-secondary);
}
.view-empty-icon {
  font-size: var(--icon-2xl);
  margin-bottom: 16px;
  opacity: 0.5;
}
.view-empty h2 {
  margin: 0 0 8px;
  font-size: var(--font-size-2xl);
  background: var(--gradient-accent);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.view-empty p {
  margin: 0;
  font-size: var(--font-size-base);
}

.vc-ctx-menu {
  position: fixed;
  z-index: 200;
  background: var(--modal-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 4px 0;
  min-width: 160px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
}
.vc-ctx-item {
  padding: 7px 14px;
  font-size: var(--font-size-sm);
  cursor: pointer;
  color: var(--text-color);
  display: flex;
  align-items: center;
  gap: 6px;
}
.vc-ctx-item:hover {
  background: var(--hover-bg);
}
</style>
