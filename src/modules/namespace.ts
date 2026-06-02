/**
 * modules/namespace.ts — 命名空间服务
 *
 * 跨模块类型查询 + entity-ref 校验。
 * 负责：
 *   - 查询某个模块暴露了哪些实体类型
 *   - 解析 entity-ref 引用的目标模块和类型
 *   - 验证依赖完整性
 */

import { entitySchemaRegistry, relationSchemaRegistry } from '@worldsmith/entity-core'
import type { EntityTypeSchema } from '@worldsmith/entity-core'
import type { RelationTypeSchema } from '@worldsmith/entity-core'

class NamespaceService {
  /**
   * 获取指定模块暴露的所有实体类型
   */
  getEntityTypes(moduleId?: string): EntityTypeSchema[] {
    const all = entitySchemaRegistry.getAll()
    if (!moduleId) return all
    return all.filter(s => s.pluginId === moduleId)
  }

  /**
   * 获取指定模块暴露的所有关系类型
   */
  getRelationTypes(moduleId?: string): RelationTypeSchema[] {
    const all = relationSchemaRegistry.getAll()
    if (!moduleId) return all
    return all.filter(s => s.pluginId === moduleId)
  }

  /**
   * 从完整的类型名（含 namespace）解析出模块 id
   * custom.currency.coin → { moduleId: 'custom.currency', typeName: 'coin' }
   * character → { moduleId: 'official.characters', typeName: 'character' }
   */
  resolveTypeRef(refType: string): { moduleId: string; typeName: string } | null {
    // 处理自定义模块类型: custom.{moduleId}.{typeName}
    if (refType.startsWith('custom.')) {
      const parts = refType.split('.')
      // custom.{moduleId}.{typeName} => parts: ['custom', 'moduleId', 'typeName']
      const typeName = parts[parts.length - 1]
      const moduleId = parts.slice(0, -1).join('.')
      return { moduleId, typeName }
    }

    // 处理官方插件类型: 直接查询 Schema 的 pluginId
    const schema = entitySchemaRegistry.get(refType)
    if (schema && schema.pluginId) {
      return { moduleId: schema.pluginId, typeName: refType }
    }

    return null
  }

  /**
   * 校验一个 entity-ref 字段的引用目标是否存在
   */
  validateRef(refType: string): { valid: boolean; error?: string } {
    const resolved = this.resolveTypeRef(refType)
    if (!resolved) {
      return { valid: false, error: `无法解析类型引用: ${refType}` }
    }

    const schema = entitySchemaRegistry.get(refType)
    if (!schema) {
      return { valid: false, error: `类型未注册: ${refType}（可能缺少依赖模块）` }
    }

    return { valid: true }
  }

  /**
   * 批量校验一个模块中所有 entity-ref 字段的引用
   */
  validateModuleRefs(moduleId: string): { valid: boolean; errors: string[] } {
    const schemas = this.getEntityTypes(moduleId)
    const errors: string[] = []

    for (const schema of schemas) {
      for (const field of schema.fields) {
        if (field.type === 'select' || field.type === 'multi-select') {
          continue
        }
        // entity-ref 类型没有在 FieldSchema 中表达 refType
        // 需要从 ModuleField 的原始定义中获取
      }
    }

    return { valid: errors.length === 0, errors }
  }

  /**
   * 列出所有可被其他模块引用的实体类型
   * （排除本模块内的类型，用于 Builder 的 entity-ref 下拉）
   */
  getReferableTypes(excludeModuleId?: string): { label: string; type: string; moduleLabel: string }[] {
    const all = entitySchemaRegistry.getAll()
    return all
      .filter(s => !excludeModuleId || s.pluginId !== excludeModuleId)
      .map(s => ({
        label: s.label || s.type,
        type: s.type,
        moduleLabel: s.pluginId || 'builtin',
      }))
  }
}

export const namespaceService = new NamespaceService()
