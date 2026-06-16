/**
 * Forge Ember 主题 Manifest
 * 锻造余烬风格：暖色调、工业感、沉稳
 */

import type { ThemeManifest } from '../types'

export const forgeEmberManifest: ThemeManifest = {
  id: 'forge-ember',
  name: '锻造余烬',
  mode: 'dark',

  motionStyle: {
    easingOverrides: {
      'ease-enter': 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    },
    durationOverrides: {
      'duration-enter': '200ms',
      'duration-exit': '120ms',
    },
    motionScale: 0.9,
    interactionMode: 'minimal',
  },

  iconStyle: {
    family: 'lucide',
    strokeStyle: 'round',
    defaultStrokeWidth: 2,
  },
}
