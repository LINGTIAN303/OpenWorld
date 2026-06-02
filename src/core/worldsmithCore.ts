import type {
  SafetyReport,
  ConfirmResult,
  ApplyResult,
  RetrofitResult,
  SessionPhase,
  ConflictReport,
  PatchDiffResult,
  Point2D,
  Segment2D,
  WeightedGraph,
  ForceLayoutConfig,
  NoiseConfig,
} from './coreBackend'

export interface CoreValidationError {
  path: string
  message: string
  severity: 'error' | 'warning'
}

export interface CoreValidationReport {
  valid: boolean
  errors: CoreValidationError[]
}

export interface CoreDanglingRelation {
  relationId: string
  relationType: string
  missing: string
}

export interface CoreReferenceCheckResult {
  orphanEntities: string[]
  danglingRelations: CoreDanglingRelation[]
  orphanRelations: string[]
  duplicateEntityIds: string[]
  duplicateRelationIds: string[]
}

export interface CoreMigrationResult {
  fromVersion: number
  toVersion: number
  steps: string[]
  success: boolean
  error: string | null
}

export interface CoreTypeCount {
  type: string
  count: number
}

export interface CoreDiagnosticSummary {
  totalEntities: number
  totalRelations: number
  entityTypeDistribution: CoreTypeCount[]
  relationTypeDistribution: CoreTypeCount[]
  referenceCheck: CoreReferenceCheckResult
  validationErrors: number
  validationWarnings: number
}

export interface WorldSmithCoreAPI {
  validateEntity(entityJson: string, schemaJson?: string): CoreValidationReport
  validateEntities(entitiesJson: string, schemasJson?: string): CoreValidationReport
  validatePack(packJson: string): CoreValidationReport
  checkReferences(entitiesJson: string, relationsJson: string): CoreReferenceCheckResult
  migrate(packJson: string, fromVersion: number): { result: CoreMigrationResult; data: unknown }
  runDiagnostics(
    entitiesJson: string,
    relationsJson: string,
    schemasJson?: string,
  ): CoreDiagnosticSummary
  retrofitBeginSession(sessionId: string, catalogJson?: string): void
  retrofitSubmitIntent(intentJson: string): SafetyReport | null
  retrofitConfirmAndStage(): ConfirmResult | null
  retrofitApplyNext(beforeJson: string, afterJson: string): ApplyResult | null
  retrofitVerifyAndAccept(entityCount: number, relationCount: number): RetrofitResult | null
  retrofitRequestRepair(message: string): void
  retrofitRedirect(message: string): void
  retrofitRollbackLast(): string | null
  retrofitAbort(): string[]
  retrofitSessionPhase(): SessionPhase | null
  retrofitDetectConflicts(): ConflictReport | null
  retrofitEndSession(): boolean
  patchDiff(beforeJson: string, afterJson: string): PatchDiffResult | null
  patchApply(docJson: string, patchJson: string): string | null
  // 算法：几何
  algoSegmentIntersect(seg1: Segment2D, seg2: Segment2D): boolean
  algoFindAllIntersections(segments: Segment2D[]): string
  algoPointInPolygon(point: Point2D, vertices: Point2D[]): boolean
  algoPolygonArea(vertices: Point2D[]): number
  algoConvexHull(points: Point2D[]): string
  algoAabbIntersects(a: { min: Point2D; max: Point2D }, b: { min: Point2D; max: Point2D }): boolean
  algoObbIntersects(a: { center: Point2D; halfExtents: [number, number]; rotation: number }, b: { center: Point2D; halfExtents: [number, number]; rotation: number }): boolean
  // 算法：图
  algoDijkstraPath(graph: WeightedGraph, source: string, target: string): string
  algoAstar(graph: WeightedGraph, source: string, target: string, heuristic: Record<string, number>): string
  algoTopologicalSort(graph: WeightedGraph): string
  algoConnectedComponents(graph: WeightedGraph): string
  algoTarjanScc(graph: WeightedGraph): string
  algoForceLayout(graph: WeightedGraph, config?: ForceLayoutConfig): string
  algoCrdtLwwNew(value: string, nodeId: string): string
  algoCrdtLwwSet(registerJson: string, value: string, timestamp: number): string
  algoCrdtLwwMerge(registerJson: string, otherJson: string): string
  algoCrdtOrsetNew(nodeId: string): string
  algoCrdtOrsetAdd(setJson: string, element: string): string
  algoCrdtOrsetRemove(setJson: string, element: string): string
  algoCrdtOrsetMerge(setJson: string, otherJson: string): string
  algoCrdtOrsetElements(setJson: string): string
  algoCrdtRgaNew(nodeId: string): string
  algoCrdtRgaInsert(rgaJson: string, index: number, content: string): string
  algoCrdtRgaDelete(rgaJson: string, id: string): string
  algoCrdtRgaMerge(rgaJson: string, otherJson: string): string
  algoCrdtRgaText(rgaJson: string): string
  algoCrdtVcCompare(clockAJson: string, clockBJson: string): string
  algoTerrainNoise(x: number, y: number, configJson?: string): number
  algoTerrainHeightmapGenerate(configJson: string | undefined, width: number, height: number, offsetX: number, offsetY: number): string
  algoTerrainHeightmapSlope(heightmapJson: string, x: number, y: number): string
  algoTerrainHeightmapAspect(heightmapJson: string, x: number, y: number): number
  algoTerrainMarchingSquares(heightmapJson: string, levels: number[]): string
  algoConstraintSolve(systemJson: string, maxIterations: number, tolerance: number): string
  algoDxfParse(content: string): string
  algoDxfGenerate(entitiesJson: string): string
  algoDxfExtractConstraints(systemJson: string): string
  algoPolygonBoolean(op: string, aJson: string, bJson: string): string
  algoPolygonOffset(polygonJson: string, delta: number): string
  algoPolygonSimplify(polygonJson: string, epsilon: number): string
  algoLineLength(pointsJson: string): number
  algoPageRank(graphJson: string, damping: number, maxIterations: number, tolerance: number): string
  algoCommunityDetection(graphJson: string): string
  algoBetweennessCentrality(graphJson: string): string
  algoHydraulicErosion(heightmapJson: string, configJson: string | undefined): string
  algoViewshed(heightmapJson: string, observerX: number, observerY: number, observerHeight: number, radius: number): string
  algoChaikinSmooth(verticesJson: string, iterations: number): string
  algoFindSharedEdges(verticesAJson: string, verticesBJson: string, threshold: number): string
  algoFindLinePolygonIntersections(lineJson: string, polygonJson: string): string
  algoPolygonSplit(polygonJson: string, cuttingLineJson: string): string
  algoPolygonAugment(polygonJson: string, addingLineJson: string): string
  schemaRegisterEntityType(schemaJson: string): string
  schemaUnregisterEntityType(typeKey: string): void
  schemaGetEntityType(typeKey: string): string
  schemaListEntityTypes(): string
  schemaUpdateEntityType(typeKey: string, updatesJson: string): string
  schemaRegisterValidation(typeKey: string, ruleJson: string): void
  schemaRegisterView(typeKey: string, viewJson: string): void
}

let coreModule: { WorldSmithCore: new () => WorldSmithCoreAPI } | null = null
let coreLoadAttempted = false
let coreInstance: WorldSmithCoreAPI | null = null

async function tryLoadCore(): Promise<WorldSmithCoreAPI | null> {
  if (coreInstance) return coreInstance
  if (coreLoadAttempted) return null
  coreLoadAttempted = true
  try {
    coreModule = await import('@worldsmith/core')
    if (!coreModule?.WorldSmithCore) {
      console.warn('[WorldSmithCore] 模块缺少 WorldSmithCore 导出')
      return null
    }
    const instance = new coreModule.WorldSmithCore()
    if (typeof instance.validateEntity !== 'function') {
      console.warn('[WorldSmithCore] WorldSmithCore 实例缺少 validateEntity 方法，WASM 核心库可能版本不匹配')
      return null
    }
    coreInstance = instance
    console.log('[WorldSmithCore] WASM 核心库加载成功')
    const { setWasmAvailable } = await import('./coreBackend')
    setWasmAvailable(true)
    return coreInstance
  } catch (e) {
    console.warn('[WorldSmithCore] WASM 核心库不可用:', e)
    return null
  }
}

export async function getCore(): Promise<WorldSmithCoreAPI | null> {
  return tryLoadCore()
}

export function isCoreAvailable(): boolean {
  return coreInstance !== null
}
