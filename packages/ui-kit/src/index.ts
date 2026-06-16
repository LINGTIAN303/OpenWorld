// ============================================================================
// @worldsmith/ui-kit — Standalone UI Component Library
// ============================================================================
// This package serves as a FACADE that provides convenient access to all
// UI-related exports, delegating to the appropriate package.
// It should NOT contain business logic itself.
// ============================================================================

// ----------------------------------------------------------------------------
// Ws* Components (Pure UI Atoms) — native to ui-kit
// Currently re-exported from src/ui/; will eventually move into
// packages/ui-kit/src/components/
// ----------------------------------------------------------------------------
export { default as WsIcon } from '../../../src/ui/WsIcon.vue'
export { default as WsEmpty } from '../../../src/ui/WsEmpty.vue'

// ----------------------------------------------------------------------------
// App-Level UI Components — native to ui-kit
// Shell, layout, navigation, and application-level UI
// Currently re-exported from src/ui/; will eventually move into
// packages/ui-kit/src/components/
// ----------------------------------------------------------------------------
export { default as RichTextEditor } from '../../../src/ui/editor/RichTextEditor.vue'
export { default as FloatingPanel } from '../../../src/ui/layout/FloatingPanel.vue'
export { default as ColorPickerDialog } from '../../../src/ui/editor/ColorPickerDialog.vue'
export { default as InfoPanel } from '../../../src/ui/entity/InfoPanel.vue'
export { default as DialogContainer } from '../../../src/ui/layout/DialogContainer.vue'
export { default as Toast } from '../../../src/ui/feedback/Toast.vue'
export { default as Shell } from '../../../src/ui/layout/Shell.vue'
export { default as Sidebar } from '../../../src/ui/layout/Sidebar.vue'
export { default as MenuBar } from '../../../src/ui/layout/MenuBar.vue'
export { default as LayoutManager } from '../../../src/ui/layout/LayoutManager.vue'
export { default as ViewContainer } from '../../../src/ui/layout/ViewContainer.vue'
export { default as GlobalSearch } from '../../../src/ui/search/GlobalSearch.vue'
export { default as SettingsDialog } from '../../../src/ui/settings/SettingsDialog.vue'
export { default as WelcomeOverlay } from '../../../src/ui/layout/WelcomeOverlay.vue'
export { default as ShortcutHelpModal } from '../../../src/ui/settings/ShortcutHelpModal.vue'
export { default as VersionHistory } from '../../../src/ui/data/VersionHistory.vue'
export { default as UndoHistoryPanel } from '../../../src/ui/data/UndoHistoryPanel.vue'
export { default as DocExport } from '../../../src/ui/data/DocExport.vue'
export { default as ExportImportDialog } from '../../../src/ui/data/ExportImportDialog.vue'
export { default as ImportExportModal } from '../../../src/ui/data/ImportExportModal.vue'
export { default as RegionMap } from '../../../src/ui/entity/RegionMap.vue'
export { default as TemplateManager } from '../../../src/ui/entity/TemplateManager.vue'
export { default as CustomModuleView } from '../../../src/ui/entity/CustomModuleView.vue'
export { default as GlobalCaretIndicator } from '../../../src/ui/layout/GlobalCaretIndicator.vue'
export { default as GenericTreeView } from '../../../src/ui/entity/GenericTreeView.vue'
export type { TreeNodeData } from '../../../src/ui/entity/GenericTreeView.vue'
export { default as FontSelector } from '../../../src/ui/font/FontSelector.vue'
export { default as TextRenderPreview } from '../../../src/ui/font/TextRenderPreview.vue'
export { default as FontPreviewPanel } from '../../../src/ui/font/FontPreviewPanel.vue'
export { default as AnimatedFontExportPanel } from '../../../src/ui/font/AnimatedFontExportPanel.vue'

// ----------------------------------------------------------------------------
// Business Components — delegated to @worldsmith/plugin-sdk
// Entity forms, detail fields, relation panels, etc.
// ----------------------------------------------------------------------------
export {
  SchemaRenderer,
  GenericEntityView,
  EntityDetailPanel,
  EntityFormModal,
  DetailField,
  CreateButton,
  CustomDropdown,
  DynamicFieldsAdder,
  UniversalRelationPanel,
  BatchEditModal,
  EntityRelationSelector,
  DynamicEntityView,
  EmptyState,
  LoadingSkeleton,
  ImageField,
  ImageLightbox,
  EntityCardCover,
  EntityCardBack,
} from '@worldsmith/plugin-sdk/components'
export type { FormFieldDef, RelationTabDef, DetailTab } from '@worldsmith/plugin-sdk/components'

// ----------------------------------------------------------------------------
// Entity Composables — delegated to @worldsmith/plugin-sdk
// Entity editing, batch operations, dialog, shortcuts, undo/redo, etc.
// ----------------------------------------------------------------------------
export {
  useEntityEdit,
  type EditFormValues,
  useBatchDelete,
  useDuplicateNameCheck,
  useDialog,
  useConfirm,
  type ConfirmType,
  useResizable,
  getAllPanelWidths,
  resetPanelWidth,
  resetAllPanelWidths,
  PANEL_LABELS,
  type ResizableOptions,
  useHighlight,
  type HighlightOptions,
  useShortcuts,
  formatKeyForDisplay,
  formatKeysForDisplay,
  type ShortcutScope,
  type ShortcutDef,
  type ShortcutConflict,
  useSelection,
  SelectionKey,
  provideGlobalSelection,
  type SelectionState,
} from '@worldsmith/plugin-sdk/composables'

// ----------------------------------------------------------------------------
// Data Composables — delegated to @worldsmith/entity-core
// Smart field links, auto-create entities, bidirectional relations, etc.
// ----------------------------------------------------------------------------
export {
  useSmartFieldLink,
  useAutoCreateEntity,
  useBidirectional,
  deduplicateEdges,
  type MergedEdge,
  useTypeMapping,
  useUndoRedo,
  isUndoing,
  setUndoHistoryProvider,
  useEntityImage,
} from '@worldsmith/entity-core/composables'

// ----------------------------------------------------------------------------
// Canvas Composables — delegated to @worldsmith/canvas-engine
// Canvas state, graph data, algorithms, geometry, etc.
// ----------------------------------------------------------------------------
export { useCanvas, type CanvasState } from '@worldsmith/canvas-engine/core'
export {
  useSmallCanvasGraph,
  type SGNode,
  type SGEdge,
  type SGCamera,
  type SGCallbacks,
} from '@worldsmith/canvas-engine/core'
export { useGraphData, GRAPH_NODE_THRESHOLD, type GraphNode, type GraphEdge } from '@worldsmith/canvas-engine/graph'
export { useGraphFilter, type FilterCriteria } from '@worldsmith/canvas-engine/graph'
export { graphToWeightedGraph, useGraphAlgorithms } from '@worldsmith/canvas-engine/algorithms'
export {
  bridgePointInPolygon,
  bridgeSegmentsIntersect,
  bridgeSimplifyPoints,
  bridgeComputeMergedPolygon,
  bridgeChaikinSmooth,
  bridgeFindLinePolygonIntersections,
  bridgePolygonSplit,
  bridgePolygonAugment,
  bridgeMergePolygons,
  bridgeFindSharedEdges,
} from '@worldsmith/canvas-engine/geometry'

// ----------------------------------------------------------------------------
// App Composables — native to ui-kit
// Toast notifications, floating panels, file system project management
// Currently re-exported from src/composables/; will eventually move into
// packages/ui-kit/src/composables/
// ----------------------------------------------------------------------------
export {
  useToast,
  toastSuccess,
  toastError,
  toastInfo,
  toastWarn,
  toastWithUndo,
  type ToastType,
} from '../../../src/composables/useToast'
export {
  useFloatingPanel,
  Z_INDEX,
  type AnchorCorner,
  type FloatingPanelOptions,
} from '../../../src/composables/useFloatingPanel'
export { useFileSystemProject } from '../../../src/composables/useFileSystemProject'

// ----------------------------------------------------------------------------
// Motion Composables — delegated to @worldsmith/motion-kit
// Animation tokens, keyframes, transitions, reduced-motion, text layout
// ----------------------------------------------------------------------------
export {
  type DurationToken,
  type EasingToken,
  type MotionTokens,
  type SemanticMotionTokens,
  DURATION_VALUES,
  EASING_VALUES,
  CSS_VAR_DURATION,
  CSS_VAR_EASING,
  COSMIC_MOTION_TOKENS,
  cssDuration,
  cssEasing,
  msDuration,
  cssTransition,
  type KeyframeName,
  KEYFRAMES,
  injectKeyframe,
  injectKeyframes,
  injectAllKeyframes,
  getKeyframeCss,
  getAllKeyframeNames,
  type TransitionPresetName,
  type TransitionPreset,
  TRANSITION_PRESETS,
  getPreset,
  getTransitionName,
  getAllPresetNames,
  useReducedMotion,
  isReducedMotion,
  useTransition,
  useTransitionStyle,
  type UseTransitionReturn,
  useMotion,
  type MotionKeyframe,
  type MotionOptions,
  type UseMotionReturn,
  useTextLayout,
  type TextLayoutResult,
  type UseTextLayoutReturn,
  motionKitDescriptor,
} from '@worldsmith/motion-kit'

// ----------------------------------------------------------------------------
// Font Composables — delegated to @worldsmith/font-kit
// Font tokens, registry, loader, renderer, text-to-image export
// ----------------------------------------------------------------------------
export {
  type FontSizeToken,
  type FontWeightToken,
  type LineHeightToken,
  type LetterSpacingToken,
  type FontCategoryToken,
  FONT_SIZE_VALUES,
  FONT_WEIGHT_VALUES,
  LINE_HEIGHT_VALUES,
  LETTER_SPACING_VALUES,
  FONT_FAMILY_VALUES,
  CSS_VAR_FONT_SIZE,
  CSS_VAR_FONT_WEIGHT,
  CSS_VAR_LINE_HEIGHT,
  CSS_VAR_LETTER_SPACING,
  CSS_VAR_FONT_FAMILY,
  type FontTokens,
  type SemanticFontTokens,
  COSMIC_FONT_TOKENS,
  cssFontSize,
  cssFontWeight,
  cssLineHeight,
  cssLetterSpacing,
  cssFontFamily,
  pxFontSize,
  numericWeight,
  numericLineHeight,
  cssFontShorthand,
  type FontEntryStatus,
  type FontSourceUrl,
  type FontSourceBuffer,
  type FontSource,
  type FontEntry,
  type FontQuery,
  register as registerFont,
  unregister as unregisterFont,
  get as getFont,
  list as listFonts,
  findByFamily as findFontsByFamily,
  query as queryFonts,
  loadFont,
  loadFontFromDB,
  unloadFont,
  persistToDB as persistFontToDB,
  loadFromDB as loadFontFromDBStorage,
  removeFromDB as removeFontFromDB,
  listDBKeys as listFontDBKeys,
  type ImageFormat,
  type TextRenderOptions,
  type RenderResult,
  renderText,
  measureText,
  toBlob as fontToBlob,
  toDataURL as fontToDataURL,
  type TextAnimationEffect,
  type AnimatedTextOptions,
  type AnimatedTextResult,
  type AnimatedTextFrame,
  renderAnimatedText,
  useFontRegistry,
  useFontRenderer,
  type UseFontRegistryReturn,
  type UseFontRendererReturn,
  type WsFontPackInput,
  type WsFontManifest,
  type UseFontPackReturn,
  useFontPack,
  WSFONT_VERSION,
  WSFONT_MAGIC,
  WSFONT_EXTENSION,
  type WsFontVariant,
  packWsFont,
  unpackWsFont,
  readWsFontManifest,
  isWsFontFile,
  isTauriAvailable,
  scanSystemFonts,
  readFontFile as readTauriFontFile,
  type TauriSystemFontInfo,
  useSystemFonts,
  type SystemFontInfo,
  type UseSystemFontsReturn,
  fontKitDescriptor,
} from '@worldsmith/font-kit'

// ----------------------------------------------------------------------------
// Animation Capture — delegated to @worldsmith/motion-kit
// Frame capture, GIF encoding, animation capture composable
// ----------------------------------------------------------------------------
export {
  type GifFrame,
  type GifEncodeOptions,
  encodeGif,
  gifFrameFromCanvas,
  type CaptureFrame,
  type CaptureOptions,
  type CaptureResult,
  captureFromCanvas,
  framesToImageDataArray,
  useAnimationCapture,
  type MotionCaptureFrame,
  type MotionCaptureOptions,
  type MotionCaptureResult,
  type UseAnimationCaptureReturn,
} from '@worldsmith/motion-kit'

// ----------------------------------------------------------------------------
// Agent Descriptor — A2UI capabilities for the internal chain registry
// ----------------------------------------------------------------------------
export { uiKitDescriptor } from './agent-descriptor'
