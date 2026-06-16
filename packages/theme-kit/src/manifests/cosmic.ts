/**
 * Cosmic 默认暗色主题 Manifest
 * 最小配置，主要依赖 semantic.css 中的默认值
 */

import type { ThemeManifest } from '../types'

export const cosmicManifest: ThemeManifest = {
  id: 'cosmic',
  name: '宇宙深空',
  mode: 'dark',

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
