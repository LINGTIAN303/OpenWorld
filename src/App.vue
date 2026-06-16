<template>
  <n-config-provider :theme-overrides="naiveThemeOverrides" abstract>
    <n-dialog-provider>
      <n-message-provider>
        <AppMessageHandler>
          <AgentSpace v-if="uiStore.currentShell === 'space'" />
          <template v-else>
            <Shell />
            <GlobalCaretIndicator />
          </template>
        </AppMessageHandler>
      </n-message-provider>
    </n-dialog-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, provide } from 'vue'
import { NConfigProvider, NDialogProvider, NMessageProvider, type GlobalThemeOverrides } from 'naive-ui'
import Shell from './ui/layout/Shell.vue'
import AgentSpace from './space/AgentSpace.vue'
import GlobalCaretIndicator from './ui/layout/GlobalCaretIndicator.vue'
import AppMessageHandler from './ui/companion/AppMessageHandler.vue'
import { pluginManager } from './plugins/PluginManager'
import { usePluginStore, pluginAPI, useEntityStore } from '@worldsmith/entity-core'

import { useUIStore } from './stores/uiStore'
import { useSettingsStore } from './stores/settingsStore'
import { useTheme } from './composables/useTheme'
import { useAutoCleanup } from '@worldsmith/entity-core/composables'
import { useFontBootstrap } from './composables/useFontBootstrap'
import { checkWasmAvailability } from './core/worldsmithCore'
import { provideGlobalSelection, SelectionKey } from '@worldsmith/ui-kit'
import { OFFICIAL_PLUGINS } from './plugins/plugin-manifest'

const { buildNaiveThemeOverrides, currentThemeId } = useTheme()
const uiStore = useUIStore()

const naiveThemeOverrides = ref<GlobalThemeOverrides>(buildNaiveThemeOverrides() as GlobalThemeOverrides)

watch(currentThemeId, () => {
  naiveThemeOverrides.value = buildNaiveThemeOverrides() as GlobalThemeOverrides
})

const settingsStore = useSettingsStore()
watch(() => settingsStore.detailPanelPosition, (pos) => {
  document.documentElement.dataset.detailPanelSide = pos
}, { immediate: true })

/* ── 全局选中状态（provide/inject）── */
const globalSelection = provideGlobalSelection()
provide(SelectionKey, globalSelection)

/* ── 插件加载 ── */
const pluginLoaders: Record<string, () => Promise<any>> = Object.fromEntries(
  OFFICIAL_PLUGINS.map(entry => [
    entry.id,
    () => import(/* @vite-ignore */ `./plugins/official/${entry.importPath}`),
  ])
)

onMounted(async () => {
  try {

  // ★ 项目空间初始化（必须在所有其他初始化之前）
  const { useProjectSwitcher } = await import('./composables/useProjectSwitcher')
  const projectSwitcher = useProjectSwitcher()
  // 不 await：让初始化在后台进行，不阻塞首屏渲染
  projectSwitcher.initialize().then(async () => {
    // 初始化完成后加载实体数据
    const entityStore = useEntityStore()
    entityStore.loadAll()
  }).catch(err => console.warn('[App] 项目初始化:', err))

  // 触发 WASM 可用性检测（异步，不阻塞）
  checkWasmAvailability().catch(() => {})

  const pluginStore = usePluginStore()

  pluginManager.setViewHook((viewId) => {
    const view = pluginAPI.getViews().find(v => v.id === viewId)
    if (view) {
      pluginStore.registerView(view)
    }
    const uiStore = useUIStore()
    uiStore.ensureViewInOrder(viewId)
  })

  const settingsStore = useSettingsStore()
  const activeIds = settingsStore.getActivePluginIds()

  // 全局预注册所有实体类型（确保关系查询不断裂）
  pluginManager.preRegisterAllEntityTypes()

  // 初始化全局关系定义（去重合并）— 不阻塞
  import('@worldsmith/entity-core/relations').then(m => {
    // 将 V2 关系同步到旧版 relationSchemaRegistry
    return import('@worldsmith/entity-core').then(m2 => m2.syncToLegacyRegistry())
  }).catch(e => console.warn('[App] 关系初始化:', e))

  // 迁移旧版 weapon/apparel 实体 — 不阻塞首屏
  import('./core/FacetMigrator').then(async ({ migrateWeaponApparelToItemFacet }) => {
    const report = await migrateWeaponApparelToItemFacet()
    if (!report.skipped) console.info('[App] Facet 迁移完成:', report)
  }).catch(e => console.warn('[App] Facet 迁移:', e))

  // 插件加载 — 并行加载模块，但激活仍需顺序
  const loadPromises = activeIds
    .filter(id => pluginLoaders[id])
    .map(async id => {
      const mod = await pluginLoaders[id]()
      return { id, instance: mod }
    })

  const loadedPlugins = await Promise.all(loadPromises)

  // 尽早设置首屏视图：第一个激活的插件视图立即可用
  let firstViewSet = false
  for (const p of loadedPlugins) {
    await pluginManager.activate(p.instance as any)
    // 每激活一个插件就检查是否已有视图可显示
    if (!firstViewSet && pluginStore.views.length > 0) {
      const uiStore = useUIStore()
      uiStore.setView(pluginStore.views[0].id)
      uiStore.viewComponent = pluginStore.views[0].component
      firstViewSet = true
    }
  }

  // 兜底：如果所有插件激活完仍无视图（理论上不会发生）
  if (!firstViewSet && pluginStore.views.length > 0) {
    const uiStore = useUIStore()
    uiStore.setView(pluginStore.views[0].id)
    uiStore.viewComponent = pluginStore.views[0].component
  }

  window.addEventListener('ws-navigate', ((e: CustomEvent) => {
    const { view: viewId, entityId } = e.detail
    const store = usePluginStore()
    const ui = useUIStore()
    const view = store.getView(viewId)
    if (view) {
      ui.setView(viewId)
      ui.viewComponent = view.component
      if (entityId) {
        ui.selectEntity(entityId)
      }
    }
  }) as EventListener)

  // 模块系统 — 不阻塞首屏
  Promise.all([
    import('./modules/store').then(m => m.moduleStore.migrateFromLocalStorage()),
    import('./modules/registry').then(m => m.moduleRegistry.initialize()),
  ]).catch(e => console.warn('[App] 模块加载:', e))

  const { runIfNeeded: runAutoCleanup } = useAutoCleanup()
  runAutoCleanup()

  /* ── 字体预设加载 ── */
  const { bootstrap: fontBootstrap } = useFontBootstrap()
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => fontBootstrap())
  } else {
    setTimeout(() => fontBootstrap(), 200)
  }

  } catch (err) {
    console.warn('[App]', err)
  }
})
</script>

<style>
/* Global styles migrated to design-tokens/component.css */

/* ── 实体详情面板左右位置切换 ── */
[data-detail-panel-side="left"] .detail-panel {
  right: auto !important;
  left: 0 !important;
  border-left: none !important;
  border-right: 1px solid var(--glass-border, var(--color-border, var(--border))) !important;
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.3) !important;
}
[data-detail-panel-side="left"] .detail-panel .resize-handle-left {
  left: auto !important;
  right: 0 !important;
}
[data-detail-panel-side="left"] .detail-panel.ws-detail-slide-enter-from,
[data-detail-panel-side="left"] .detail-panel.ws-detail-slide-leave-to {
  transform: translateX(-100%) !important;
}
[data-detail-panel-side="left"] .detail-panel.slide-enter-from,
[data-detail-panel-side="left"] .detail-panel.slide-leave-to {
  transform: translateX(-100%) !important;
}
</style>
