import {
  serializerRegistry,
  PACK_VERSION,
  type WorldSmithPack,
} from './WorldSmithPack'
import * as yaml from 'js-yaml'
import { PackageBuilder } from './PackageBuilder'

/**
 * ExportController — 统一导出调度器
 *
 * 遍历所有已注册的 Serializer，收集数据并组装为 WorldSmithPack。
 * 支持按 serializer id 选择性导出（TODO: 后续 UI 勾选）。
 */
export class ExportController {
  private formatEncoder: FormatEncoder

  constructor(encoder?: FormatEncoder) {
    this.formatEncoder = encoder ?? defaultFormatEncoder
  }

  setEncoder(encoder: FormatEncoder): void {
    this.formatEncoder = encoder
  }

  /**
   * 收集所有 Serializer 的数据
   */
  async collectAll(
    includeSerializers?: string[],
  ): Promise<WorldSmithPack> {
    const serializers = serializerRegistry.getSorted()
    const pack: WorldSmithPack = {
      manifest: {
        version: PACK_VERSION,
        exportedAt: new Date().toISOString(),
        appVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0',
      },
      serializers: {},
    }

    for (const s of serializers) {
      if (includeSerializers && !includeSerializers.includes(s.id)) {
        continue
      }
      try {
        const data = await s.collect()
        pack.serializers[s.id] = data
      } catch (err: any) {
        console.error(`[ExportController] ${s.id} collect 失败:`, err)
        pack.serializers[s.id] = { error: err.message }
      }
    }

    return pack
  }

  /**
   * 收集数据并编码为指定格式的字符串
   */
  async exportToString(
    format: 'json' | 'yaml',
    includeSerializers?: string[],
  ): Promise<string> {
    const pack = await this.collectAll(includeSerializers)
    return this.formatEncoder.encode(pack, format)
  }

  /**
   * 收集数据并下载为 .ws 包（ZIP 格式，含媒体文件）
   */
  async downloadWS(
    filename?: string,
    includeSerializers?: string[],
  ): Promise<void> {
    const pack = await this.collectAll(includeSerializers)
    const entityData = pack.serializers['entities'] as any
    const entities = entityData?.entities ?? []

    const builder = new PackageBuilder()
    const blob = await builder.build(pack, entities)

    const name = filename ?? `worldsmith-export-${new Date().toISOString().slice(0, 10)}.ws`
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }

  /**
   * 收集数据并下载为文件（浏览器环境）
   */
  async download(
    format: 'json' | 'yaml',
    filename?: string,
  ): Promise<void> {
    const text = await this.exportToString(format)
    const ext = format === 'yaml' ? 'yaml' : 'json'
    const name = filename ?? `worldsmith-export-${new Date().toISOString().slice(0, 10)}.${ext}`
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }
}

/* ════════════════════════════════════════
   FormatEncoder — 编码器
   ════════════════════════════════════════ */

export interface FormatEncoder {
  encode(pack: WorldSmithPack, format: 'json' | 'yaml'): string
  encodeHTML(pack: WorldSmithPack, opts?: HtmlExportOptions): string
  encodeMarkdown(pack: WorldSmithPack, opts?: HtmlExportOptions): string
}

export interface HtmlExportOptions {
  includeTimestamps?: boolean
  title?: string
}

/**
 * 默认编码器实现（JSON + 简易 YAML + HTML）
 *
 * YAML 部分当前使用简易实现，推荐后续安装 js-yaml 替换。
 */
export const defaultFormatEncoder: FormatEncoder = {
  encode(pack: WorldSmithPack, format: 'json' | 'yaml'): string {
    if (format === 'yaml') return yaml.dump(pack as unknown as Record<string, unknown>, { indent: 2, noRefs: true })
    return JSON.stringify(pack, null, 2)
  },

  encodeHTML(pack: WorldSmithPack, opts?: HtmlExportOptions): string {
    const title = opts?.title ?? 'WorldSmith 设定文档'
    const includeTimestamps = opts?.includeTimestamps ?? true
    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>`
      + '<style>body{font-family:system-ui,sans-serif;max-width:900px;margin:40px auto;padding:20px}'
      + 'h1{color:#4f46e5}h2{border-bottom:2px solid #e5e7eb;padding-bottom:4px}'
      + 'table{border-collapse:collapse;width:100%;margin:12px 0}'
      + 'td,th{border:1px solid #e5e7eb;padding:6px 10px;text-align:left;font-size:13px}'
      + 'th{background:#f3f4f6}</style></head><body>'
      + `<h1>${esc(title)}</h1>`
      + `<p>生成时间: ${new Date().toLocaleString('zh-CN')}</p><hr>`

    const entityData = pack.serializers['entities'] as any
    if (entityData?.entities) {
      html += '<h2>实体</h2>'
      const grouped = groupBy(entityData.entities, 'type')
      for (const [type, entities] of Object.entries(grouped)) {
        html += `<h3>📄 ${esc(type)}</h3><table><tr><th>名称</th><th>描述</th>`
        if (includeTimestamps) html += '<th>更新</th>'
        html += '</tr>'
        for (const e of entities as any[]) {
          html += `<tr><td>${esc(e.name)}</td><td>${esc((e.description ?? '').slice(0, 100))}</td>`
          if (includeTimestamps) html += `<td>${new Date(e.updatedAt).toLocaleString('zh-CN')}</td>`
          html += '</tr>'
        }
        html += '</table>'
      }
    }

    const relationData = pack.serializers['relations'] as any
    if (relationData?.relations) {
      html += '<h2>关系</h2><table><tr><th>来源</th><th>关系类型</th><th>目标</th></tr>'
      for (const r of relationData.relations) {
        html += `<tr><td>${esc(r.sourceId)}</td><td>${esc(r.label ?? r.type)}</td><td>${esc(r.targetId)}</td></tr>`
      }
      html += '</table>'
    }

    html += '</body></html>'
    return html
  },

  encodeMarkdown(pack: WorldSmithPack, _opts?: HtmlExportOptions): string {
    let md = `# WorldSmith 设定文档\n\n生成时间: ${new Date().toLocaleString('zh-CN')}\n\n---\n\n`

    const entityData = pack.serializers['entities'] as any
    if (entityData?.entities) {
      md += '## 实体\n\n'
      const grouped = groupBy(entityData.entities, 'type')
      for (const [type, entities] of Object.entries(grouped)) {
        md += `### ${type}\n\n`
        md += '| 名称 | 描述 |\n|------|------|\n'
        for (const e of entities as any[]) {
          md += `| ${e.name} | ${(e.description ?? '').slice(0, 100)} |\n`
        }
        md += '\n'
      }
    }

    const relationData = pack.serializers['relations'] as any
    if (relationData?.relations) {
      md += '## 关系\n\n| 来源 | 类型 | 目标 |\n|------|------|------|\n'
      for (const r of relationData.relations) {
        md += `| ${r.sourceId} | ${r.label ?? r.type} | ${r.targetId} |\n`
      }
      md += '\n'
    }

    return md
  },
}

/* ─── 辅助函数 ─── */

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function groupBy(arr: any[], key: string): Record<string, any[]> {
  const m: Record<string, any[]> = {}
  for (const item of arr) {
    const k = item[key] as string
    if (!m[k]) m[k] = []
    m[k].push(item)
  }
  return m
}


