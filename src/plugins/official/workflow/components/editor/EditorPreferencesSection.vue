<script setup lang="ts">
// EditorPreferencesSection — 简单包装
//
// P3 偏好设置:title + 描述 + slot 容器。

defineProps<{ title: string; description?: string }>()
</script>

<template>
  <section class="pref-section">
    <h4 class="pref-section-title">{{ title }}</h4>
    <p v-if="description" class="pref-section-desc">{{ description }}</p>
    <div class="pref-section-body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.pref-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 0;
}
.pref-section-title {
  font-size: 13px;
  font-weight: 600;
  margin: 0;
  color: var(--color-text-primary);
}
.pref-section-desc {
  font-size: 11px;
  color: var(--color-text-tertiary);
  margin: 0;
  line-height: 1.5;
}
.pref-section-body {
  margin-top: 4px;
}
</style>
