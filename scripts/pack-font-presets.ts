/**
 * 字体预设打包脚本
 *
 * 用法:
 *   npx tsx scripts/pack-font-presets.ts
 *
 * 前置条件:
 *   将字体源文件（.ttf / .otf / .woff2）放入 font-sources/ 目录:
 *     font-sources/mao-zedong/regular.ttf
 *     font-sources/source-han-serif-cn/regular.ttf
 *     font-sources/source-han-serif-cn/bold.ttf
 *     font-sources/lxgw-neo-zhisong/regular.ttf
 *     font-sources/liu-jian-mao-cao/regular.ttf
 *     font-sources/jiangxi-zhuokai/regular.ttf
 *     font-sources/xzfx-xingcao/regular.ttf
 *     font-sources/misans/regular.ttf
 *     font-sources/misans/medium.ttf
 *     font-sources/oppo-sans/regular.ttf
 *     font-sources/ibm-plex-sans-sc/regular.ttf
 *     font-sources/noto-sans-cjk-sc/regular.ttf
 *
 * 输出: public/fonts/*.wsfont
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs'
import { join, extname, dirname } from 'path'
import { fileURLToPath } from 'url'
import { packWsFont, type WsFontPackInput } from '../packages/font-kit/src/WsFontPack'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const SOURCE_DIR = join(__dirname, '..', 'font-sources')
const OUTPUT_DIR = join(__dirname, '..', 'public', 'fonts')

interface FontPresetConfig {
  id: string
  family: string
  displayName: string
  category: string
  author: string
  description: string
  tags: string[]
  license?: string
  variants: Array<{ fileName: string; weight: number; style: string }>
}

const PRESETS: FontPresetConfig[] = [
  {
    id: 'mao-zedong',
    family: 'Mao Ze Dong',
    displayName: '毛泽东字体',
    category: 'calligraphy',
    author: '字体家',
    description: '毛泽东书法风格字体',
    tags: ['书法', '毛体', 'calligraphy'],
    variants: [{ fileName: 'regular.ttf', weight: 400, style: 'normal' }],
  },
  {
    id: 'source-han-serif-cn',
    family: 'Source Han Serif CN',
    displayName: '思源宋体',
    category: 'serif',
    author: 'Adobe + Google',
    description: '思源宋体，经典中文衬线字体',
    tags: ['宋体', '衬线', 'serif'],
    license: 'OFL-1.1',
    variants: [
      { fileName: 'regular.ttf', weight: 400, style: 'normal' },
      { fileName: 'bold.ttf', weight: 700, style: 'normal' },
    ],
  },
  {
    id: 'lxgw-neo-zhisong',
    family: 'LXGW Neo ZhiSong',
    displayName: '霞鹜新志宋',
    category: 'serif',
    author: 'LXGW',
    description: '现代风格宋体，适合文学内容',
    tags: ['宋体', '现代', 'serif', '文艺'],
    license: 'OFL-1.1',
    variants: [{ fileName: 'regular.ttf', weight: 400, style: 'normal' }],
  },
  {
    id: 'liu-jian-mao-cao',
    family: 'Liu Jian Mao Cao',
    displayName: '刘建毛草',
    category: 'calligraphy',
    author: '刘建',
    description: '草书风格，适合标题与装饰',
    tags: ['草书', '书法', 'cursive'],
    license: 'OFL-1.1',
    variants: [{ fileName: 'regular.ttf', weight: 400, style: 'normal' }],
  },
  {
    id: 'jiangxi-zhuokai',
    family: 'jiangxizhuokai',
    displayName: '江西拙楷',
    category: 'serif',
    author: '江西字库',
    description: '拙朴楷书，适合正文阅读',
    tags: ['楷体', '楷书', 'kai'],
    license: 'OFL-1.1',
    variants: [{ fileName: 'regular.ttf', weight: 400, style: 'normal' }],
  },
  {
    id: 'xzfx-xingcao',
    family: 'shetifang-zxf-xingcao',
    displayName: '书体坊行草体',
    category: 'calligraphy',
    author: '书体坊',
    description: '书体坊禚效锋行草体',
    tags: ['行草', '书法', 'running-cursive'],
    variants: [{ fileName: 'regular.ttf', weight: 400, style: 'normal' }],
  },
  {
    id: 'misans',
    family: 'MiSans',
    displayName: 'MiSans',
    category: 'sans-serif',
    author: '小米',
    description: '小米 Sans，清晰现代的界面字体',
    tags: ['无衬线', 'sans-serif', '现代'],
    license: 'Free for commercial use',
    variants: [
      { fileName: 'regular.ttf', weight: 400, style: 'normal' },
      { fileName: 'medium.ttf', weight: 500, style: 'normal' },
    ],
  },
  {
    id: 'oppo-sans',
    family: 'OPPO Sans',
    displayName: 'OPPO Sans',
    category: 'sans-serif',
    author: 'OPPO',
    description: 'OPPO Sans，精致优雅的界面字体',
    tags: ['无衬线', 'sans-serif'],
    license: 'Free for commercial use',
    variants: [{ fileName: 'regular.ttf', weight: 400, style: 'normal' }],
  },
  {
    id: 'ibm-plex-sans-sc',
    family: 'IBM Plex Sans SC',
    displayName: 'IBM Plex Sans SC',
    category: 'sans-serif',
    author: 'IBM',
    description: 'IBM Plex 中文，技术风格界面字体',
    tags: ['无衬线', 'sans-serif', '技术'],
    license: 'OFL-1.1',
    variants: [{ fileName: 'regular.ttf', weight: 400, style: 'normal' }],
  },
  {
    id: 'noto-sans-cjk-sc',
    family: 'Noto Sans CJK SC',
    displayName: 'Noto Sans CJK SC',
    category: 'sans-serif',
    author: 'Google',
    description: 'Google Noto Sans CJK，字符覆盖最全',
    tags: ['无衬线', 'sans-serif', '中性'],
    license: 'OFL-1.1',
    variants: [{ fileName: 'regular.ttf', weight: 400, style: 'normal' }],
  },
]

function guessFormat(fileName: string): string {
  const ext = extname(fileName).toLowerCase()
  switch (ext) {
    case '.woff2': return 'woff2'
    case '.woff': return 'woff'
    case '.otf': return 'opentype'
    default: return 'truetype'
  }
}

async function packPreset(preset: FontPresetConfig) {
  const srcDir = join(SOURCE_DIR, preset.id)

  if (!existsSync(srcDir)) {
    console.warn(`  [SKIP] ${preset.id}: font-sources/${preset.id}/ not found`)
    return false
  }

  const variants: WsFontPackInput['variants'] = []
  for (const v of preset.variants) {
    const filePath = join(srcDir, v.fileName)
    if (!existsSync(filePath)) {
      console.warn(`  [SKIP] ${preset.id}: missing ${v.fileName}`)
      continue
    }
    const data = readFileSync(filePath)
    variants.push({
      data,
      weight: v.weight,
      style: v.style,
      format: guessFormat(v.fileName),
      fileName: `fonts/${v.fileName}`,
    })
  }

  if (variants.length === 0) {
    console.warn(`  [SKIP] ${preset.id}: no valid font files found`)
    return false
  }

  const blob = await packWsFont({
    id: preset.id,
    family: preset.family,
    displayName: preset.displayName,
    category: preset.category,
    author: preset.author,
    description: preset.description,
    tags: preset.tags,
    license: preset.license,
    variants,
  })

  const outputPath = join(OUTPUT_DIR, `${preset.id}.wsfont`)
  const buffer = Buffer.from(await blob.arrayBuffer())
  writeFileSync(outputPath, buffer)
  console.log(`  [OK] ${preset.id} -> public/fonts/${preset.id}.wsfont (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`)
  return true
}

async function main() {
  if (!existsSync(SOURCE_DIR)) {
    mkdirSync(SOURCE_DIR, { recursive: true })
    console.log(`Created font-sources/ directory.`)
    console.log(`Please place font files in the following structure:`)
    console.log(`  font-sources/<preset-id>/<variant>.ttf`)
    console.log(`\nExpected presets:`)
    for (const p of PRESETS) {
      console.log(`  font-sources/${p.id}/`)
      for (const v of p.variants) {
        console.log(`    ${v.fileName}`)
      }
    }
    return
  }

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true })
  }

  console.log(`Packing ${PRESETS.length} font presets...\n`)

  let packed = 0
  let skipped = 0
  for (const preset of PRESETS) {
    const ok = await packPreset(preset)
    if (ok) packed++
    else skipped++
  }

  console.log(`\nDone: ${packed} packed, ${skipped} skipped.`)
}

main().catch(console.error)
