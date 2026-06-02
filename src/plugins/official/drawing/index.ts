import type { PluginAPIType } from '@worldsmith/entity-core'
import DrawingView from './DrawingView.vue'

export const manifest = {
  id: 'official.drawing',
  name: '画板',
  version: '1.0.0',
  description: '自由绘画、植入世界观图示',
  author: 'WorldSmith',
  agentSkills: [],
  agentCapabilities: [
    { action: 'render_image', description: '渲染绘图' },
    { action: 'export_canvas', description: '导出画布' },
  ],
}

export function activate(api: PluginAPIType) {
  api.registerView({
    id: 'drawing',
    label: '画板',
    icon: 'drawing',
    component: DrawingView,
  })
}
