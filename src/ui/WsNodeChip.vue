<template>
  <span
    :class="[
      'ws-node-chip',
      `ws-node-chip--${group}`,
      `ws-node-chip--${size}`,
      { 'ws-node-chip--selected': selected, 'ws-node-chip--disabled': disabled },
    ]"
    :title="meta?.description_zh ?? label"
  >
    <span v-if="showIcon" class="ws-node-chip__icon" aria-hidden="true">{{ iconGlyph }}</span>
    <span class="ws-node-chip__label">{{ label }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { builtinNodeMetadata } from '@/plugins/official/workflow/node-metadata'

type ChipGroup = 'trigger' | 'execute' | 'ai' | 'control' | 'data' | 'end' | 'neutral'

const TYPE_TO_GROUP: Record<string, ChipGroup> = {
  start: 'trigger',
  pivot: 'trigger',
  skill: 'execute',
  tool: 'execute',
  sub_agent: 'execute',
  agent_decision: 'ai',
  condition: 'control',
  skip: 'control',
  loop: 'control',
  iterate: 'control',
  parallel: 'control',
  code: 'data',
  sub_workflow: 'data',
  end: 'end',
}

const ICON_FALLBACK: Record<string, string> = {
  play: '▶',
  close: '■',
  pin: '◆',
  'chevron-down': '⤵',
  'chevron-right': '⤵',
  lightning: '⚡',
  star: '★',
  settings: '⚙',
  character: '☻',
  keyboard: '⌨',
  refresh: '↻',
  manuscript: '☰',
}

const props = withDefaults(defineProps<{
  type: string
  size?: 'sm' | 'md'
  showIcon?: boolean
  label?: string
  selected?: boolean
  disabled?: boolean
}>(), {
  size: 'sm',
  showIcon: true,
  label: undefined,
  selected: false,
  disabled: false,
})

const meta = computed(() => builtinNodeMetadata.find(m => m.type === props.type))

const group = computed<ChipGroup>(() => TYPE_TO_GROUP[props.type] ?? 'neutral')

const iconGlyph = computed(() => {
  if (!meta.value) return '·'
  return ICON_FALLBACK[meta.value.icon] ?? meta.value.icon.slice(0, 2)
})

const label = computed(() => props.label ?? meta.value?.label_zh ?? props.type)
</script>

<style scoped>
.ws-node-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-family-base);
  font-weight: var(--font-weight-medium);
  line-height: 1;
  border: 1px solid transparent;
  border-radius: 6px;
  white-space: nowrap;
  user-select: none;
  transition: background 120ms ease, border-color 120ms ease;
}
.ws-node-chip--sm { padding: 3px 8px; font-size: 11px; }
.ws-node-chip--md { padding: 5px 10px; font-size: 12px; }

.ws-node-chip__icon { font-size: 1.1em; line-height: 1; opacity: 0.85; }
.ws-node-chip__label { line-height: 1; }

.ws-node-chip--trigger { background: color-mix(in srgb, #22C55E 14%, transparent); color: #4ADE80; border-color: color-mix(in srgb, #22C55E 32%, transparent); }
.ws-node-chip--execute { background: color-mix(in srgb, #3B82F6 14%, transparent); color: #60A5FA; border-color: color-mix(in srgb, #3B82F6 32%, transparent); }
.ws-node-chip--ai      { background: color-mix(in srgb, #EC4899 14%, transparent); color: #F472B6; border-color: color-mix(in srgb, #EC4899 32%, transparent); }
.ws-node-chip--control { background: color-mix(in srgb, #F59E0B 14%, transparent); color: #FBBF24; border-color: color-mix(in srgb, #F59E0B 32%, transparent); }
.ws-node-chip--data    { background: color-mix(in srgb, #84CC16 14%, transparent); color: #A3E635; border-color: color-mix(in srgb, #84CC16 32%, transparent); }
.ws-node-chip--end     { background: color-mix(in srgb, #EF4444 14%, transparent); color: #F87171; border-color: color-mix(in srgb, #EF4444 32%, transparent); }
.ws-node-chip--neutral { background: rgba(255, 255, 255, 0.05); color: var(--color-text-tertiary); border-color: rgba(255, 255, 255, 0.1); }

.ws-node-chip--selected { box-shadow: 0 0 0 2px var(--color-primary); }
.ws-node-chip--disabled { opacity: 0.4; pointer-events: none; }
</style>
