<template>
  <div v-if="loading" class="schema-loading">加载中...</div>
  <div v-else-if="error" class="schema-error">{{ error }}</div>
  <div v-else-if="!schema" class="schema-empty">
    <span>未找到「{{ typeKey }}」的实体类型定义</span>
  </div>
  <GenericEntityView
    v-else-if="schema"
    :entity-type="schema.typeKey"
    :form-fields="formFields"
    :icon-fn="iconFn"
    :filter-options="filterOpts"
    :filter-field-key="filterFieldKey"
    :id-prefix="schema.idPrefix || defaultIdPrefix"
    :entity-label="schema.label"
    :additional-filter="additionalFilter"
    :detail-tabs="detailTabs"
  >
    <template #toolbar-extra>
      <slot name="toolbar-extra" />
    </template>
    <template #detail-extra="{ entity, editing }">
      <slot name="detail-extra" :entity="entity" :editing="editing" />
    </template>
  </GenericEntityView>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { schemaGetEntityType } from '../../../../src/core/coreBackend'
import type { EntityTypeSchema } from '../../../../src/core/coreBackend'
import { entitySchemaRegistry } from '@worldsmith/entity-core'
import GenericEntityView from './GenericEntityView.vue'
import type { FormFieldDef, RelationTabDef } from './types'

const props = withDefaults(defineProps<{
  typeKey: string
  additionalFilter?: (entity: any) => boolean
  detailTabs?: RelationTabDef[]
}>(), {
  detailTabs: () => [],
})

const schema = ref<EntityTypeSchema | null>(null)
const loading = ref(true)
const error = ref('')

async function loadSchema() {
  loading.value = true
  error.value = ''
  try {
    const result = await schemaGetEntityType(props.typeKey)
    if (result) {
      schema.value = result
    } else {
      const fallback = entitySchemaRegistry.get(props.typeKey)
      if (fallback) {
        schema.value = { ...fallback, typeKey: fallback.type, fields: fallback.fields || [], iconMap: (fallback as any).iconMap || {}, relations: [], validations: [], views: [], idPrefix: '' } as unknown as EntityTypeSchema
      } else {
        schema.value = null
      }
    }
  } catch (e: any) {
    const fallback = entitySchemaRegistry.get(props.typeKey)
    if (fallback) {
      schema.value = { ...fallback, typeKey: fallback.type, fields: fallback.fields || [], iconMap: (fallback as any).iconMap || {}, relations: [], validations: [], views: [], idPrefix: '' } as unknown as EntityTypeSchema
    } else {
      error.value = e?.message || String(e)
    }
  } finally {
    loading.value = false
  }
}

onMounted(loadSchema)
watch(() => props.typeKey, loadSchema)

const defaultIdPrefix = computed(() => {
  if (!schema.value) return ''
  return schema.value.typeKey.slice(0, 3) + '-'
})

const formFields = computed<FormFieldDef[]>(() => {
  if (!schema.value) return []
  return schema.value.fields.map(f => ({
    key: f.key,
    label: f.label,
    type: mapFieldType(f.fieldType) as FormFieldDef['type'],
    required: f.required,
    options: f.options?.map(o => ({ value: o.value, label: o.label })),
    placeholder: f.placeholder,
    refType: f.refType,
    autoLink: f.autoLink,
  })) as FormFieldDef[]
})

const filterFieldKey = computed(() => {
  if (!schema.value) return ''
  const selectField = schema.value.fields.find(f => f.fieldType === 'select')
  return selectField?.key || ''
})

const filterOpts = computed(() => {
  if (!schema.value || !filterFieldKey.value) return []
  const field = schema.value.fields.find(f => f.key === filterFieldKey.value)
  if (!field?.options) return []
  return [{ value: '', label: '全部' }, ...field.options.map(o => ({ value: o.value, label: o.label }))]
})

const iconFn = computed(() => {
  if (!schema.value || Object.keys(schema.value.iconMap).length === 0) return undefined
  return (entity: any) => {
    const filterVal = entity?.[filterFieldKey.value]
    if (filterVal && schema.value?.iconMap[filterVal]) {
      return schema.value.iconMap[filterVal]
    }
    return schema.value?.icon || 'manuscript'
  }
})

function mapFieldType(ft: string): string {
  const map: Record<string, string> = {
    text: 'text',
    textarea: 'textarea',
    number: 'number',
    boolean: 'boolean',
    date: 'date',
    image: 'image',
    select: 'select',
    multiSelect: 'multiSelect',
    formula: 'formula',
    color: 'color',
    entityRef: 'entityRef',
    tags: 'tags',
  }
  return map[ft] || 'text'
}
</script>

<style scoped>
.schema-loading,
.schema-error,
.schema-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--text-muted, #888);
  font-size: var(--font-size-base);
}
.schema-error {
  color: var(--danger, #e74c3c);
}
</style>
