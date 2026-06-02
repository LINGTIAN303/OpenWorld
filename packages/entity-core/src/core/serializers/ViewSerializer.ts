import type { PluginView } from '../../types'
import type { Serializer, ImportStrategy } from './types'

export function createViewSerializer(
  getViews: () => PluginView[],
): Serializer {
  return {
    id: 'views',
    label: '视图注册',
    dependsOn: ['custom-modules'],

    async collect(): Promise<Record<string, unknown>> {
      const views = getViews()
      return {
        version: 1,
        total: views.length,
        views: views.map(v => ({
          id: v.id,
          label: v.label,
          icon: v.icon,
          _isCustomModule: v.id.startsWith('custom.'),
        })),
      }
    },

    async import(_data: Record<string, unknown>, _strategy: ImportStrategy): Promise<void> {
      console.log('[ViewSerializer] 视图注册由 ModuleRuntime 在模块导入后自动重建')
    },
  }
}
