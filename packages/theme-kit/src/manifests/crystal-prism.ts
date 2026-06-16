/**
 * Crystal Prism 主题 Manifest
 * 水晶棱镜风格：高对比、锐利、科技感、冷色
 */

import type { ThemeManifest } from '../types'

export const crystalPrismManifest: ThemeManifest = {
  id: 'crystal-prism',
  name: '水晶棱镜',
  mode: 'dark',

  shapeTokens: {
    radius: {
      btn: '8px',
      card: '12px',
      input: '8px',
      modal: '16px',
      toast: '8px',
      badge: '4px',
    },
  },

  motionStyle: {
    easingOverrides: {
      'ease-enter': 'cubic-bezier(0.4, 0, 0.2, 1)',
      'ease-exit': 'cubic-bezier(0.4, 0, 0.2, 1)',
    },
    durationOverrides: {
      'duration-enter': '150ms',
      'duration-exit': '100ms',
      'duration-modal': '200ms',
    },
    motionScale: 0.75,
    interactionMode: 'crystal-refract',
  },

  iconStyle: {
    family: 'lucide',
    strokeStyle: 'square',
    defaultStrokeWidth: 1.5,
  },

  componentOverrides: {
    button: {
      cssVars: {
        '--button-border': '1px solid var(--color-border-strong)',
      },
    },
    card: {
      cssVars: {
        '--card-border': '1px solid var(--color-border)',
      },
    },
  },
}
