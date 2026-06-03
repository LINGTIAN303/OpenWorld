// useNodeSchema — JSON-Schema → form schema 适配
//
// Phase 3.2：
//   * `NodeConfigFieldSchema`（来自 Rust 节点元数据）→ 表单字段定义
//   * 输出可直接喂给 `<NodeForm :schema="formSchema" :modelValue="config" />`
//
// 设计要点：
//   * 每种字段类型（string/number/boolean）映射到一种输入组件
//   * `options` 存在时映射为 <select>
//   * `required` 映射为校验
//   * `default` 作为初始值
//   * 后续 Phase 4 plugin-bridge 接入后，外部节点也走同一套

import { computed, type ComputedRef, type Ref } from 'vue'
import { getNodeSchema, type NodeConfigFieldSchema, type NodeMetadata } from './useNodeMetadata'

// ─── Form 字段类型（与 NodeForm.vue 一一对应） ───

export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'checkbox'
  | 'select'
  | 'password'
  | 'json'

export interface FormField {
  /** 字段 key（config 的字段名） */
  name: string
  /** 显示 label（默认 = name） */
  label: string
  /** 字段类型 */
  type: FormFieldType
  /** 描述（来自 NodeConfigFieldSchema.description） */
  description?: string
  /** 必填 */
  required: boolean
  /** 默认值 */
  default?: unknown
  /** 可选值（仅 select） */
  options?: string[]
  /** 校验错误 */
  errors: string[]
}

export interface FormSchema {
  nodeType: string
  nodeLabel: string
  fields: FormField[]
}

// ─── 主函数 ───

/** 把 NodeMetadata 转为 FormSchema（不含 modelValue，仅字段定义） */
export function metadataToFormSchema(meta: NodeMetadata): FormSchema {
  const fields: FormField[] = Object.entries(meta.configSchema).map(([name, fs]) =>
    fieldToFormField(name, fs),
  )
  return {
    nodeType: meta.type,
    nodeLabel: meta.label,
    fields,
  }
}

/** 单个字段转换 */
export function fieldToFormField(
  name: string,
  fs: NodeConfigFieldSchema,
): FormField {
  const type: FormFieldType = (() => {
    if (fs.options && fs.options.length > 0) return 'select'
    if (fs.type === 'boolean') return 'checkbox'
    if (fs.type === 'number') return 'number'
    return 'text'
  })()

  return {
    name,
    label: name,
    type,
    description: fs.description,
    required: fs.required === true,
    default: fs.default,
    options: fs.options,
    errors: [],
  }
}

/** useNodeSchema — 给 Vue 组件用（拿单个节点的 form schema） */
export function useNodeSchema(
  typeRef?: Ref<string | null> | ComputedRef<string | null>,
) {
  const formSchema: Ref<FormSchema | null> = ref(null)

  async function load(type?: string): Promise<FormSchema | null> {
    const t = type ?? typeRef?.value
    if (!t) return null
    const meta = await getNodeSchema(t)
    if (!meta) return null
    const schema = metadataToFormSchema(meta)
    formSchema.value = schema
    return schema
  }

  return { formSchema, load }
}

/** 无参版 — 给 InlineNodeEditor / NodeHoverLayer 等已有 node.type 的组件用 */
export function useNodeSchemaSimple() {
  function getFor(type: string): FormSchema | null {
    // 同步版:从 useNodeMetadata 的 cache 查(可能为 null 如果还没加载)
    const { get } = useNodeMetadataAsRef()
    const meta = get(type)
    return meta ? metadataToFormSchema(meta) : null
  }
  return { getFor }
}

function useNodeMetadataAsRef() {
  // 复用 useNodeMetadata 的同步 cache
  const { list } = useNodeMetadata()
  function get(type: string): NodeMetadata | null {
    return list.value?.find((n) => n.type === type) ?? null
  }
  return { get }
}
