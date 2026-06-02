<script setup lang="ts">
// NodeForm — JSON-Schema 驱动的表单渲染器
//
// Phase 3.5：根据 FormSchema（来自 useNodeSchema）渲染表单字段。
// 不依赖任何 form 库（200 行内）。
//
// 字段类型 → 输入组件：
//   text     → <input type="text">
//   textarea → <textarea>
//   number   → <input type="number">
//   checkbox → <input type="checkbox">
//   select   → <select>
//   password → <input type="password">
//   json     → <textarea> + JSON 解析校验

import { computed } from 'vue'
import type { FormSchema, FormField } from '../composables/useNodeSchema'

const props = defineProps<{
  schema: FormSchema | null
  modelValue: Record<string, unknown>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, unknown>]
}>()

const fields = computed<FormField[]>(() => props.schema?.fields ?? [])

function getFieldValue(field: FormField): unknown {
  if (field.name in props.modelValue) return props.modelValue[field.name]
  return field.default
}

function setFieldValue(field: FormField, value: unknown): void {
  emit('update:modelValue', { ...props.modelValue, [field.name]: value })
}

function validateJson(value: string): string | null {
  if (!value.trim()) return null
  try {
    JSON.parse(value)
    return null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}
</script>

<template>
  <div v-if="!schema" class="node-form-empty">无 schema</div>
  <form v-else class="node-form" @submit.prevent>
    <div v-for="f in fields" :key="f.name" class="form-field">
      <label :for="`field-${f.name}`" class="form-label">
        {{ f.label }}
        <span v-if="f.required" class="required-mark">*</span>
      </label>
      <p v-if="f.description" class="form-description">{{ f.description }}</p>

      <!-- text -->
      <input
        v-if="f.type === 'text'"
        :id="`field-${f.name}`"
        type="text"
        :value="getFieldValue(f) as string"
        @input="setFieldValue(f, ($event.target as HTMLInputElement).value)"
      />

      <!-- password -->
      <input
        v-else-if="f.type === 'password'"
        :id="`field-${f.name}`"
        type="password"
        :value="getFieldValue(f) as string"
        @input="setFieldValue(f, ($event.target as HTMLInputElement).value)"
      />

      <!-- textarea -->
      <textarea
        v-else-if="f.type === 'textarea'"
        :id="`field-${f.name}`"
        :value="getFieldValue(f) as string"
        rows="4"
        @input="setFieldValue(f, ($event.target as HTMLTextAreaElement).value)"
      />

      <!-- number -->
      <input
        v-else-if="f.type === 'number'"
        :id="`field-${f.name}`"
        type="number"
        :value="getFieldValue(f) as number"
        @input="setFieldValue(f, Number(($event.target as HTMLInputElement).value))"
      />

      <!-- checkbox -->
      <label v-else-if="f.type === 'checkbox'" class="checkbox-label">
        <input
          :id="`field-${f.name}`"
          type="checkbox"
          :checked="Boolean(getFieldValue(f))"
          @change="setFieldValue(f, ($event.target as HTMLInputElement).checked)"
        />
        <span>启用</span>
      </label>

      <!-- select -->
      <select
        v-else-if="f.type === 'select'"
        :id="`field-${f.name}`"
        :value="getFieldValue(f) as string"
        @change="setFieldValue(f, ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="opt in f.options" :key="opt" :value="opt">{{ opt }}</option>
      </select>

      <!-- json -->
      <template v-else-if="f.type === 'json'">
        <textarea
          :id="`field-${f.name}`"
          :value="(getFieldValue(f) as string | undefined) ?? ''"
          rows="6"
          class="json-textarea"
          @input="setFieldValue(f, ($event.target as HTMLTextAreaElement).value)"
        />
        <p v-if="validateJson((getFieldValue(f) as string | undefined) ?? '')" class="form-error">
          JSON 错误：{{ validateJson((getFieldValue(f) as string | undefined) ?? '') }}
        </p>
      </template>
    </div>
  </form>
</template>

<style scoped>
.node-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 12px 0;
}
.node-form-empty {
  color: #94a3b8;
  padding: 24px;
  text-align: center;
}
.form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.form-label {
  font-weight: 500;
  font-size: 13px;
  color: #334155;
}
.required-mark {
  color: #ef4444;
  margin-left: 2px;
}
.form-description {
  font-size: 11px;
  color: #64748b;
  margin: 0 0 4px 0;
}
.form-field input[type='text'],
.form-field input[type='password'],
.form-field input[type='number'],
.form-field textarea,
.form-field select {
  padding: 6px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  font-size: 13px;
  font-family: inherit;
}
.form-field textarea {
  resize: vertical;
  min-height: 60px;
  font-family: ui-monospace, SFMono-Regular, monospace;
}
.json-textarea {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 12px;
}
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #475569;
}
.form-error {
  color: #dc2626;
  font-size: 11px;
  margin: 4px 0 0 0;
}
</style>
