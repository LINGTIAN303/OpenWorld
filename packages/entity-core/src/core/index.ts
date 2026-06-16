export { WorldDatabase, db } from './database'
export type { ModuleInstance, ProjectSetting } from './database'

export { getProjectManager } from './ProjectManager'
export type { ProjectInfo, ProjectManagerClass } from './ProjectManager'

export { migrateIfNeeded } from './ProjectMigration'

export type { StorageBackend } from './StorageBackend'
export { isTauri, getStorageBackend, storage, StorageError, setStorageProjectDir, getFileStorageBackend } from './StorageBackend'
export { FileStorageBackend } from './FileStorageBackend'

export { entitySchemaRegistry } from './EntitySchema'

export { relationSchemaRegistry } from './RelationSchema'

export { fieldRegistry } from './FieldRegistry'
export type { FieldType, RegisteredField } from './FieldRegistry'

export { pluginAPI } from './PluginAPI'
export type { PluginAPIType, NodeTypeDefinition, WorkflowTemplateDefinition, ExternalNodeRegistry } from './PluginAPI'

export { inverseRegistry } from './inverseRegistry'

export {
  RelationTypes,
  RelationTypeLabels,
  InverseRelation,
  getRelationLabel,
} from './relationTypes'
export type { RelationType } from './relationTypes'

export {
  registerNodeType,
  getNodeTypeInfo,
  getNodeColor,
  getAllNodeTypes,
  registerEdgeType,
  getEdgeTypeInfo,
  getEdgeColor,
  getAllEdgeTypes,
} from './typeMappingRegistry'
export type { TypeInfo, EdgeTypeInfo } from './typeMappingRegistry'

export { customFieldSerializer } from './serializers/CustomFieldSerializer'
export { entitySerializer } from './serializers/EntitySerializer'
export { entityTypeSerializer } from './serializers/EntityTypeSerializer'
export { createModuleSerializer } from './serializers/ModuleSerializer'
export { relationSerializer } from './serializers/RelationSerializer'
export { relationTypeSerializer } from './serializers/RelationTypeSerializer'
export { createViewSerializer } from './serializers/ViewSerializer'
export type { Serializer, ImportStrategy, ImportReportItem } from './serializers/types'

export {
  registerEventBus,
  getEventBus,
  registerValidationApi,
  getValidationApi,
  registerToastApi,
  getToastApi,
  registerConfirmApi,
  getConfirmApi,
  registerDialogApi,
  getDialogApi,
  registerSettingsApi,
  getSettingsApi,
} from './serviceProvider'
export type {
  EventBus,
  ValidationApi,
  ToastApi,
  ConfirmApi,
  DialogApi,
  SettingsApi,
} from './serviceProvider'

export {
  traitRegistry,
  facetRegistry,
  entitySchemaRegistryV2,
  defineTrait,
  defineFacet,
  defineEntity,
  compileEntitySchema,
} from './TraitRuntime'

export {
  relationshipRegistry,
  defineRelation,
  syncToLegacyRegistry,
} from './RelationshipRegistry'

export {
  semanticHintRegistry,
  autoLinkStrategyRegistry,
  registerDefaultStrategies,
  potentialLinkIndex,
  indexPotentialLinks,
  refreshLinksForTarget,
  inferSemanticHintFromKey,
  inferDirectTargetFromKey,
  userFieldMappingStore,
} from './AutoLinkEngine'
export type { UserFieldMapping } from './AutoLinkEngine'
