/**
 * Light 亮色主题 Manifest
 * 最小配置，主要依赖 semantic.css 中的默认值
 */

import type { ThemeManifest } from '../types'

export const lightManifest: ThemeManifest = {
  id: 'light',
  name: '明亮日光',
  mode: 'light',

  iconStyle: {
    family: 'lucide',
    strokeStyle: 'round',
    defaultStrokeWidth: 2,
  },

  motionStyle: {
    motionScale: 1,
    interactionMode: 'modern',
  },
}
