<template>
  <div class="ws-collapse">
    <div v-for="(panel, idx) in panels" :key="panel.key ?? idx" class="ws-collapse__panel">
      <button
        class="ws-collapse__header"
        :aria-expanded="expandedSet.has(panel.key ?? idx)"
        :aria-controls="getPanelId(panel.key ?? idx)"
        @click="toggle(panel.key ?? idx)"
      >
        <span class="ws-collapse__arrow" :class="{ open: expandedSet.has(panel.key ?? idx) }">▸</span>
        <span class="ws-collapse__title">{{ panel.title }}</span>
        <span v-if="panel.extra" class="ws-collapse__extra">{{ panel.extra }}</span>
      </button>
      <Transition name="ws-collapse">
        <div v-if="expandedSet.has(panel.key ?? idx)" :id="getPanelId(panel.key ?? idx)" class="ws-collapse__body" role="region">
          <slot :name="panel.key ?? idx" :panel="panel">{{ panel.content }}</slot>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

export interface CollapsePanel {
  key?: string | number
  title: string
  content?: string
  extra?: string
  disabled?: boolean
}

const props = withDefaults(defineProps<{
  panels: CollapsePanel[]
  accordion?: boolean
  defaultExpanded?: (string | number)[]
}>(), {
  accordion: false,
  defaultExpanded: () => [],
})

const expandedSet = ref<Set<string | number>>(new Set(props.defaultExpanded))

let collapseIdCounter = 0
const instanceId = ++collapseIdCounter

function getPanelId(key: string | number) {
  return `ws-collapse-${instanceId}-panel-${key}`
}

watch(() => props.defaultExpanded, (val) => {
  expandedSet.value = new Set(val)
})

function toggle(key: string | number) {
  const panel = props.panels.find(p => (p.key ?? props.panels.indexOf(p)) === key)
  if (panel?.disabled) return

  const next = new Set(expandedSet.value)
  if (next.has(key)) {
    next.delete(key)
  } else {
    if (props.accordion) next.clear()
    next.add(key)
  }
  expandedSet.value = next
}
</script>

<style scoped>
.ws-collapse { border: 1px solid var(--color-border-subtle); border-radius: var(--radius-lg); overflow: hidden; }
.ws-collapse__panel { border-bottom: 1px solid var(--color-border-subtle); }
.ws-collapse__panel:last-child { border-bottom: none; }

.ws-collapse__header {
  display: flex; align-items: center; gap: var(--space-2); width: 100%;
  padding: var(--space-3) var(--space-4); border: none;
  background: var(--color-bg-surface); cursor: pointer; font-size: var(--font-size-base);
  color: var(--color-text-primary); font-weight: var(--font-weight-medium); text-align: left;
  transition: background var(--duration-fast) var(--ease-default);
}
.ws-collapse__header:hover { background: var(--color-bg-hover); }
.ws-collapse__header:focus-visible { box-shadow: var(--shadow-focus-ring); outline: none; z-index: 1; position: relative; }
.ws-collapse__header:active { transform: scale(var(--state-pressed-scale)); }

.ws-collapse__arrow { font-size: var(--font-size-xs); color: var(--color-text-tertiary); transition: transform var(--duration-fast) var(--ease-default); }
.ws-collapse__arrow.open { transform: rotate(90deg); }
.ws-collapse__title { flex: 1; }
.ws-collapse__extra { font-size: var(--font-size-xs); color: var(--color-text-tertiary); font-weight: var(--font-weight-normal); }

.ws-collapse__body { padding: var(--space-3) var(--space-4); font-size: var(--font-size-sm); color: var(--color-text-secondary); }

.ws-collapse-enter-active { transition: background var(--duration-normal) var(--ease-default), border-color var(--duration-normal) var(--ease-default), color var(--duration-normal) var(--ease-default), box-shadow var(--duration-normal) var(--ease-default), transform var(--duration-normal) var(--ease-default), opacity var(--duration-normal) var(--ease-default), filter var(--duration-normal) var(--ease-default); }
.ws-collapse-leave-active { transition: background var(--duration-fast) var(--ease-in), border-color var(--duration-fast) var(--ease-in), color var(--duration-fast) var(--ease-in), box-shadow var(--duration-fast) var(--ease-in), transform var(--duration-fast) var(--ease-in), opacity var(--duration-fast) var(--ease-in), filter var(--duration-fast) var(--ease-in); }
.ws-collapse-enter-from, .ws-collapse-leave-to { opacity: 0; max-height: 0; overflow: hidden; }
</style>
