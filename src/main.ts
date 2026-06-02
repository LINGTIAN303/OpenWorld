import './design-tokens/primitive.css'
import './design-tokens/semantic.css'
import './design-tokens/component.css'
import './assets/themes.css'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { fieldRegistry, setUndoHistoryProvider, registerEventBus, registerValidationApi, registerToastApi, registerConfirmApi, registerDialogApi, registerSettingsApi } from '@worldsmith/entity-core'
import { registerBackend } from '@worldsmith/canvas-engine/core'
import * as coreBackend from './core/coreBackend'
import { useSettingsStore } from './stores/settingsStore'
import { eventBus } from './modules/runtime/events'
import { useConfirm, useDialog, injectAllKeyframes } from '@worldsmith/ui-kit'
import { toastSuccess, toastError, toastWarn, toastInfo } from './composables/useToast'

registerBackend({
  getBackendType: coreBackend.getBackendType,
  algoPointInPolygon: coreBackend.algoPointInPolygon,
  algoSegmentIntersect: coreBackend.algoSegmentIntersect,
  algoConvexHull: coreBackend.algoConvexHull,
  algoPolygonSimplify: coreBackend.algoPolygonSimplify,
  algoPolygonBoolean: coreBackend.algoPolygonBoolean,
  algoChaikinSmooth: coreBackend.algoChaikinSmooth,
  algoFindSharedEdges: coreBackend.algoFindSharedEdges,
  algoFindLinePolygonIntersections: coreBackend.algoFindLinePolygonIntersections,
  algoPolygonSplit: coreBackend.algoPolygonSplit,
  algoPolygonAugment: coreBackend.algoPolygonAugment,
  algoDijkstraPath: coreBackend.algoDijkstraPath,
  algoCommunityDetection: coreBackend.algoCommunityDetection,
})

const app = createApp(App)
app.use(createPinia())

registerEventBus(eventBus)

registerValidationApi({
  validateEntity: coreBackend.validateEntity,
  checkReferences: coreBackend.checkReferences,
  getBackendType: coreBackend.getBackendType,
})

registerToastApi({
  success: toastSuccess,
  error: toastError,
  warn: toastWarn,
  info: toastInfo,
})

registerConfirmApi(useConfirm())

registerDialogApi(useDialog())

registerSettingsApi(useSettingsStore())

document.documentElement.setAttribute('data-theme', localStorage.getItem('worldsmith-theme') || 'aurora-abyss')
injectAllKeyframes()
setUndoHistoryProvider(() => useSettingsStore().undoHistoryLimit || 20)
fieldRegistry.loadPersisted()
app.mount('#app')
