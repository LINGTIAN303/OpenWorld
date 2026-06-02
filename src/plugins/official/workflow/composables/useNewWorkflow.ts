import { ref } from 'vue'
import type { WorkflowNodeDefinition, WorkflowEdgeDefinition } from '../types'

/**
 * 工作流定义的可创建草稿(新建时使用,未存盘前不含 schemaVersion/version)。
 *
 * 与 `WorkflowDefinition` 的区别:草稿不必有 `schemaVersion` / `version`,
 * 由后端持久化时填充。
 */
export interface WorkflowDraft {
  id: string
  name: string
  templateId?: string
  description?: string
  category?: string
  nodes: Array<WorkflowNodeDefinition | Record<string, unknown>>
  edges: Array<WorkflowEdgeDefinition | Record<string, unknown>>
}

/** worldsmith:workflow-list 事件 detail(规格见 docs/superpowers/specs §5) */
export interface WorkflowListEventDetail {
  action: 'create' | 'delete' | 'refresh' | 'update'
  definition?: WorkflowDraft
  id?: string
}

const _showDropdown = ref(false)
let _initialized = false

function ensureInit(): void {
  if (_initialized || typeof window === 'undefined') return
  _initialized = true
}

function genId(): string {
  return `wf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

function makeBlankNodes(): WorkflowDraft['nodes'] {
  return [
    { type: 'start', id: 'n1', position: { x: 100, y: 200 }, config: {} },
    { type: 'end', id: 'n2', position: { x: 400, y: 200 }, config: {} },
  ]
}

function makeBlankEdges(): WorkflowDraft['edges'] {
  return [{ from: 'n1', to: 'n2' }]
}

export function useNewWorkflow() {
  ensureInit()
  return {
    /** 控制下拉显隐,供 NewWorkflowDropdown 绑定 */
    showDropdown: _showDropdown,
    open(): void {
      _showDropdown.value = true
    },
    close(): void {
      _showDropdown.value = false
    },
    /**
     * 创建空白工作流:仅含 start + end 节点,
     * 用户进入编辑器后即可拖入更多节点。
     */
    createBlank(name: string): WorkflowDraft {
      return {
        id: genId(),
        name,
        nodes: makeBlankNodes(),
        edges: makeBlankEdges(),
      }
    },
    /**
     * 从模板创建:返回只携带 templateId 的占位草稿,
     * 真正的节点/边由模板加载器填充(由后端 / T3 调度)。
     */
    createFromTemplate(templateId: string, opts: { name: string }): WorkflowDraft {
      return {
        id: genId(),
        name: opts.name,
        templateId,
        nodes: [],
        edges: [],
      }
    },
    /**
     * 从 JSON 导入:解析并返回草稿。解析失败或缺 id/name 时抛错。
     */
    importFromJson(json: string): WorkflowDraft {
      let parsed: unknown
      try {
        parsed = JSON.parse(json)
      } catch (err) {
        throw new Error(`Invalid workflow JSON: ${(err as Error).message}`)
      }
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('Invalid workflow JSON: not an object')
      }
      const obj = parsed as Record<string, unknown>
      if (typeof obj.id !== 'string' || obj.id.length === 0) {
        throw new Error('Invalid workflow JSON: missing id')
      }
      if (typeof obj.name !== 'string' || obj.name.length === 0) {
        throw new Error('Invalid workflow JSON: missing name')
      }
      if (!Array.isArray(obj.nodes)) {
        throw new Error('Invalid workflow JSON: nodes must be an array')
      }
      if (!Array.isArray(obj.edges)) {
        throw new Error('Invalid workflow JSON: edges must be an array')
      }
      return {
        id: obj.id,
        name: obj.name,
        ...(typeof obj.templateId === 'string' ? { templateId: obj.templateId } : {}),
        ...(typeof obj.description === 'string' ? { description: obj.description } : {}),
        ...(typeof obj.category === 'string' ? { category: obj.category } : {}),
        nodes: obj.nodes as WorkflowDraft['nodes'],
        edges: obj.edges as WorkflowDraft['edges'],
      }
    },
    /**
     * 提交草稿:派发 worldsmith:workflow-list 事件,
     * useWorkflow 会在 T3 订阅并执行 addWorkflow/removeWorkflow。
     * 同时关闭下拉。
     */
    commit(def: WorkflowDraft): void {
      const detail: WorkflowListEventDetail = { action: 'create', definition: def }
      const event = new CustomEvent<WorkflowListEventDetail>('worldsmith:workflow-list', {
        detail,
      })
      if (typeof window !== 'undefined') {
        window.dispatchEvent(event)
      }
      _showDropdown.value = false
    },
  }
}
