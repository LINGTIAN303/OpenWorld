/**
 * 水墨卷轴主题 Manifest
 * 中式审美风格：宣纸纹理、吉祥纹样、玉镯质感、青花瓷元素
 */

import type { ThemeManifest } from '../types'

export const inkScrollManifest: ThemeManifest = {
  id: 'ink-scroll',
  name: '水墨卷轴',
  mode: 'light',

  // ── 形态令牌 ──
  shapeTokens: {
    radius: {
      btn: '2px',
      card: '4px',
      input: '2px',
      modal: '6px',
      toast: '4px',
      badge: '2px',
    },
    border: {
      card: '1px solid var(--color-border)',
      input: '1px solid var(--color-border)',
      modal: '1px solid var(--color-border-strong)',
      dropdown: '1px solid var(--color-border)',
    },
    shadow: {
      card: '0 1px 4px rgba(58,42,26,0.08)',
      cardHover: '0 8px 24px rgba(58,42,26,0.12)',
      modal: '0 16px 48px rgba(58,42,26,0.18)',
      dropdown: '0 8px 30px rgba(58,42,26,0.12)',
      tooltip: '0 4px 12px rgba(58,42,26,0.08)',
    },
  },

  // ── 纹理/装饰 ──
  textureTokens: {
    bgPattern: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Cg fill='none' stroke='%23d8cfc0' stroke-width='0.5' opacity='0.3'%3E%3Cpath d='M0 50 Q25 45 50 50 T100 50'/%3E%3Cpath d='M0 30 Q25 25 50 30 T100 30'/%3E%3Cpath d='M0 70 Q25 65 50 70 T100 70'/%3E%3C/g%3E%3C/svg%3E")`,
    cardTexture: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'%3E%3Cg fill='none' stroke='%23c4a95a' stroke-width='0.3' opacity='0.15'%3E%3Ccircle cx='30' cy='30' r='20'/%3E%3Ccircle cx='30' cy='30' r='15'/%3E%3Ccircle cx='30' cy='30' r='10'/%3E%3C/g%3E%3C/svg%3E")`,
    buttonTexture: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Cpath d='M0 20 L40 20' stroke='%232a2018' stroke-width='0.5' opacity='0.1'/%3E%3C/svg%3E")`,
    overlayTexture: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Cg fill='%232a2018' opacity='0.02'%3E%3Ccircle cx='40' cy='40' r='2'/%3E%3Ccircle cx='20' cy='20' r='1.5'/%3E%3Ccircle cx='60' cy='60' r='1.5'/%3E%3C/g%3E%3C/svg%3E")`,
    decorativeElements: [
      {
        type: 'corner-ornament',
        position: 'card-top-right',
        size: '24px',
        svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M20 4 L20 8 M20 4 L16 4 M20 4 L14 10" opacity="0.3"/></svg>`,
      },
      {
        type: 'corner-ornament',
        position: 'card-bottom-left',
        size: '24px',
        svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M4 20 L4 16 M4 20 L8 20 M4 20 L10 14" opacity="0.3"/></svg>`,
      },
    ],
  },

  // ── 图标风格 ──
  iconStyle: {
    family: 'hybrid',
    strokeStyle: 'round',
    defaultStrokeWidth: 1.8,
    customIconMap: {
      'home': {
        d: 'M3 12 L12 3 L21 12 M5 10 L5 20 L19 20 L19 10',
        fill: false,
      },
      'settings': {
        d: 'M12 8 A4 4 0 1 0 12 16 A4 4 0 1 0 12 8 M12 2 L12 5 M12 19 L12 22 M2 12 L5 12 M19 12 L22 12',
        fill: false,
      },
      'user': {
        d: 'M12 4 A4 4 0 1 0 12 12 A4 4 0 1 0 12 4 M4 20 C4 16 8 14 12 14 C16 14 20 16 20 20',
        fill: false,
      },
    },
  },

  // ── 动画风格 ──
  motionStyle: {
    easingOverrides: {
      'ease-enter': 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      'ease-exit': 'cubic-bezier(0.55, 0.085, 0.68, 0.53)',
      'ease-modal': 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    },
    durationOverrides: {
      'duration-enter': '280ms',
      'duration-exit': '180ms',
      'duration-modal': '320ms',
    },
    motionScale: 0.95,
    customKeyframes: {
      'ink-spread': `
        0% { transform: scale(0); opacity: 0.8; }
        50% { opacity: 0.4; }
        100% { transform: scale(1); opacity: 0; }
      `,
      'brush-stroke': `
        0% { stroke-dashoffset: 100; opacity: 0; }
        50% { opacity: 1; }
        100% { stroke-dashoffset: 0; opacity: 1; }
      `,
    },
    interactionMode: 'ink-spread',
  },

  // ── 组件形态覆盖 ──
  componentOverrides: {
    button: {
      cssVars: {
        '--button-font-weight': '500',
        '--button-border': '1px solid var(--color-border)',
      },
    },
    card: {
      cssVars: {
        '--card-border': '1px solid var(--color-border)',
      },
    },
    modal: {
      cssVars: {
        '--modal-border': '1px solid var(--color-border-strong)',
      },
    },
  },
}
