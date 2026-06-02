<template>
  <n-config-provider :theme-overrides="naiveThemeOverrides" abstract>
    <AgentSpace v-if="uiStore.currentShell === 'space'" />
    <template v-else>
      <Shell />
      <GlobalCaretIndicator />
    </template>
  </n-config-provider>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { NConfigProvider, type GlobalThemeOverrides } from 'naive-ui'
import Shell from './ui/Shell.vue'
import AgentSpace from './space/AgentSpace.vue'
import GlobalCaretIndicator from './ui/GlobalCaretIndicator.vue'
import { pluginManager } from './plugins/PluginManager'
import { usePluginStore, pluginAPI, useEntityStore } from '@worldsmith/entity-core'
import type { ExternalNodeRegistry } from '@worldsmith/entity-core'
import { nodeRegistry } from '../worldsmith-agent/src/workflow/node-registry'
import { useUIStore } from './stores/uiStore'
import { useSettingsStore } from './stores/settingsStore'
import { useTheme } from './composables/useTheme'
import { useAutoCleanup } from '@worldsmith/entity-core/composables'

const { buildNaiveThemeOverrides, currentThemeId } = useTheme()
const uiStore = useUIStore()

const naiveThemeOverrides = ref<GlobalThemeOverrides>(buildNaiveThemeOverrides() as GlobalThemeOverrides)

watch(currentThemeId, () => {
  naiveThemeOverrides.value = buildNaiveThemeOverrides() as GlobalThemeOverrides
})

const pluginLoaders: Record<string, () => Promise<any>> = {
  'official.characters': () => import('./plugins/official/characters/index'),
  'official.regions': () => import('./plugins/official/regions/index'),
  'official.timeline': () => import('./plugins/official/timeline/index'),
  'official.organizations': () => import('./plugins/official/organizations/index'),
  'official.concepts': () => import('./plugins/official/concepts/index'),
  'official.items': () => import('./plugins/official/items/index'),
  'official.mindmap': () => import('./plugins/official/mindmap/index'),
  'official.custom': () => import('./plugins/official/custom/index'),
  'official.module-builder': () => import('./plugins/official/module-builder/index'),
  'official.graph': () => import('./plugins/official/graph/index'),
  'official.buildings': () => import('./plugins/official/buildings/index'),
  'official.species': () => import('./plugins/official/species/index'),
  'official.magic': () => import('./plugins/official/magic/index'),
  'official.outline': () => import('./plugins/official/outline/index'),
  'official.languages': () => import('./plugins/official/languages/index'),
  'official.culture': () => import('./plugins/official/culture/index'),
  'official.conflict': () => import('./plugins/official/conflict/index'),
  'official.inspiration': () => import('./plugins/official/inspiration/index'),
  'official.plants': () => import('./plugins/official/plants/index'),
  'official.combat_stats': () => import('./plugins/official/combat_stats/index'),
  'official.weapons': () => import('./plugins/official/weapons/index'),
  'official.manuscript': () => import('./plugins/official/manuscript/index'),
  'official.drawing': () => import('./plugins/official/drawing/index'),
  'official.tactical-board': () => import('./plugins/official/tactical-board/index'),
  'official.apparel': () => import('./plugins/official/apparel/index'),
  'official.notebook': () => import('./plugins/official/notebook/index'),
  'official.workflow': () => import('./plugins/official/workflow/index'),
}

onMounted(async () => {
  try {

  pluginAPI.setExternalNodeRegistry(nodeRegistry as unknown as ExternalNodeRegistry)

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

  const loadPromises = activeIds
    .filter(id => pluginLoaders[id])
    .map(async id => {
      const mod = await pluginLoaders[id]()
      return { id, instance: mod }
    })

  const loadedPlugins = await Promise.all(loadPromises)

  for (const p of loadedPlugins) {
    await pluginManager.activate(p.instance as any)
  }

  if (pluginStore.views.length > 0) {
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

  const entityStore = useEntityStore()
  entityStore.loadAll()

  Promise.all([
    import('./modules/store').then(m => m.moduleStore.migrateFromLocalStorage()),
    import('./modules/registry').then(m => m.moduleRegistry.initialize()),
  ]).catch(e => console.warn('[App] 模块加载:', e))

  const { runIfNeeded: runAutoCleanup } = useAutoCleanup()
  runAutoCleanup()

  } catch (err) {
    console.warn('[App]', err)
  }
})
</script>

<style>
/* Global styles migrated to design-tokens/component.css */
</style>
