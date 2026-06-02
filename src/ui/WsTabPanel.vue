<template>
  <div v-if="active" :id="`ws-tabpanel-${value}`" :class="['ws-tab-panel', { 'ws-tab-panel--active': active }]" role="tabpanel" :aria-labelledby="`ws-tab-${value}`">
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed, inject, type ComputedRef } from 'vue'

const props = defineProps<{ value: string }>()

const modelValue = inject<ComputedRef<string>>('ws-tabs-model', computed(() => ''))
const active = computed(() => modelValue.value === props.value)
</script>

<style scoped>
.ws-tab-panel { display: none; }
.ws-tab-panel--active { display: block; }
</style>
