const STORAGE_KEY = 'worldsmith_workflows'

export interface PersistedWorkflow {
  id: string
  name: string
  category: string
  description: string
  definition: unknown
  savedAt: number
}

export function loadPersistedWorkflows(): PersistedWorkflow[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export function persistWorkflow(workflow: PersistedWorkflow): void {
  const existing = loadPersistedWorkflows()
  const idx = existing.findIndex(w => w.id === workflow.id)
  if (idx !== -1) {
    existing[idx] = workflow
  } else {
    existing.push(workflow)
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing))
}

export function removePersistedWorkflow(workflowId: string): void {
  const existing = loadPersistedWorkflows()
  const filtered = existing.filter(w => w.id !== workflowId)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
}
