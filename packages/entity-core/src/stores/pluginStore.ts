import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { PluginManifest, PluginView } from '../types/plugin'

export const usePluginStore = defineStore('plugin', () => {
  const plugins = ref<PluginManifest[]>([])
  const views = ref<PluginView[]>([])
  const loading = ref(false)

  function registerView(view: PluginView) {
    if (!views.value.find((v) => v.id === view.id)) {
      views.value.push(view)
    }
  }

  function registerPlugin(manifest: PluginManifest) {
    if (!plugins.value.find((p) => p.id === manifest.id)) {
      plugins.value.push(manifest)
    }
  }

  function getView(id: string): PluginView | undefined {
    return views.value.find((v) => v.id === id)
  }

  return {
    plugins,
    views,
    loading,
    registerView,
    registerPlugin,
    getView,
  }
})
