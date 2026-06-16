import type { Entity } from '@worldsmith/entity-core'
import { RelationTypes, getRelationLabel } from '@worldsmith/entity-core'
import { getNodeColor, getNodeTypeInfo, getEdgeColor } from '@worldsmith/entity-core'

export const EMOJI_TO_ICON: Record<string, string> = {
  '📋': 'outline', '🏷️': 'tag', '📝': 'edit', '🎨': 'palette',
  '📐': 'outline', '🔗': 'link', '✨': 'magic', '📂': 'folder',
  '📁': 'folder', '🔍': 'search', '🗑️': 'delete', '⭐': 'star',
  '🏠': 'home', '⚔️': 'war', '📜': 'manuscript', '📍': 'location',
  '💡': 'inspiration', '🎭': 'culture', '🐉': 'species', '🧠': 'concept',
  '🧬': 'species', '🐣': 'character', '🌱': 'plant', '⚡': 'lightning',
  '💀': 'skull', '🛡️': 'shield', '🔮': 'magic', '💍': 'tag',
  '🧪': 'magic', '🔧': 'settings', '🚢': 'trade', '🎵': 'music',
  '🏺': 'item', '🍷': 'item', '👘': 'apparel', '📦': 'item',
  '✅': 'check', '📌': 'pin', '🌿': 'plant', '🗡️': 'weapon',
  '🏗️': 'building', '📄': 'manuscript', '🧩': 'puzzle', '👤': 'user',
  '🖼️': 'image', '⬆️': 'arrow-up', '🔄': 'refresh', '🎯': 'target',
  '🖌️': 'brush',
}

export function resolveIcon(emoji: string): string {
  return EMOJI_TO_ICON[emoji] || emoji
}

export function typeColor(type: string): string {
  return getNodeColor(type, 'warm')
}

export function edgeColor(relType: string): string {
  return getEdgeColor(relType, 'warm')
}

export function typeShape(type: string): string {
  return getNodeTypeInfo(type).shape
}

export function typeLabel(type: string): string {
  return getNodeTypeInfo(type).label
}

export function iconForType(type: string): string {
  return getNodeTypeInfo(type).icon
}

export function nodeSize(relCount: number): number {
  return Math.min(60, Math.max(32, 36 + relCount * 3))
}

export function guessRelType(src: string, tgt: string): string {
  const map: Record<string, string> = {
    [`character_item`]: RelationTypes.OWNS,
    [`item_character`]: RelationTypes.OWNED_BY,
    [`character_region`]: RelationTypes.RESIDES_IN,
    [`region_character`]: RelationTypes.NOTABLE_FOR,
    [`character_organization`]: RelationTypes.BELONGS_TO,
    [`organization_character`]: RelationTypes.MEMBER_OF,
    [`character_event`]: RelationTypes.PARTICIPATED_IN,
    [`character_concept`]: RelationTypes.ASSOCIATED_WITH,
  }
  return map[`${src}_${tgt}`] || map[`${tgt}_${src}`] || RelationTypes.ASSOCIATED_WITH
}

export const LAYOUT_OPTIONS = [
  { value: 'mindmapTree', label: '思维导图' },
  { value: 'force', label: '力导向布局' },
  { value: 'radial', label: '径向布局' },
  { value: 'tree', label: '树形布局' },
  { value: 'compact', label: '紧凑布局' },
]

export function getViewIdForEntity(node: { id: string; type: string }): string | null {
  const viewMap: Record<string, string> = {
    character: 'characters', region: 'regions', event: 'timeline',
    organization: 'organizations', concept: 'concepts', item: 'items',
  }
  return viewMap[node.type] || null
}

export type EdgeLineStyle = 'bezier' | 'straight' | 'taxi' | 'unbundled-bezier'

export function edgeLineStyle(relType: string): EdgeLineStyle {
  const map: Record<string, EdgeLineStyle> = {
    belongs_to: 'taxi',
    member_of: 'taxi',
    located_in: 'taxi',
    parent_of: 'taxi',
    controls: 'straight',
    hostile_to: 'straight',
  }
  return map[relType] || 'bezier'
}

export interface KeySequenceDef {
  sequence: string
  description: string
  category: string
}

export const KEY_SEQUENCES: KeySequenceDef[] = [
  { sequence: 'n c', description: '新建角色', category: '新建' },
  { sequence: 'n r', description: '新建区域', category: '新建' },
  { sequence: 'n e', description: '新建事件', category: '新建' },
  { sequence: 'n t', description: '新建文本框', category: '新建' },
  { sequence: 'e n', description: '编辑名称', category: '编辑' },
  { sequence: 'e d', description: '编辑描述', category: '编辑' },
  { sequence: 'c l', description: '连接节点', category: '操作' },
  { sequence: 'd n', description: '删除节点', category: '操作' },
  { sequence: 'g s', description: '创建分组框', category: '操作' },
  { sequence: 'f n', description: '聚焦节点', category: '视图' },
  { sequence: 'j i', description: '进入子图', category: '导航' },
]

export const SINGLE_KEYS: Record<string, string> = {
  delete: '删除选中',
  escape: '取消/返回',
  i: '切换详情侧栏',
  f: '适应视图',
}
