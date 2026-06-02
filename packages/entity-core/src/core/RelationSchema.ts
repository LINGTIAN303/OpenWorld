import type { RelationTypeSchema } from '../types'

class RelationSchemaRegistry {
  private schemas = new Map<string, RelationTypeSchema>()

  register(schema: RelationTypeSchema): void {
    this.schemas.set(schema.type, schema)
  }

  get(type: string): RelationTypeSchema | undefined {
    return this.schemas.get(type)
  }

  getAll(): RelationTypeSchema[] {
    return Array.from(this.schemas.values())
  }

  unregister(type: string): void {
    this.schemas.delete(type)
  }
}

export const relationSchemaRegistry = new RelationSchemaRegistry()
