<template>
  <div class="property-panel">
    <div class="panel-header">
      <div class="header-title">
        <span class="header-icon">{{ nodeData.icon }}</span>
        <span class="header-label">{{ isSimplified ? meta?.label_zh : meta?.label }}</span>
      </div>
      <div class="header-actions">
        <button class="mode-toggle-btn" @click="toggleMode">
          {{ isSimplified ? '高级 ▸' : '◂ 简化' }}
        </button>
        <button class="remove-btn" @click="$emit('remove-node', node.id)">删除</button>
      </div>
    </div>

    <div class="panel-body">
      <div class="field-group">
        <label class="field-label">{{ isSimplified ? '标签' : 'Label' }}</label>
        <input
          :value="nodeData.label"
          class="field-input"
          @input="$emit('update-label', node.id, ($event.target as HTMLInputElement).value)"
        />
      </div>

      <template v-if="isSimplified">
        <div
          v-for="key in visibleSimplifiedKeys"
          :key="key"
          class="field-group"
        >
          <label class="field-label">{{ fieldLabel(schema(key)) }}</label>
          <FieldRenderer
            :schema="schema(key)!"
            :value="nodeData.config[key]"
            :is-simplified="true"
            @change="handleConfigChange(key, $event)"
          />
        </div>

        <template v-if="hiddenSimplifiedKeys.length > 0">
          <div
            v-if="showMore"
            v-for="key in hiddenSimplifiedKeys"
            :key="key"
            class="field-group"
          >
            <label class="field-label">{{ fieldLabel(schema(key)) }}</label>
            <FieldRenderer
              :schema="schema(key)!"
              :value="nodeData.config[key]"
              :is-simplified="true"
              @change="handleConfigChange(key, $event)"
            />
          </div>
          <button class="more-btn" @click="showMore = !showMore">
            {{ showMore ? '收起' : '+ 更多选项' }}
          </button>
        </template>
      </template>

      <template v-else>
        <div
          v-for="(s, key) in configSchema"
          :key="key"
          class="field-group"
        >
          <label class="field-label">{{ fieldLabel(s) }}</label>
          <FieldRenderer
            :schema="s"
            :value="nodeData.config[key]"
            :is-simplified="false"
            @change="handleConfigChange(String(key), $event)"
          />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { GraphNode } from '@vue-flow/core'
import type { EditorNodeData, NodeMetadata, NodeConfigFieldSchema } from '../node-metadata'
import { builtinNodeMetadata } from '../node-metadata'

const props = defineProps<{
  node: GraphNode
  mode: 'simplified' | 'advanced'
}>()

const emit = defineEmits<{
  'update-config': [nodeId: string, config: Record<string, unknown>]
  'update-label': [nodeId: string, label: string]
  'remove-node': [nodeId: string]
  'toggle-mode': [nodeId: string, mode: 'simplified' | 'advanced']
}>()

const showMore = ref(false)

const nodeData = computed<EditorNodeData>(() => props.node.data as EditorNodeData)

const isSimplified = computed(() => props.mode === 'simplified')

const meta = computed<NodeMetadata | undefined>(() =>
  builtinNodeMetadata.find(m => m.type === nodeData.value.type)
)

const configSchema = computed(() => meta.value?.configSchema || {})

const simplifiedFields = computed<string[]>(() => meta.value?.simplifiedFields || [])

const allSchemaKeys = computed(() => Object.keys(configSchema.value))

const visibleSimplifiedKeys = computed(() =>
  simplifiedFields.value.filter(k => k in configSchema.value)
)

const hiddenSimplifiedKeys = computed(() =>
  allSchemaKeys.value.filter(k => !simplifiedFields.value.includes(k))
)

function schema(key: string): NodeConfigFieldSchema | undefined {
  return configSchema.value[key]
}

function fieldLabel(s?: NodeConfigFieldSchema): string {
  if (!s) return ''
  return isSimplified.value ? s.label_zh : s.label
}

function toggleMode() {
  const next = isSimplified.value ? 'advanced' : 'simplified'
  emit('toggle-mode', props.node.id, next)
}

function handleConfigChange(key: string, value: unknown) {
  emit('update-config', props.node.id, { [key]: value })
}
</script>

<script lang="ts">
import { defineComponent, h } from 'vue'

const FieldRenderer = defineComponent({
  name: 'FieldRenderer',
  props: {
    schema: { type: Object as () => NodeConfigFieldSchema, required: true },
    value: { type: [String, Number, Boolean, Array, Object] as any, default: undefined },
    isSimplified: { type: Boolean, required: true },
  },
  emits: ['change'],
  setup(props, { emit }) {
    function formatValue(val: unknown): string {
      if (val === null || val === undefined) return ''
      if (typeof val === 'string') return val
      return JSON.stringify(val, null, 2)
    }

    function parseValue(str: string): unknown {
      try { return JSON.parse(str) } catch { return str }
    }

    return () => {
      const s = props.schema

      if (s.type === 'select') {
        const options = props.isSimplified && s.options_zh ? s.options_zh : s.options
        const optionValues = s.options
        return h('select', {
          class: 'field-input',
          value: props.value ?? '',
          onChange: (e: Event) => {
            const idx = (e.target as HTMLSelectElement).selectedIndex
            if (optionValues && idx >= 0 && idx < optionValues.length) {
              emit('change', optionValues[idx])
            } else {
              emit('change', (e.target as HTMLSelectElement).value)
            }
          },
        }, [
          h('option', { value: '' }, '-- 选择 --'),
          ...(options || []).map((opt: string, i: number) =>
            h('option', { key: i, value: optionValues?.[i] ?? opt }, opt)
          ),
        ])
      }

      if (s.type === 'number') {
        return h('input', {
          type: 'number',
          class: 'field-input',
          value: props.value ?? '',
          placeholder: props.isSimplified ? s.placeholder_zh : s.placeholder,
          onInput: (e: Event) => emit('change', Number((e.target as HTMLInputElement).value)),
        })
      }

      if (s.type === 'boolean') {
        return h('input', {
          type: 'checkbox',
          class: 'field-checkbox',
          checked: !!props.value,
          onChange: (e: Event) => emit('change', (e.target as HTMLInputElement).checked),
        })
      }

      if (s.type === 'array') {
        return h('textarea', {
          class: 'field-textarea',
          rows: 3,
          value: formatValue(props.value),
          placeholder: props.isSimplified ? s.placeholder_zh : s.placeholder,
          onChange: (e: Event) => emit('change', parseValue((e.target as HTMLTextAreaElement).value)),
        })
      }

      return h('input', {
        type: 'text',
        class: 'field-input',
        value: props.value ?? '',
        placeholder: props.isSimplified ? s.placeholder_zh : s.placeholder,
        onInput: (e: Event) => emit('change', (e.target as HTMLInputElement).value),
      })
    }
  },
})
</script>

<style scoped>
.property-panel {
  width: 280px;
  border-left: 1px solid var(--border-color, #e5e7eb);
  background: var(--bg-primary, var(--color-bg-surface));
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  gap: 8px;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.header-icon {
  font-size: var(--font-size-lg);
  flex-shrink: 0;
}

.header-label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.mode-toggle-btn {
  border: 1px solid var(--border-color, #d1d5db);
  background: var(--bg-primary, white);
  cursor: pointer;
  font-size: var(--font-size-xs);
  color: var(--text-secondary, #6b7280);
  padding: 2px 8px;
  border-radius: 4px;
  transition: all 0.15s;
  white-space: nowrap;
}

.mode-toggle-btn:hover {
  background: var(--hover-bg, #f3f4f6);
  color: var(--text-primary, #374151);
}

.remove-btn {
  border: 1px solid #fca5a5;
  background: #fef2f2;
  cursor: pointer;
  font-size: var(--font-size-xs);
  color: #dc2626;
  padding: 2px 8px;
  border-radius: 4px;
  transition: all 0.15s;
  white-space: nowrap;
}

.remove-btn:hover {
  background: #fee2e2;
}

.panel-body {
  padding: 10px 12px;
  flex: 1;
}

.field-group {
  margin-bottom: 10px;
}

.field-label {
  display: block;
  font-size: var(--font-size-xs);
  color: var(--text-secondary, #6b7280);
  margin-bottom: 3px;
}

.field-input {
  width: 100%;
  padding: 5px 8px;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 4px;
  font-size: var(--font-size-sm);
  box-sizing: border-box;
}

.field-input:disabled {
  background: var(--hover-bg, #f3f4f6);
  color: var(--text-secondary, #6b7280);
}

.field-textarea {
  width: 100%;
  padding: 5px 8px;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 4px;
  font-size: var(--font-size-xs);
  font-family: monospace;
  resize: vertical;
  box-sizing: border-box;
}

.field-checkbox {
  margin-top: 4px;
}

.more-btn {
  width: 100%;
  border: 1px dashed var(--border-color, #d1d5db);
  background: transparent;
  cursor: pointer;
  font-size: var(--font-size-xs);
  color: var(--text-secondary, #6b7280);
  padding: 6px 0;
  border-radius: 4px;
  transition: all 0.15s;
  margin-top: 4px;
}

.more-btn:hover {
  background: var(--hover-bg, #f3f4f6);
  color: var(--text-primary, #374151);
  border-color: var(--border-color, #9ca3af);
}
</style>
