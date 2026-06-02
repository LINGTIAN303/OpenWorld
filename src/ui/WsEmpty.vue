<template>
  <div class="ws-empty" role="status">
    <div class="ws-empty__icon">
      <slot name="icon">
        <WsIcon :name="presetIcon" size="xl" />
      </slot>
    </div>
    <div v-if="displayTitle" class="ws-empty__title">{{ displayTitle }}</div>
    <div v-if="displayDescription" class="ws-empty__desc">{{ displayDescription }}</div>
    <div v-if="$slots.action" class="ws-empty__action"><slot name="action" /></div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import WsIcon from './WsIcon.vue'

export type EmptyPreset = 'no-data' | 'no-result' | 'no-connection' | 'custom'

const props = withDefaults(defineProps<{
  preset?: EmptyPreset
  title?: string
  description?: string
}>(), {
  preset: 'custom',
})

const PRESET_CONFIG: Record<string, { icon: string; title: string; description: string }> = {
  'no-data': { icon: 'manuscript', title: '暂无数据', description: '还没有任何内容，点击下方按钮开始创建' },
  'no-result': { icon: 'search', title: '未找到匹配项', description: '尝试调整筛选条件或搜索关键词' },
  'no-connection': { icon: 'warning', title: '连接已断开', description: '请检查网络连接后重试' },
}

const presetIcon = computed(() => PRESET_CONFIG[props.preset]?.icon || 'manuscript')
const displayTitle = computed(() => props.title || PRESET_CONFIG[props.preset]?.title || '')
const displayDescription = computed(() => props.description || PRESET_CONFIG[props.preset]?.description || '')
</script>

<style scoped>
.ws-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: var(--space-8) var(--space-4); text-align: center;
}
.ws-empty__icon { color: var(--color-text-tertiary); margin-bottom: var(--space-4); font-size: var(--icon-2xl); }
.ws-empty__title { font-size: var(--font-size-md); font-weight: var(--font-weight-medium); color: var(--color-text-secondary); margin-bottom: var(--space-1); }
.ws-empty__desc { font-size: var(--font-size-sm); color: var(--color-text-tertiary); max-width: 320px; line-height: var(--line-height-relaxed); }
.ws-empty__action { margin-top: var(--space-4); }
</style>
