<template>
  <div :class="['ws-tabs', `ws-tabs--${type}`]">
    <div class="ws-tabs__nav" role="tablist">
      <button
        v-for="tab in tabs"
        :key="tab.value"
        :id="`ws-tab-${tab.value}`"
        :class="['ws-tabs__tab', { 'ws-tabs__tab--active': modelValue === tab.value, 'ws-tabs__tab--disabled': tab.disabled }]"
        role="tab"
        :aria-selected="modelValue === tab.value"
        :aria-controls="`ws-tabpanel-${tab.value}`"
        :disabled="tab.disabled"
        @click="onTabClick(tab)"
      >
        <span v-if="tab.icon" class="ws-tabs__tab-icon">{{ tab.icon }}</span>
        <span class="ws-tabs__tab-label">{{ tab.label }}</span>
      </button>
      <div class="ws-tabs__indicator" :style="indicatorStyle"></div>
    </div>
    <div class="ws-tabs__panels">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, provide, watch, onMounted, nextTick } from 'vue'

export interface TabItem {
  label: string
  value: string
  icon?: string
  disabled?: boolean
}

const props = withDefaults(defineProps<{
  modelValue: string
  tabs: TabItem[]
  type?: 'line' | 'card' | 'pill'
}>(), {
  type: 'line',
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const navRef = ref<HTMLElement | null>(null)
const indicatorLeft = ref(0)
const indicatorWidth = ref(0)

provide('ws-tabs-model', computed(() => props.modelValue))

function onTabClick(tab: TabItem) {
  if (tab.disabled) return
  emit('update:modelValue', tab.value)
}

const indicatorStyle = computed(() => ({
  left: `${indicatorLeft.value}px`,
  width: `${indicatorWidth.value}px`,
}))

function updateIndicator() {
  if (!navRef.value) return
  const activeTab = navRef.value.querySelector('.ws-tabs__tab--active') as HTMLElement
  if (!activeTab) return
  indicatorLeft.value = activeTab.offsetLeft
  indicatorWidth.value = activeTab.offsetWidth
}

onMounted(() => {
  nextTick(updateIndicator)
})

watch(() => props.modelValue, () => {
  nextTick(updateIndicator)
})
</script>

<style scoped>
.ws-tabs { display: flex; flex-direction: column; }
.ws-tabs__nav { display: flex; position: relative; gap: var(--space-1); border-bottom: 1px solid var(--color-border-subtle); padding-bottom: 0; }

.ws-tabs--line .ws-tabs__nav { border-bottom: 1px solid var(--color-border-subtle); }
.ws-tabs--card .ws-tabs__nav { gap: var(--space-1); border-bottom: none; }
.ws-tabs--pill .ws-tabs__nav { gap: var(--space-1); border-bottom: none; background: var(--color-bg-elevated); border-radius: var(--radius-md); padding: var(--space-1); }

.ws-tabs__tab {
  display: inline-flex; align-items: center; gap: var(--space-1);
  padding: var(--space-2) var(--space-3); border: none; background: transparent;
  font-size: var(--font-size-sm); font-family: var(--font-family-base);
  color: var(--tabs-inactive-color); cursor: pointer;
  transition: color var(--duration-fast) var(--ease-default), background var(--duration-fast) var(--ease-default);
  white-space: nowrap; position: relative; outline: none; border-radius: var(--radius-sm);
}
.ws-tabs__tab:hover:not(.ws-tabs__tab--disabled) { color: var(--color-text-primary); }
.ws-tabs__tab--active { color: var(--tabs-active-color); font-weight: var(--font-weight-medium); }
.ws-tabs__tab--disabled { opacity: 0.5; cursor: not-allowed; }
.ws-tabs__tab:focus-visible { box-shadow: var(--shadow-focus-ring); }

.ws-tabs--card .ws-tabs__tab { border: 1px solid transparent; border-bottom: none; border-radius: var(--radius-sm) var(--radius-sm) 0 0; }
.ws-tabs--card .ws-tabs__tab--active { background: var(--color-bg-surface); border-color: var(--color-border-subtle); color: var(--tabs-active-color); margin-bottom: -1px; padding-bottom: calc(var(--space-2) + 1px); }

.ws-tabs--pill .ws-tabs__tab { border-radius: var(--radius-sm); }
.ws-tabs--pill .ws-tabs__tab--active { background: var(--color-primary); color: var(--color-primary-foreground, #fff); }

.ws-tabs__tab-icon { font-size: var(--font-size-sm); display: inline-flex; }
.ws-tabs__tab-label { }

.ws-tabs__indicator {
  position: absolute; bottom: -1px; height: 2px;
  background: var(--tabs-indicator);
  border-radius: 1px;
  transition: left var(--duration-normal) var(--ease-default), width var(--duration-normal) var(--ease-default);
}
.ws-tabs--card .ws-tabs__indicator,
.ws-tabs--pill .ws-tabs__indicator { display: none; }

.ws-tabs__panels { padding-top: var(--space-3); }
</style>
