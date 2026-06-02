import type { CustomModule } from '../../types'
import type { Serializer, ImportStrategy } from './types'

export function createModuleSerializer(
  getModules: () => CustomModule[],
  addModule: (m: CustomModule) => void,
  updateModule: (id: string, changes: Partial<CustomModule>) => void,
  removeModule: (id: string) => void,
): Serializer {
  return {
    id: 'custom-modules',
    label: '自定义模块定义',
    dependsOn: [],

    async collect(): Promise<Record<string, unknown>> {
      const modules = getModules()
      return {
        version: 1,
        total: modules.length,
        modules: modules.map(m => ({
          ...m,
        })),
      }
    },

    async import(data: Record<string, unknown>, strategy: ImportStrategy): Promise<void> {
      const modules = data.modules as CustomModule[] | undefined
      if (!modules || !Array.isArray(modules)) return

      if (strategy === 'overwrite') {
        for (const existing of getModules()) {
          removeModule(existing.id)
        }
        for (const m of modules) {
          addModule(m)
        }
      } else {
        for (const m of modules) {
          const existing = getModules().find(x => x.id === m.id)
          if (existing) {
            updateModule(m.id, m)
          } else {
            addModule(m)
          }
        }
      }
    },
  }
}
