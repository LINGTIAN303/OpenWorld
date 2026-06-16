/**
 * 主题 Manifest 注册表
 * 自动注册所有内置主题
 */

import { registerManifest } from '../registry'
import type { ThemeManifest } from '../types'

import { cosmicManifest } from './cosmic'
import { auroraAbyssManifest } from './aurora-abyss'
import { forgeEmberManifest } from './forge-ember'
import { lightManifest } from './light'
import { inkScrollManifest } from './ink-scroll'
import { crystalPrismManifest } from './crystal-prism'

/** 所有内置主题 Manifest */
export const builtinManifests: ThemeManifest[] = [
  cosmicManifest,
  auroraAbyssManifest,
  forgeEmberManifest,
  lightManifest,
  inkScrollManifest,
  crystalPrismManifest,
]

/** 注册所有内置主题 Manifest */
export function registerAllManifests(): void {
  for (const manifest of builtinManifests) {
    registerManifest(manifest)
  }
}

export {
  cosmicManifest,
  auroraAbyssManifest,
  forgeEmberManifest,
  lightManifest,
  inkScrollManifest,
  crystalPrismManifest,
}
