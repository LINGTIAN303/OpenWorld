<template>
  <div v-if="links.length" class="backlink-panel">
    <div class="bl-title">反向链接 ({{ links.length }})</div>
    <div v-for="link in links" :key="link.id" class="bl-item" @click="$emit('navigate', link.id)">
      {{ link.name }}
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ links: any[] }>()
defineEmits<{ navigate: [id: string] }>()
</script>

<style scoped>
.backlink-panel { border-top: 1px solid var(--color-border-subtle); padding: 8px 16px; }
.bl-title { font-size: var(--font-size-xs); font-weight: var(--font-weight-semibold); color: var(--color-text-tertiary); text-transform: uppercase; margin-bottom: 4px; }
.bl-item { font-size: var(--font-size-sm); color: var(--color-primary); cursor: pointer; padding: 2px 0; }
.bl-item:hover { text-decoration: underline; }
</style>
