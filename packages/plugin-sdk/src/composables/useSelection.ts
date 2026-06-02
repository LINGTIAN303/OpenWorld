import { ref } from 'vue'
const selectedId = ref<string | null>(null)
const selectedType = ref<string | null>(null)
export function useSelection() {
  function select(id: string | null, type: string | null = null) {
    selectedId.value = id; selectedType.value = type
  }
  return { selectedId, selectedType, select }
}
