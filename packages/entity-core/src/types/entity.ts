export interface FieldSchema {
  key: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'boolean' | 'date' | 'image' | 'select' | 'multi-select' | 'formula' | 'color' | 'entityRef'
  required?: boolean
  defaultValue?: unknown
  options?: string[]
  placeholder?: string
  refType?: string
  relationType?: string
  autoLink?: {
    targetType: string
    relationType: string
    searchField?: string
    createIfMissing?: boolean
  }
}

export interface EntityTypeSchema {
  type: string
  label: string
  icon?: string
  fields: FieldSchema[]
  customFields?: FieldSchema[]
  pluginId?: string
}

export interface Entity {
  id: string
  type: string
  name: string
  description: string
  properties: Record<string, unknown>
  tags: string[]
  avatar?: string
  coverImage?: string
  coverPosition?: string
  coverZoom?: number
  createdAt: string
  updatedAt: string
}
