import type {
  CoreValidationReport,
  CoreReferenceCheckResult,
  CoreDiagnosticSummary,
  CoreMigrationResult,
} from './worldsmithCore'

type BackendType = 'tauri' | 'wasm' | 'none'

function wasmCall<T>(fn: () => T, fallback: T): T {
  try {
    const result = fn()
    return result ?? fallback
  } catch {
    return fallback
  }
}

let detectedBackend: BackendType | null = null

function detectBackend(): BackendType {
  if (detectedBackend) return detectedBackend
  try {
    if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
      detectedBackend = 'tauri'
      return 'tauri'
    }
  } catch {}
  try {
    if (typeof window !== 'undefined') {
      const testKey = '__worldsmith_core_wasm_test__'
      const modules = (window as any)[testKey]
      if (modules && typeof modules === 'object') {
        detectedBackend = 'wasm'
        return 'wasm'
      }
    }
  } catch {}
  detectedBackend = 'none'
  return 'none'
}

export function setWasmAvailable(available: boolean): void {
  if (available && detectedBackend === 'none') {
    detectedBackend = 'wasm'
  }
}

export function getBackendType(): BackendType {
  return detectBackend()
}

/* ════════════════════════════════════════
   懒惰加载单例 — 避免每个函数独立 import
   ════════════════════════════════════════ */

type InvokeFn = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
let tauriInvoke: InvokeFn | null = null
async function getTauriInvoke(): Promise<InvokeFn> {
  if (!tauriInvoke) {
    const mod = await import('@tauri-apps/api/core')
    tauriInvoke = mod.invoke
  }
  return tauriInvoke
}

let _corePromise: Promise<unknown> | null = null
async function getCoreCached(): Promise<{ [key: string]: (...args: any[]) => any } | null> {
  if (!_corePromise) {
    _corePromise = (async () => {
      const { getCore } = await import('./worldsmithCore')
      return getCore()
    })()
  }
  return _corePromise as Promise<{ [key: string]: (...args: any[]) => any } | null>
}

async function backendCall<T>(
  tauriCmd: string,
  tauriArgs: Record<string, unknown>,
  wasmMethod: string,
  wasmArgs: unknown[],
  fallback: T,
): Promise<T> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke(tauriCmd, tauriArgs) as Promise<T>
  }
  const core = await getCoreCached()
  if (core && typeof core[wasmMethod] === 'function') {
    return (core[wasmMethod] as Function)(...wasmArgs)
  }
  return fallback
}

export async function validateEntity(
  entityJson: string,
  schemaJson?: string,
): Promise<CoreValidationReport | null> {
  return backendCall(
    'cmd_validate_entity',
    { entityJson, schemaJson: schemaJson ?? null },
    'validateEntity',
    [entityJson, schemaJson],
    null,
  )
}

export async function retrofitDetectConflicts(): Promise<ConflictReport | null> {
  return backendCall(
    'cmd_retrofit_detect_conflicts',
    {},
    'retrofitDetectConflicts',
    [],
    null,
  )
}

export async function retrofitEndSession(): Promise<boolean> {
  return backendCall(
    'cmd_retrofit_end_session',
    {},
    'retrofitEndSession',
    [],
    false,
  )
}

export async function validateEntities(
  entitiesJson: string,
  schemasJson?: string,
): Promise<CoreValidationReport | null> {
  return backendCall(
    'cmd_validate_entities',
    { entitiesJson, schemasJson: schemasJson ?? null },
    'validateEntities',
    [entitiesJson, schemasJson],
    null,
  )
}

export async function validatePack(
  packJson: string,
): Promise<CoreValidationReport | null> {
  return backendCall(
    'cmd_validate_pack',
    { packJson },
    'validatePack',
    [packJson],
    null,
  )
}

export async function checkReferences(
  entitiesJson: string,
  relationsJson: string,
): Promise<CoreReferenceCheckResult | null> {
  return backendCall(
    'cmd_check_references',
    { entitiesJson, relationsJson },
    'checkReferences',
    [entitiesJson, relationsJson],
    null,
  )
}

export async function migrate(
  packJson: string,
  fromVersion: number,
): Promise<{ result: CoreMigrationResult; data: unknown } | null> {
  return backendCall(
    'cmd_migrate',
    { packJson, fromVersion },
    'migrate',
    [packJson, fromVersion],
    null,
  )
}

export async function runDiagnostics(
  entitiesJson: string,
  relationsJson: string,
  schemasJson?: string,
): Promise<CoreDiagnosticSummary | null> {
  return backendCall(
    'cmd_run_diagnostics',
    { entitiesJson, relationsJson, schemasJson: schemasJson ?? null },
    'runDiagnostics',
    [entitiesJson, relationsJson, schemasJson],
    null,
  )
}

export interface StorageHealthReport {
  status: string
  entityCount: number
  relationCount: number
  kvCount: number
  moduleCount: number
  integrityOk: boolean
  issues: string[]
}

export interface ManifestValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export interface PluginHealthReport {
  totalPlugins: number
  activePlugins: number
  manifestIssues: Array<{ pluginId: string; errors: string[]; warnings: string[] }>
  permissionWarnings: string[]
  dependencyConflicts: string[]
}

export async function checkStorageHealth(): Promise<StorageHealthReport | null> {
  const backend = detectBackend()

  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_check_storage_health') as Promise<StorageHealthReport | null>
  }

  return null
}

export async function validatePluginManifest(
  manifestJson: string,
): Promise<ManifestValidationResult | null> {
  const backend = detectBackend()

  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_validate_plugin_manifest', { manifestJson }) as Promise<ManifestValidationResult | null>
  }

  return null
}

export async function checkPluginHealth(
  manifestsJson: string,
  activeIdsJson: string,
): Promise<PluginHealthReport | null> {
  const backend = detectBackend()

  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_check_plugin_health', { manifestsJson, activeIdsJson }) as Promise<PluginHealthReport | null>
  }

  return null
}

export interface SafetyReport {
  allowed: boolean
  intentType: string
  warnings: string[]
  blockedReason: string | null
  preCheckPassed: boolean
  postCheckPassed: boolean | null
}

export interface ConflictEntry {
  intentIndexA: number
  intentIndexB: number
  conflictType: string
  description: string
}

export interface ConflictReport {
  hasConflicts: boolean
  conflicts: ConflictEntry[]
}

export interface ConfirmResult {
  confirmedCount: number
  conflicts: ConflictReport
}

export interface ExecutionResult {
  intentId: string
  success: boolean
  message: string
  sideEffects: string[]
}

export interface ApplyResult {
  changeId: string
  execution: ExecutionResult
}

export interface HealthCheckResult {
  healthy: boolean
  entityCount: number
  relationCount: number
  issues: string[]
}

export interface RetrofitResult {
  sessionId: string
  phase: string
  changesApplied: number
  changesRolledBack: number
  healthCheck: HealthCheckResult | null
  executionResults: ExecutionResult[]
  message: string
}

export type SessionPhase =
  | 'negotiate'
  | 'staging'
  | 'applying'
  | 'verifying'
  | 'accept'
  | 'repair'
  | 'completed'
  | 'aborted'

export interface CapabilityCatalog {
  allowedViewIds: string[]
  allowedEntityTypes: string[]
  allowedRelationTypes: string[]
  allowedFieldModifications: string[]
  allowedActionTargets: string[]
  allowedCssProperties: string[]
  allowedLayoutTargets: string[]
  maxChangesPerSession: number
  requiresConfirmation: string[]
  forbidden: string[]
}

export interface PatchOperation {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test'
  path: string
  value?: unknown
  from?: string
}

export interface PatchDiffResult {
  operations: PatchOperation[]
  tokenEstimate: {
    fullSendTokens: number
    patchTokens: number
    savedTokens: number
    savingRatio: number
    operationCount: number
  }
}

export interface Point2D {
  x: number
  y: number
}

export interface Segment2D {
  start: Point2D
  end: Point2D
}

export interface SpatialItem {
  id: string
  min: [number, number]
  max: [number, number]
  category: string
}

export interface PointItem {
  id: string
  coord: [number, number]
  category: string
}

export interface GraphEdge {
  target: string
  weight: number
  label?: string
}

export interface WeightedGraph {
  adjacency: Record<string, GraphEdge[]>
}

export interface PathResult {
  path: string[]
  totalCost: number
  found: boolean
}

export interface TopologicalSortResult {
  order: string[]
  hasCycle: boolean
  cycleNodes: string[]
}

export interface ConnectedComponentsResult {
  components: string[][]
  count: number
  largestSize: number
}

export interface StronglyConnectedResult {
  components: string[][]
  count: number
  hasCycles: boolean
}

export interface ForceLayoutConfig {
  repulsion?: number
  attraction?: number
  idealLength?: number
  damping?: number
  maxIterations?: number
  epsilon?: number
  area?: number
  gravity?: number
}

export interface LayoutNode {
  id: string
  x: number
  y: number
  vx: number
  vy: number
}

export interface ForceLayoutResult {
  nodes: LayoutNode[]
  iterations: number
  converged: boolean
  totalEnergy: number
}

export interface LWWRegister {
  value: string
  timestamp: number
  nodeId: string
}

export interface ORSet {
  added: Record<string, number>
  removed: string[]
  nodeId: string
  counter: number
}

export interface RGAInsertResult {
  rga: RGA
  insertedId: string
}

export interface RGA {
  nodes: Record<string, RGANode>
  nodeId: string
  counter: number
}

export interface RGANode {
  id: string
  leftId: string | null
  rightId: string | null
  content: string
  deleted: boolean
  timestamp: number
  nodeId: string
}

export interface VectorClock {
  counter: number
  nodeId: string
}

export interface VectorClockCompareResult {
  happensBefore: boolean
  isConcurrent: boolean
}

export interface NoiseConfig {
  seed: number
  scale: number
  octaves: number
  persistence: number
  lacunarity: number
}

export interface HeightMap {
  width: number
  height: number
  data: number[]
}

export interface SlopeResult {
  dx: number
  dy: number
  magnitude: number
}

export interface ContourPoint {
  x: number
  y: number
}

export interface ContourLine {
  level: number
  points: ContourPoint[]
}

export interface ConstraintPoint {
  id: string
  position: Point2D
  free: boolean
}

export interface ConstraintLine {
  id: string
  startId: string
  endId: string
}

export interface Constraint {
  id: string
  constraintType: ConstraintTypeValue
  priority: number
}

export type ConstraintTypeValue =
  | { fixedPoint: { pointId: string; position: Point2D } }
  | { horizontal: { lineId: string } }
  | { vertical: { lineId: string } }
  | { parallel: { lineIdA: string; lineIdB: string } }
  | { perpendicular: { lineIdA: string; lineIdB: string } }
  | { equalLength: { lineIdA: string; lineIdB: string } }
  | { distance: { pointIdA: string; pointIdB: string; distance: number } }
  | { angle: { lineIdA: string; lineIdB: string; angleDeg: number } }
  | { coincident: { pointIdA: string; pointIdB: string } }

export interface ConstraintSystem {
  points: ConstraintPoint[]
  lines: ConstraintLine[]
  constraints: Constraint[]
}

export interface SolveResult {
  solved: boolean
  iterations: number
  residual: number
  violations: string[]
}

export interface ConstraintSolveOutput {
  result: SolveResult
  system: ConstraintSystem
}

export interface DxfEntity {
  entityType: string
  layer: string
  data: DxfEntityData
}

export type DxfEntityData =
  | { line: { start: Point2D; end: Point2D } }
  | { circle: { center: Point2D; radius: number } }
  | { arc: { center: Point2D; radius: number; startAngleDeg: number; endAngleDeg: number } }
  | { lwPolyline: { vertices: Point2D[]; closed: boolean } }
  | { ellipse: { center: Point2D; majorAxisX: number; majorAxisY: number; ratio: number; startParam: number; endParam: number } }
  | { spline: { controlPoints: Point2D[]; degree: number } }
  | { text: { location: Point2D; value: string; height: number } }
  | { unknown: Record<string, never> }

export interface DxfImportResult {
  entities: DxfEntity[]
  constraintSystem: ConstraintSystem
  layerNames: string[]
  warnings: string[]
}

export interface Polygon2DResult {
  exterior: Point2D[]
  interiors: Point2D[][]
}

export interface PageRankResult {
  scores: Record<string, number>
  iterations: number
  converged: boolean
}

export interface Community {
  id: number
  members: string[]
}

export interface CommunityDetectionResult {
  communities: Community[]
  modularity: number
}

export interface BetweennessResult {
  betweenness: Record<string, number>
}

export interface ErosionConfig {
  iterations?: number
  inertia?: number
  capacityFactor?: number
  minSlope?: number
  erosionRate?: number
  depositionRate?: number
  evaporationRate?: number
  gravity?: number
  startWater?: number
  startSpeed?: number
  maxDropletLifetime?: number
}

export interface ViewshedResult {
  visible: boolean[]
  width: number
  height: number
}

export interface SharedEdge {
  edgeIdxA: number
  edgeIdxB: number
  distance: number
}

export interface LinePolygonIntersection {
  point: Point2D
  lineIdx: number
  edgeIdx: number
}

export interface FieldTypeSchema {
  key: string
  label: string
  fieldType: string
  required?: boolean
  defaultValue?: unknown
  options?: { value: string; label: string }[]
  placeholder?: string
  refType?: string
  autoLink?: { targetType: string; relationType: string; searchField?: string; createIfMissing?: boolean }
  animation?: { onChange?: { effect: string; durationMs: number; color?: string }; onState?: { condition: string; effect: string; persistent: boolean } }
}

export interface RelationTypeSchema {
  typeKey: string
  label: string
  sourceTypes: string[]
  targetTypes: string[]
  directed: boolean
}

export interface ViewDeclaration {
  viewType: 'list' | 'tree' | 'graph' | 'timeline' | 'grid'
  config?: Record<string, unknown>
  animation?: { durationMs: number; easing: string; staggerMs: number; enterEffect: string; exitEffect: string }
}

export interface ValidationRule {
  id: string
  description: string
  fieldKey: string
  ruleType: string
  params?: Record<string, unknown>
}

export interface EntityTypeSchema {
  typeKey: string
  label: string
  icon: string
  fields: FieldTypeSchema[]
  relations: RelationTypeSchema[]
  validations: ValidationRule[]
  views: ViewDeclaration[]
  iconMap: Record<string, string>
  idPrefix: string
  pluginId?: string
}

export async function retrofitBeginSession(
  sessionId: string,
  catalog?: CapabilityCatalog,
): Promise<void> {
  const backend = detectBackend()

  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_retrofit_begin_session', {
      sessionId,
      catalogJson: catalog ? JSON.stringify(catalog) : null,
    }) as Promise<void>
  }

  const core = await getCoreCached()
  if (core && typeof core.retrofitBeginSession === 'function') {
    const catalogStr = catalog ? JSON.stringify(catalog) : undefined
    core.retrofitBeginSession(sessionId, catalogStr)
    return
  }
}

export async function retrofitSubmitIntent(
  intentJson: string,
): Promise<SafetyReport | null> {
  return backendCall(
    'cmd_retrofit_submit_intent',
    { intentJson },
    'retrofitSubmitIntent',
    [intentJson],
    null,
  )
}

export async function retrofitConfirmAndStage(): Promise<ConfirmResult | null> {
  return backendCall(
    'cmd_retrofit_confirm_and_stage',
    {},
    'retrofitConfirmAndStage',
    [],
    null,
  )
}

export async function retrofitApplyNext(
  beforeJson: string,
  afterJson: string,
): Promise<ApplyResult | null> {
  return backendCall(
    'cmd_retrofit_apply_next',
    { beforeJson, afterJson },
    'retrofitApplyNext',
    [beforeJson, afterJson],
    null,
  )
}

export async function retrofitVerifyAndAccept(
  entityCount: number,
  relationCount: number,
): Promise<RetrofitResult | null> {
  return backendCall(
    'cmd_retrofit_verify_and_accept',
    { entityCount, relationCount },
    'retrofitVerifyAndAccept',
    [entityCount, relationCount],
    null,
  )
}

export async function retrofitRequestRepair(
  message: string,
): Promise<void> {
  const backend = detectBackend()

  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_retrofit_request_repair', { message }) as Promise<void>
  }

  const core = await getCoreCached()
  if (core && typeof core.retrofitRequestRepair === 'function') {
    core.retrofitRequestRepair(message)
    return
  }
}

export async function retrofitRedirect(
  message: string,
): Promise<void> {
  const backend = detectBackend()

  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_retrofit_redirect', { message }) as Promise<void>
  }

  const core = await getCoreCached()
  if (core && typeof core.retrofitRedirect === 'function') {
    core.retrofitRedirect(message)
    return
  }
}

export async function retrofitRollbackLast(): Promise<string | null> {
  return backendCall(
    'cmd_retrofit_rollback_last',
    {},
    'retrofitRollbackLast',
    [],
    null,
  )
}

export async function retrofitAbort(): Promise<string[]> {
  return backendCall(
    'cmd_retrofit_abort',
    {},
    'retrofitAbort',
    [],
    [],
  )
}

export async function retrofitSessionPhase(): Promise<SessionPhase | null> {
  return backendCall(
    'cmd_retrofit_session_phase',
    {},
    'retrofitSessionPhase',
    [],
    null,
  )
}

export async function retrofitPatchDiff(
  beforeJson: string,
  afterJson: string,
): Promise<PatchDiffResult | null> {
  return backendCall(
    'cmd_retrofit_patch_diff',
    { beforeJson, afterJson },
    'patchDiff',
    [beforeJson, afterJson],
    null,
  )
}

export async function retrofitPatchApply(
  docJson: string,
  patchJson: string,
): Promise<string | null> {
  return backendCall(
    'cmd_retrofit_patch_apply',
    { docJson, patchJson },
    'patchApply',
    [docJson, patchJson],
    null,
  )
}

// ── 空间索引 API ──

export async function spatialInsertRect(item: SpatialItem): Promise<void> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_spatial_insert_rect', { itemJson: JSON.stringify(item) }) as Promise<void>
  }
  // WASM path: spatial index not available in WASM
}

export async function spatialInsertPoint(item: PointItem): Promise<void> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_spatial_insert_point', { itemJson: JSON.stringify(item) }) as Promise<void>
  }
}

export async function spatialQueryRange(min: [number, number], max: [number, number]): Promise<SpatialItem[]> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_spatial_query_range', { minJson: JSON.stringify(min), maxJson: JSON.stringify(max) }) as Promise<SpatialItem[]>
  }
  return []
}

export async function spatialQueryAtPoint(point: [number, number]): Promise<SpatialItem[]> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_spatial_query_at_point', { pointJson: JSON.stringify(point) }) as Promise<SpatialItem[]>
  }
  return []
}

export async function spatialNearestPoint(query: [number, number]): Promise<PointItem | null> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_spatial_nearest_point', { queryJson: JSON.stringify(query) }) as Promise<PointItem | null>
  }
  return null
}

export async function spatialKNearest(query: [number, number], k: number): Promise<PointItem[]> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_spatial_k_nearest', { queryJson: JSON.stringify(query), k }) as Promise<PointItem[]>
  }
  return []
}

export async function spatialQueryByCategory(category: string): Promise<SpatialItem[]> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_spatial_query_by_category', { category }) as Promise<SpatialItem[]>
  }
  return []
}

export async function spatialRemoveRect(item: SpatialItem): Promise<boolean> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_spatial_remove_rect', { itemJson: JSON.stringify(item) }) as Promise<boolean>
  }
  return false
}

export async function spatialClear(): Promise<void> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_spatial_clear') as Promise<void>
  }
}

export async function spatialCounts(): Promise<{ rectCount: number; pointCount: number }> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_spatial_counts') as Promise<{ rectCount: number; pointCount: number }>
  }
  return { rectCount: 0, pointCount: 0 }
}

// ── 几何算法 API ──

export async function algoSegmentIntersect(seg1: Segment2D, seg2: Segment2D): Promise<boolean> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_algo_segment_intersect', { seg1Json: JSON.stringify(seg1), seg2Json: JSON.stringify(seg2) }) as Promise<boolean>
  }
  const core = await getCoreCached()
  return wasmCall(() => core!.algoSegmentIntersect(seg1, seg2), false)
}

export async function algoFindAllIntersections(segments: Segment2D[]): Promise<string> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_algo_find_all_intersections', { segmentsJson: JSON.stringify(segments) }) as Promise<string>
  }
  const core = await getCoreCached()
  return wasmCall(() => core!.algoFindAllIntersections(segments), '[]')
}

export async function algoPointInPolygon(point: Point2D, vertices: Point2D[]): Promise<boolean> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_algo_point_in_polygon', { pointJson: JSON.stringify(point), verticesJson: JSON.stringify(vertices) }) as Promise<boolean>
  }
  const core = await getCoreCached()
  return wasmCall(() => core!.algoPointInPolygon(point, vertices), false)
}

export async function algoPolygonArea(vertices: Point2D[]): Promise<number> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_algo_polygon_area', { verticesJson: JSON.stringify(vertices) }) as Promise<number>
  }
  const core = await getCoreCached()
  return wasmCall(() => core!.algoPolygonArea(vertices), 0)
}

export async function algoConvexHull(points: Point2D[]): Promise<Point2D[]> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_algo_convex_hull', { pointsJson: JSON.stringify(points) }) as Promise<Point2D[]>
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoConvexHull(points)), [] as Point2D[])
}

export async function algoAabbIntersects(a: { min: Point2D; max: Point2D }, b: { min: Point2D; max: Point2D }): Promise<boolean> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_algo_aabb_intersects', { aJson: JSON.stringify(a), bJson: JSON.stringify(b) }) as Promise<boolean>
  }
  const core = await getCoreCached()
  return wasmCall(() => core!.algoAabbIntersects(a, b), false)
}

export async function algoObbIntersects(a: { center: Point2D; halfExtents: [number, number]; rotation: number }, b: { center: Point2D; halfExtents: [number, number]; rotation: number }): Promise<boolean> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_algo_obb_intersects', { aJson: JSON.stringify(a), bJson: JSON.stringify(b) }) as Promise<boolean>
  }
  const core = await getCoreCached()
  return wasmCall(() => core!.algoObbIntersects(a, b), false)
}

// ── 图算法 API ──

export async function algoDijkstraPath(graph: WeightedGraph, source: string, target: string): Promise<PathResult> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_algo_dijkstra_path', { graphJson: JSON.stringify(graph), source, target }) as Promise<PathResult>
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoDijkstraPath(graph, source, target)), { path: [], totalCost: 0, found: false })
}

export async function algoAstar(graph: WeightedGraph, source: string, target: string, heuristic: Record<string, number>): Promise<PathResult> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_algo_astar', { graphJson: JSON.stringify(graph), source, target, heuristicJson: JSON.stringify(heuristic) }) as Promise<PathResult>
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoAstar(graph, source, target, heuristic)), { path: [], totalCost: 0, found: false })
}

export async function algoTopologicalSort(graph: WeightedGraph): Promise<TopologicalSortResult> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_algo_topological_sort', { graphJson: JSON.stringify(graph) }) as Promise<TopologicalSortResult>
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoTopologicalSort(graph)), { order: [], hasCycle: false, cycleNodes: [] })
}

export async function algoConnectedComponents(graph: WeightedGraph): Promise<ConnectedComponentsResult> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_algo_connected_components', { graphJson: JSON.stringify(graph) }) as Promise<ConnectedComponentsResult>
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoConnectedComponents(graph)), { components: [], count: 0, largestSize: 0 })
}

export async function algoTarjanScc(graph: WeightedGraph): Promise<StronglyConnectedResult> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_algo_tarjan_scc', { graphJson: JSON.stringify(graph) }) as Promise<StronglyConnectedResult>
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoTarjanScc(graph)), { components: [], count: 0, hasCycles: false })
}

export async function algoForceLayout(graph: WeightedGraph, config?: ForceLayoutConfig): Promise<ForceLayoutResult> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_algo_force_layout', { graphJson: JSON.stringify(graph), configJson: config ? JSON.stringify(config) : null }) as Promise<ForceLayoutResult>
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoForceLayout(graph, config)), { nodes: [], iterations: 0, converged: false, totalEnergy: 0 })
}

export async function algoCrdtLwwNew(value: string, nodeId: string): Promise<LWWRegister> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    const json = await invoke('cmd_algo_crdt_lww_new', { value, nodeId }) as string
    return JSON.parse(json)
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoCrdtLwwNew(value, nodeId)), { value: '', timestamp: 0, nodeId: '' } as LWWRegister)
}

export async function algoCrdtLwwSet(registerJson: string, value: string, timestamp: number): Promise<LWWRegister> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    const json = await invoke('cmd_algo_crdt_lww_set', { registerJson, value, timestamp }) as string
    return JSON.parse(json)
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoCrdtLwwSet(registerJson, value, timestamp)), { value: '', timestamp: 0, nodeId: '' } as LWWRegister)
}

export async function algoCrdtLwwMerge(registerJson: string, otherJson: string): Promise<LWWRegister> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    const json = await invoke('cmd_algo_crdt_lww_merge', { registerJson, otherJson }) as string
    return JSON.parse(json)
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoCrdtLwwMerge(registerJson, otherJson)), { value: '', timestamp: 0, nodeId: '' } as LWWRegister)
}

export async function algoCrdtOrsetNew(nodeId: string): Promise<ORSet> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    const json = await invoke('cmd_algo_crdt_orset_new', { nodeId }) as string
    return JSON.parse(json)
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoCrdtOrsetNew(nodeId)), { added: {}, removed: [], nodeId: '', counter: 0 } as ORSet)
}

export async function algoCrdtOrsetAdd(setJson: string, element: string): Promise<ORSet> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    const json = await invoke('cmd_algo_crdt_orset_add', { setJson, element }) as string
    return JSON.parse(json)
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoCrdtOrsetAdd(setJson, element)), { added: {}, removed: [], nodeId: '', counter: 0 } as ORSet)
}

export async function algoCrdtOrsetRemove(setJson: string, element: string): Promise<ORSet> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    const json = await invoke('cmd_algo_crdt_orset_remove', { setJson, element }) as string
    return JSON.parse(json)
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoCrdtOrsetRemove(setJson, element)), { added: {}, removed: [], nodeId: '', counter: 0 } as ORSet)
}

export async function algoCrdtOrsetMerge(setJson: string, otherJson: string): Promise<ORSet> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    const json = await invoke('cmd_algo_crdt_orset_merge', { setJson, otherJson }) as string
    return JSON.parse(json)
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoCrdtOrsetMerge(setJson, otherJson)), { added: {}, removed: [], nodeId: '', counter: 0 } as ORSet)
}

export async function algoCrdtOrsetElements(setJson: string): Promise<string[]> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_algo_crdt_orset_elements', { setJson }) as Promise<string[]>
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoCrdtOrsetElements(setJson)), [] as string[])
}

export async function algoCrdtRgaNew(nodeId: string): Promise<RGA> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    const json = await invoke('cmd_algo_crdt_rga_new', { nodeId }) as string
    return JSON.parse(json)
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoCrdtRgaNew(nodeId)), { nodes: {}, nodeId: '', counter: 0 } as RGA)
}

export async function algoCrdtRgaInsert(rgaJson: string, index: number, content: string): Promise<RGAInsertResult> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_algo_crdt_rga_insert', { rgaJson, index, content }) as Promise<RGAInsertResult>
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoCrdtRgaInsert(rgaJson, index, content)), { rga: { nodes: {}, nodeId: '', counter: 0 }, insertedId: '' } as RGAInsertResult)
}

export async function algoCrdtRgaDelete(rgaJson: string, id: string): Promise<RGA> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    const json = await invoke('cmd_algo_crdt_rga_delete', { rgaJson, id }) as string
    return JSON.parse(json)
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoCrdtRgaDelete(rgaJson, id)), { nodes: {}, nodeId: '', counter: 0 } as RGA)
}

export async function algoCrdtRgaMerge(rgaJson: string, otherJson: string): Promise<RGA> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    const json = await invoke('cmd_algo_crdt_rga_merge', { rgaJson, otherJson }) as string
    return JSON.parse(json)
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoCrdtRgaMerge(rgaJson, otherJson)), { nodes: {}, nodeId: '', counter: 0 } as RGA)
}

export async function algoCrdtRgaText(rgaJson: string): Promise<string> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_algo_crdt_rga_text', { rgaJson }) as Promise<string>
  }
  const core = await getCoreCached()
  return wasmCall(() => core!.algoCrdtRgaText(rgaJson), '')
}

export async function algoCrdtVcCompare(clockAJson: string, clockBJson: string): Promise<VectorClockCompareResult> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_algo_crdt_vc_compare', { clockAJson, clockBJson }) as Promise<VectorClockCompareResult>
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoCrdtVcCompare(clockAJson, clockBJson)), { happensBefore: false, isConcurrent: false })
}

export async function algoTerrainNoise(x: number, y: number, config?: NoiseConfig): Promise<number> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_algo_terrain_noise', { x, y, configJson: config ? JSON.stringify(config) : null }) as Promise<number>
  }
  const core = await getCoreCached()
  return wasmCall(() => core!.algoTerrainNoise(x, y, config ? JSON.stringify(config) : undefined), 0)
}

export async function algoTerrainHeightmapGenerate(config: NoiseConfig | undefined, width: number, height: number, offsetX: number, offsetY: number): Promise<HeightMap> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    const json = await invoke('cmd_algo_terrain_heightmap_generate', { configJson: config ? JSON.stringify(config) : null, width, height, offsetX, offsetY }) as string
    return JSON.parse(json)
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoTerrainHeightmapGenerate(config ? JSON.stringify(config) : undefined, width, height, offsetX, offsetY)), { width: 0, height: 0, data: [] } as HeightMap)
}

export async function algoTerrainHeightmapSlope(heightmapJson: string, x: number, y: number): Promise<SlopeResult> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_algo_terrain_heightmap_slope', { heightmapJson, x, y }) as Promise<SlopeResult>
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoTerrainHeightmapSlope(heightmapJson, x, y)), { dx: 0, dy: 0, magnitude: 0 })
}

export async function algoTerrainHeightmapAspect(heightmapJson: string, x: number, y: number): Promise<number> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_algo_terrain_heightmap_aspect', { heightmapJson, x, y }) as Promise<number>
  }
  const core = await getCoreCached()
  return wasmCall(() => core!.algoTerrainHeightmapAspect(heightmapJson, x, y), 0)
}

export async function algoTerrainMarchingSquares(heightmapJson: string, levels: number[]): Promise<ContourLine[]> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    const result = await invoke('cmd_algo_terrain_marching_squares', { heightmapJson, levelsJson: JSON.stringify(levels) }) as ContourLine[]
    return result
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoTerrainMarchingSquares(heightmapJson, levels)), [] as ContourLine[])
}

export async function algoConstraintSolve(systemJson: string, maxIterations: number, tolerance: number): Promise<ConstraintSolveOutput> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_algo_constraint_solve', { systemJson, maxIterations, tolerance }) as Promise<ConstraintSolveOutput>
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoConstraintSolve(systemJson, maxIterations, tolerance)), { result: { solved: false, iterations: 0, residual: 0, violations: [] }, system: { points: [], lines: [], constraints: [] } } as ConstraintSolveOutput)
}

export async function algoDxfParse(content: string): Promise<DxfImportResult> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_algo_dxf_parse', { content }) as Promise<DxfImportResult>
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoDxfParse(content)), { entities: [], constraintSystem: { points: [], lines: [], constraints: [] }, layerNames: [], warnings: [] } as DxfImportResult)
}

export async function algoDxfGenerate(entities: DxfEntity[]): Promise<string> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_algo_dxf_generate', { entitiesJson: JSON.stringify(entities) }) as Promise<string>
  }
  const core = await getCoreCached()
  return wasmCall(() => core!.algoDxfGenerate(JSON.stringify(entities)), '')
}

export async function algoDxfExtractConstraints(systemJson: string): Promise<Constraint[]> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_algo_dxf_extract_constraints', { systemJson }) as Promise<Constraint[]>
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoDxfExtractConstraints(systemJson)), [] as Constraint[])
}

export async function algoPolygonBoolean(op: 'union' | 'intersection' | 'difference' | 'xor', a: Polygon2DResult, b: Polygon2DResult): Promise<Polygon2DResult[]> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_algo_polygon_boolean', { op, aJson: JSON.stringify(a), bJson: JSON.stringify(b) }) as Promise<Polygon2DResult[]>
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoPolygonBoolean(op, JSON.stringify(a), JSON.stringify(b))), [] as Polygon2DResult[])
}

export async function algoPolygonOffset(polygon: Polygon2DResult, delta: number): Promise<Polygon2DResult> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    const json = await invoke('cmd_algo_polygon_offset', { polygonJson: JSON.stringify(polygon), delta }) as string
    return JSON.parse(json)
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoPolygonOffset(JSON.stringify(polygon), delta)), { exterior: [], interiors: [] } as Polygon2DResult)
}

export async function algoPolygonSimplify(polygon: Polygon2DResult, epsilon: number): Promise<Polygon2DResult> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    const json = await invoke('cmd_algo_polygon_simplify', { polygonJson: JSON.stringify(polygon), epsilon }) as string
    return JSON.parse(json)
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoPolygonSimplify(JSON.stringify(polygon), epsilon)), { exterior: [], interiors: [] } as Polygon2DResult)
}

export async function algoLineLength(points: Point2D[]): Promise<number> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_algo_line_length', { pointsJson: JSON.stringify(points) }) as Promise<number>
  }
  const core = await getCoreCached()
  return wasmCall(() => core!.algoLineLength(JSON.stringify(points)), 0)
}

export async function algoPageRank(graphJson: string, damping: number, maxIterations: number, tolerance: number): Promise<PageRankResult> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_algo_pagerank', { graphJson, damping, maxIterations, tolerance }) as Promise<PageRankResult>
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoPageRank(graphJson, damping, maxIterations, tolerance)), { scores: {}, iterations: 0, converged: false })
}

export async function algoCommunityDetection(graphJson: string): Promise<CommunityDetectionResult> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_algo_community_detection', { graphJson }) as Promise<CommunityDetectionResult>
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoCommunityDetection(graphJson)), { communities: [], modularity: 0 })
}

export async function algoBetweennessCentrality(graphJson: string): Promise<BetweennessResult> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_algo_betweenness_centrality', { graphJson }) as Promise<BetweennessResult>
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoBetweennessCentrality(graphJson)), { betweenness: {} })
}

export async function algoHydraulicErosion(heightmapJson: string, config?: ErosionConfig): Promise<HeightMap> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    const json = await invoke('cmd_algo_hydraulic_erosion', { heightmapJson, configJson: config ? JSON.stringify(config) : null }) as string
    return JSON.parse(json)
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoHydraulicErosion(heightmapJson, config ? JSON.stringify(config) : undefined)), { width: 0, height: 0, data: [] } as HeightMap)
}

export async function algoViewshed(heightmapJson: string, observerX: number, observerY: number, observerHeight: number, radius: number): Promise<ViewshedResult> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_algo_viewshed', { heightmapJson, observerX, observerY, observerHeight, radius }) as Promise<ViewshedResult>
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoViewshed(heightmapJson, observerX, observerY, observerHeight, radius)), { visible: [], width: 0, height: 0 })
}

export async function algoChaikinSmooth(vertices: Point2D[], iterations: number): Promise<Point2D[]> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    const json = await invoke('cmd_algo_chaikin_smooth', { verticesJson: JSON.stringify(vertices), iterations }) as string
    return JSON.parse(json)
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoChaikinSmooth(JSON.stringify(vertices), iterations)), [] as Point2D[])
}

export async function algoFindSharedEdges(verticesA: Point2D[], verticesB: Point2D[], threshold: number): Promise<SharedEdge[]> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_algo_find_shared_edges', { verticesAJson: JSON.stringify(verticesA), verticesBJson: JSON.stringify(verticesB), threshold }) as Promise<SharedEdge[]>
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoFindSharedEdges(JSON.stringify(verticesA), JSON.stringify(verticesB), threshold)), [] as SharedEdge[])
}

export async function algoFindLinePolygonIntersections(line: Point2D[], polygon: Point2D[]): Promise<LinePolygonIntersection[]> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_algo_find_line_polygon_intersections', { lineJson: JSON.stringify(line), polygonJson: JSON.stringify(polygon) }) as Promise<LinePolygonIntersection[]>
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoFindLinePolygonIntersections(JSON.stringify(line), JSON.stringify(polygon))), [] as LinePolygonIntersection[])
}

export async function algoPolygonSplit(polygon: Point2D[], cuttingLine: Point2D[]): Promise<Point2D[][]> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_algo_polygon_split', { polygonJson: JSON.stringify(polygon), cuttingLineJson: JSON.stringify(cuttingLine) }) as Promise<Point2D[][]>
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoPolygonSplit(JSON.stringify(polygon), JSON.stringify(cuttingLine))), [] as Point2D[][])
}

export async function algoPolygonAugment(polygon: Point2D[], addingLine: Point2D[]): Promise<Point2D[]> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    const json = await invoke('cmd_algo_polygon_augment', { polygonJson: JSON.stringify(polygon), addingLineJson: JSON.stringify(addingLine) }) as string
    return JSON.parse(json)
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.algoPolygonAugment(JSON.stringify(polygon), JSON.stringify(addingLine))), [] as Point2D[])
}

export async function schemaRegisterEntityType(schemaJson: string): Promise<EntityTypeSchema> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    const result = await invoke('cmd_schema_register_entity_type', { schemaJson }) as string
    return JSON.parse(result)
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.schemaRegisterEntityType(schemaJson)), { typeKey: '', label: '', icon: '', fields: [], relations: [], validations: [], views: [], iconMap: {}, idPrefix: '' } as EntityTypeSchema)
}

export async function schemaUnregisterEntityType(typeKey: string): Promise<void> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_schema_unregister_entity_type', { typeKey }) as Promise<void>
  }
  const core = await getCoreCached()
  wasmCall(() => { core!.schemaUnregisterEntityType(typeKey) }, undefined)
}

export async function schemaGetEntityType(typeKey: string): Promise<EntityTypeSchema | null> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    const result = await invoke('cmd_schema_get_entity_type', { typeKey }) as string
    return JSON.parse(result)
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.schemaGetEntityType(typeKey)), null)
}

export async function schemaListEntityTypes(): Promise<EntityTypeSchema[]> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    const result = await invoke('cmd_schema_list_entity_types') as string
    return JSON.parse(result)
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.schemaListEntityTypes()), [] as EntityTypeSchema[])
}

export async function schemaUpdateEntityType(typeKey: string, updatesJson: string): Promise<EntityTypeSchema> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    const result = await invoke('cmd_schema_update_entity_type', { typeKey, updatesJson }) as string
    return JSON.parse(result)
  }
  const core = await getCoreCached()
  return wasmCall(() => JSON.parse(core!.schemaUpdateEntityType(typeKey, updatesJson)), { typeKey: '', label: '', icon: '', fields: [], relations: [], validations: [], views: [], iconMap: {}, idPrefix: '' } as EntityTypeSchema)
}

export async function schemaRegisterValidation(typeKey: string, ruleJson: string): Promise<void> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_schema_register_validation', { typeKey, ruleJson }) as Promise<void>
  }
  const core = await getCoreCached()
  wasmCall(() => { core!.schemaRegisterValidation(typeKey, ruleJson) }, undefined)
}

export async function schemaRegisterView(typeKey: string, viewJson: string): Promise<void> {
  const backend = detectBackend()
  if (backend === 'tauri') {
    const invoke = await getTauriInvoke()
    return invoke('cmd_schema_register_view', { typeKey, viewJson }) as Promise<void>
  }
  const core = await getCoreCached()
  wasmCall(() => { core!.schemaRegisterView(typeKey, viewJson) }, undefined)
}
