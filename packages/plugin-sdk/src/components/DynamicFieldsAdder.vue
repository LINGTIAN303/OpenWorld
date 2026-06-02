<template>
  <div class="dynamic-fields">
    <div class="df-header">
      <span class="df-title">自定义字段</span>
      <button class="df-add-btn" @click="showAdder = true">＋ 添加字段</button>
    </div>

    <!-- 已有自定义字段（按定义渲染） -->
    <div v-for="def in fieldDefs" :key="def.key" class="df-row">
      <span class="df-key">{{ def.label }}</span>
      <input
        v-if="def.type === 'text' || def.type === 'number'"
        :type="def.type"
        :value="getValue(def.key)"
        class="df-input"
        @input="updateValue(def.key, ($event.target as HTMLInputElement).value)"
      />
      <textarea
        v-else-if="def.type === 'textarea'"
        :value="getValue(def.key) as string"
        class="df-input df-textarea"
        rows="2"
        @input="updateValue(def.key, ($event.target as HTMLTextAreaElement).value)"
      ></textarea>
      <label v-else-if="def.type === 'boolean'" class="df-check-wrap">
        <input type="checkbox" :checked="!!getValue(def.key)" @change="updateValue(def.key, ($event.target as HTMLInputElement).checked)" />
      </label>
      <select
        v-else-if="def.type === 'select'"
        :value="getValue(def.key) as string"
        class="df-input"
        @change="updateValue(def.key, ($event.target as HTMLSelectElement).value)"
      >
        <option value="">--</option>
        <option v-for="opt in def.options" :key="opt" :value="opt">{{ opt }}</option>
      </select>
      <button class="df-remove" @click="removeField(def.key)" title="删除此字段">✕</button>
    </div>

    <!-- 内联添加新字段 -->
    <div v-if="showAdder" class="df-adder">
      <input v-model="newKey" class="df-input df-input-key" placeholder="字段名" @keyup.enter="confirmAdd" />
      <select v-model="newType" class="df-select">
        <option value="text">文本</option>
        <option value="textarea">长文本</option>
        <option value="number">数字</option>
        <option value="boolean">开关</option>
        <option value="select">选项</option>
      </select>
      <input v-if="newType==='select'" v-model="newOptions" class="df-input" placeholder="用逗号分隔选项" />
      <button class="df-confirm" @click="confirmAdd">确定</button>
      <button class="df-cancel" @click="cancelAdd">取消</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { FieldSchema } from '@worldsmith/entity-core'

const props = withDefaults(defineProps<{
  /** 实体类型标识 */
  entityType: string
  /** 当前值（键值对） */
  modelValue: Record<string, unknown>
  /** 字段定义列表 */
  fieldDefs?: FieldSchema[]
}>(), {
  fieldDefs: () => [],
})

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, unknown>]
  'update:fieldDefs': [defs: FieldSchema[]]
}>()

const showAdder = ref(false)
const newKey = ref('')
const newType = ref<'text' | 'textarea' | 'number' | 'boolean' | 'select'>('text')
const newOptions = ref('')

function getValue(key: string): unknown {
  return props.modelValue?.[key]
}

function updateValue(key: string, value: string | number | boolean) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

function confirmAdd() {
  const key = newKey.value.trim()
  if (!key) return
  const label = key

  // Default value based on type
  let defaultVal: unknown = ''
  if (newType.value === 'number') defaultVal = 0
  else if (newType.value === 'boolean') defaultVal = false

  // Add value
  emit('update:modelValue', { ...props.modelValue, [key]: defaultVal })

  // Add field definition
  const def: FieldSchema = {
    key,
    label,
    type: newType.value,
    options: newType.value === 'select' ? newOptions.value.split(',').map(s => s.trim()).filter(Boolean) : undefined,
  }
  emit('update:fieldDefs', [...props.fieldDefs, def])

  newKey.value = ''
  newOptions.value = ''
  showAdder.value = false
}

function cancelAdd() {
  newKey.value = ''
  newType.value = 'text'
  newOptions.value = ''
  showAdder.value = false
}

function removeField(key: string) {
  // Remove value
  const { [key]: _, ...rest } = props.modelValue || {}
  emit('update:modelValue', rest)
  // Remove definition
  emit('update:fieldDefs', props.fieldDefs.filter(d => d.key !== key))
}
</script>

<style scoped>
.dynamic-fields { border-top: 1px dashed var(--border-color); padding-top: 8px; margin-top: 4px; }
.df-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.df-title { font-size: var(--font-size-sm); color: var(--text-tertiary, #888); }
.df-add-btn { font-size: var(--font-size-sm); padding: 2px 10px; background: var(--primary); color: var(--color-text-inverse); border: none; border-radius: var(--radius-sm); cursor: pointer; }
.df-add-btn:hover { background: var(--primary-hover); }
.df-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.df-key { font-size: var(--font-size-sm); color: var(--text-secondary); min-width: 70px; font-weight: var(--font-weight-medium); }
.df-input { flex: 1; padding: 5px 8px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); font-size: var(--font-size-sm); font-family: inherit; background: var(--input-bg); color: var(--text-color); }
.df-textarea { resize: vertical; min-height: 36px; }
.df-check-wrap { display: flex; align-items: center; gap: 6px; cursor: pointer; }
.df-check-wrap input[type="checkbox"] { accent-color: var(--primary); }
.df-remove { width: 22px; height: 22px; border: none; background: transparent; border-radius: var(--radius-sm); cursor: pointer; color: var(--danger); font-size: var(--font-size-xs); flex-shrink: 0; }
.df-remove:hover { background: color-mix(in srgb, var(--danger) 10%, transparent); }
.df-adder { display: flex; gap: 4px; align-items: center; margin-top: 4px; flex-wrap: wrap; }
.df-input-key { max-width: 140px; }
.df-select { padding: 5px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); font-size: var(--font-size-sm); background: var(--input-bg); color: var(--text-color); }
.df-confirm { padding: 4px 10px; background: var(--success); color: var(--color-text-inverse); border: none; border-radius: var(--radius-sm); cursor: pointer; font-size: var(--font-size-sm); }
.df-cancel { padding: 4px 10px; background: var(--border-color); color: var(--text-secondary); border: none; border-radius: var(--radius-sm); cursor: pointer; font-size: var(--font-size-sm); }
</style>
