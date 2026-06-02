<template>
  <div class="ws-error-page" role="alert">
    <div class="ws-error-page__icon">
      <WsIcon name="close" size="xl" />
    </div>
    <h3 class="ws-error-page__title">{{ displayTitle }}</h3>
    <p class="ws-error-page__message">{{ message }}</p>
    <div v-if="$slots.actions" class="ws-error-page__actions"><slot name="actions" /></div>
    <button v-else class="ws-error-page__retry" @click="$emit('retry')">
      <WsIcon name="refresh" size="xs" /> 重试
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import WsIcon from './WsIcon.vue'

export type ErrorType = 'network' | 'data' | 'permission' | 'generic'

const props = withDefaults(defineProps<{
  type?: ErrorType
  title?: string
  message?: string
}>(), {
  type: 'generic',
})

const TITLES: Record<ErrorType, string> = {
  network: '网络连接失败',
  data: '数据加载失败',
  permission: '没有访问权限',
  generic: '出了点问题',
}

defineEmits<{ retry: [] }>()

const displayTitle = computed(() => props.title || TITLES[props.type])
</script>

<style scoped>
.ws-error-page {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: var(--space-10) var(--space-4); text-align: center;
}
.ws-error-page__icon {
  width: 56px; height: 56px; border-radius: var(--radius-full);
  background: rgba(239, 68, 68, 0.12); color: var(--color-danger);
  display: flex; align-items: center; justify-content: center;
  margin-bottom: var(--space-4); font-size: var(--icon-2xl);
}
.ws-error-page__title {
  font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary); margin: 0 0 var(--space-2);
}
.ws-error-page__message {
  font-size: var(--font-size-sm); color: var(--color-text-secondary);
  max-width: 400px; margin: 0 0 var(--space-5); line-height: var(--line-height-relaxed);
}
.ws-error-page__actions { display: flex; gap: var(--space-2); }
.ws-error-page__retry {
  display: inline-flex; align-items: center; gap: var(--space-1);
  padding: var(--space-2) var(--space-4); background: var(--color-bg-surface);
  color: var(--color-text-secondary); border: 1px solid var(--color-border);
  border-radius: var(--radius-btn); cursor: pointer; font-size: var(--font-size-sm);
  transition: all var(--duration-fast) var(--ease-default);
}
.ws-error-page__retry:hover { background: var(--color-bg-hover); color: var(--color-text-primary); }
.ws-error-page__retry:focus-visible { box-shadow: 0 0 0 2px var(--color-primary); outline: none; }
</style>
