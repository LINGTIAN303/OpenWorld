/**
 * Aurora Abyss 主题 Manifest
 * 极光深渊风格：冷色调、流动感、科技感
 */

import type { ThemeManifest } from '../types'

export const auroraAbyssManifest: ThemeManifest = {
  id: 'aurora-abyss',
  name: '极光深渊',
  mode: 'dark',

  motionStyle: {
    easingOverrides: {
      'ease-enter': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      'ease-modal': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    },
    durationOverrides: {
      'duration-enter': '320ms',
      'duration-modal': '400ms',
    },
    motionScale: 1.05,
    interactionMode: 'modern',
  },

  iconStyle: {
    family: 'lucide',
    strokeStyle: 'round',
    defaultStrokeWidth: 1.8,
  },
}
