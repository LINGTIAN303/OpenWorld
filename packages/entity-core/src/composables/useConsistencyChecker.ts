import { ref } from 'vue'
import { useEntityStore } from '../stores/entityStore'
import { useRelationStore } from '../stores/relationStore'
import { entitySchemaRegistry } from '../core/EntitySchema'
import { relationshipRegistry } from '../core/RelationshipRegistry'

export interface ConsistencyIssue {
  id: string
  severity: 'error' | 'warning' | 'info'
  category: 'dangling_relation' | 'missing_required' | 'type_mismatch' | 'orphan_entity'
  message: string
  entityId?: string
  relationId?: string
  suggestion?: string
}

export function useConsistencyChecker() {
  const checking = ref(false)
  const issues = ref<ConsistencyIssue[]>([])

  async function runFullCheck(): Promise<ConsistencyIssue[]> {
    checking.value = true
    try {
      const entityStore = useEntityStore()
      const relationStore = useRelationStore()
      const found: ConsistencyIssue[] = []
      const entityIds = new Set(entityStore.entities.map(e => e.id))

      // 1. Dangling relation check
      for (const rel of relationStore.relations) {
        if (!entityIds.has(rel.sourceId)) {
          found.push({
            id: `dangling_src_${rel.id}`,
            severity: 'error',
            category: 'dangling_relation',
            message: `关系"${rel.type}"的源实体 ${rel.sourceId} 不存在`,
            relationId: rel.id,
            suggestion: '删除此关系或恢复源实体',
          })
        }
        if (!entityIds.has(rel.targetId)) {
          found.push({
            id: `dangling_tgt_${rel.id}`,
            severity: 'error',
            category: 'dangling_relation',
            message: `关系"${rel.type}"的目标实体 ${rel.targetId} 不存在`,
            relationId: rel.id,
            suggestion: '删除此关系或恢复目标实体',
          })
        }
      }

      // 2. Required field check
      for (const entity of entityStore.entities) {
        const schema = entitySchemaRegistry.get(entity.type)
        if (!schema) continue
        for (const field of schema.fields || []) {
          if (field.required && !entity.properties?.[field.key]) {
            found.push({
              id: `missing_field_${entity.id}_${field.key}`,
              severity: 'warning',
              category: 'missing_required',
              message: `实体"${entity.name}"缺少必填字段"${field.label || field.key}"`,
              entityId: entity.id,
              suggestion: `补充${field.label || field.key}`,
            })
          }
        }
      }

      // 3. Relation type mismatch check
      for (const rel of relationStore.relations) {
        const source = entityStore.entities.find(e => e.id === rel.sourceId)
        const target = entityStore.entities.find(e => e.id === rel.targetId)
        if (!source || !target) continue
        const relSchema = relationshipRegistry.get(rel.type)
        if (!relSchema) continue
        if (relSchema.sourceTypes.length > 0 && !relSchema.sourceTypes.includes(source.type)) {
          found.push({
            id: `type_mismatch_src_${rel.id}`,
            severity: 'warning',
            category: 'type_mismatch',
            message: `关系"${relSchema.label || rel.type}"的源实体类型"${source.type}"不在允许范围内`,
            relationId: rel.id,
            entityId: source.id,
          })
        }
        if (relSchema.targetTypes.length > 0 && !relSchema.targetTypes.includes(target.type)) {
          found.push({
            id: `type_mismatch_tgt_${rel.id}`,
            severity: 'warning',
            category: 'type_mismatch',
            message: `关系"${relSchema.label || rel.type}"的目标实体类型"${target.type}"不在允许范围内`,
            relationId: rel.id,
            entityId: target.id,
          })
        }
      }

      // 4. Orphan entity check
      const connectedEntityIds = new Set<string>()
      for (const rel of relationStore.relations) {
        connectedEntityIds.add(rel.sourceId)
        connectedEntityIds.add(rel.targetId)
      }
      for (const entity of entityStore.entities) {
        if (!connectedEntityIds.has(entity.id)) {
          found.push({
            id: `orphan_${entity.id}`,
            severity: 'info',
            category: 'orphan_entity',
            message: `实体"${entity.name}"没有任何关联关系`,
            entityId: entity.id,
            suggestion: '考虑添加关系或确认是否需要此实体',
          })
        }
      }

      issues.value = found
      return found
    } finally {
      checking.value = false
    }
  }

  function getIssueCountBySeverity(severity: ConsistencyIssue['severity']): number {
    return issues.value.filter(i => i.severity === severity).length
  }

  return { checking, issues, runFullCheck, getIssueCountBySeverity }
}
