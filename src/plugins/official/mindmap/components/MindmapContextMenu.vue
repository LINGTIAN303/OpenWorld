<template>
  <div v-if="show" class="context-menu" :style="{ left: pos.x + 'px', top: pos.y + 'px' }">
    <div class="ctx-section">
      <div class="ctx-section-title">节点信息</div>
      <div class="ctx-node-info">
        <WsIcon class="ctx-icon" :name="resolveIcon(iconForType(contextNode?.type || ''))" size="sm" :fallback="iconForType(contextNode?.type || '')" />
        <span class="ctx-name">{{ contextNode?.name || contextNode?.id }}</span>
      </div>
      <div class="ctx-detail">类型: {{ typeLabel(contextNode?.type || '') }}</div>
      <div v-if="contextNode?.type !== 'textbox' && contextNode?.type !== 'image' && contextNode?.type !== 'note' && contextNode?.type !== 'link' && contextNode?.type !== 'group' && contextNode?.type !== 'center'" class="ctx-detail">
        ID: {{ contextNode?.id }}
      </div>
    </div>

    <div class="ctx-section">
      <div class="ctx-section-title">操作</div>
      <div v-if="contextNode?.type !== 'textbox' && contextNode?.type !== 'image' && contextNode?.type !== 'note' && contextNode?.type !== 'link' && contextNode?.type !== 'group' && contextNode?.type !== 'center'" class="ctx-item" @click="emit('open-detail')"><WsIcon name="outline" size="xs" /> 查看详情</div>
      <div class="ctx-item" @click="emit('edit-tags')"><WsIcon name="tag" size="xs" /> 编辑标签</div>
      <div class="ctx-item" @click="emit('edit-description')"><WsIcon name="edit" size="xs" /> 编辑描述</div>
      <div class="ctx-item" @click="emit('edit-color')"><WsIcon name="palette" size="xs" /> 设置颜色</div>
      <div v-if="editMode && (contextNode?.type === 'textbox' || contextNode?.type === 'image' || contextNode?.type === 'note' || contextNode?.type === 'link' || contextNode?.type === 'group')" class="ctx-item" @click="emit('resize-node')"><WsIcon name="outline" size="xs" /> 调整大小</div>
    </div>

    <div class="ctx-section">
      <div class="ctx-section-title">连接</div>
      <div class="ctx-item" @click="emit('start-connect')"><WsIcon name="link" size="xs" /> 连接此节点</div>
      <div class="ctx-item" @click="emit('create-entity')"><WsIcon name="magic" size="xs" /> 创建关联实体</div>
      <div class="ctx-item" @click="emit('collapse-toggle')">
        <WsIcon :name="collapsedNodes.has(contextNode?.id || '') ? 'folder' : 'folder'" size="xs" /> {{ collapsedNodes.has(contextNode?.id || '') ? '展开子节点' : '折叠子节点' }}
      </div>
    </div>

    <div class="ctx-section" v-if="contextNode?.type !== 'center'">
      <div class="ctx-section-title">视图</div>
      <div class="ctx-item" @click="emit('focus-node')"><WsIcon name="search" size="xs" /> 聚焦此节点</div>
    </div>

    <div class="ctx-section">
      <div class="ctx-section-title danger">危险操作</div>
      <div class="ctx-item danger" @click="emit('delete-node')"><WsIcon name="delete" size="xs" /> 删除节点</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import WsIcon from '../../../../ui/WsIcon.vue'
import { typeLabel, iconForType } from '../mindmapConfig'

const emojiToIcon: Record<string, string> = {
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
}

function resolveIcon(emoji: string): string {
  return emojiToIcon[emoji] || emoji
}

defineProps<{
  show: boolean
  pos: { x: number; y: number }
  contextNode: { id: string; name: string; type: string } | null
  editMode: boolean
  collapsedNodes: Set<string>
}>()

const emit = defineEmits<{
  'open-detail': []
  'edit-tags': []
  'edit-description': []
  'edit-color': []
  'resize-node': []
  'start-connect': []
  'create-entity': []
  'collapse-toggle': []
  'focus-node': []
  'delete-node': []
}>()
</script>

<style scoped>
.context-menu {
  position: fixed; z-index: var(--z-popover); min-width: 200px;
  background: var(--card-bg); border: 1px solid var(--border-color);
  border-radius: var(--radius-lg); box-shadow: var(--shadow-xl);
  padding: 4px 0; pointer-events: auto;
}
.ctx-section { padding: 4px 0; }
.ctx-section:not(:last-child) { border-bottom: 1px solid var(--border-color); }
.ctx-section-title { padding: 2px 12px; font-size: var(--font-size-xs); font-weight: var(--font-weight-semibold); color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.5px; }
.ctx-section-title.danger { color: var(--danger); }
.ctx-node-info { display: flex; align-items: center; gap: 6px; padding: 4px 12px; }
.ctx-icon { font-size: var(--font-size-xl); }
.ctx-name { font-weight: var(--font-weight-semibold); font-size: var(--font-size-sm); }
.ctx-detail { padding: 2px 12px; font-size: var(--font-size-xs); color: var(--text-secondary); }
.ctx-item { padding: 6px 12px; font-size: var(--font-size-sm); cursor: pointer; transition: background var(--transition-fast); }
.ctx-item:hover { background: var(--hover-bg); }
.ctx-item.danger { color: var(--danger); }
</style>