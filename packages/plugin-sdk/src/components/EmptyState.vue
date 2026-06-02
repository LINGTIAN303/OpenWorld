<template>
  <div class="empty-state">
    <span class="empty-icon">{{ icon }}</span>
    <p class="empty-msg">{{ message }}</p>
    <p v-if="hint" class="empty-hint">{{ hint }}</p>
    <button v-if="actionText" class="empty-btn" @click="$emit('action')">{{ actionText }}</button>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  icon?: string
  message: string
  hint?: string
  actionText?: string
}>()
defineEmits<{ action: [] }>()
</script>

<style scoped>
.empty-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 48px 20px; text-align: center;
}
.empty-icon { font-size: var(--icon-2xl); margin-bottom: 12px; opacity: 0.6; }
.empty-msg { font-size: var(--font-size-base); color: #888; margin: 0 0 4px; }
.empty-hint { font-size: var(--font-size-sm); color: #555; margin: 0 0 16px; }
.empty-btn {
  padding: 8px 20px; background: var(--accent-bg); color: var(--accent);
  border: 1px solid var(--accent); border-radius: 6px; cursor: pointer; font-size: var(--font-size-sm);
}
.empty-btn:hover { background: #5a3a9a; }
</style>
