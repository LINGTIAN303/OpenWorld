<template>
  <button
    :class="['editor-mode-toggle', mode]"
    @click="toggle"
  >
    <span v-if="mode === 'simplified'"><WsIcon name="globe" size="xs" /> 简化</span>
    <span v-else><WsIcon name="settings" size="xs" /> 高级</span>
  </button>
</template>

<script setup>
import { computed } from 'vue'
import WsIcon from '../../../../ui/WsIcon.vue'

const props = defineProps({
  mode: {
    type: String,
    required: true,
    validator: (v) => ['simplified', 'advanced'].includes(v)
  }
})

const emit = defineEmits(['change'])

function toggle() {
  emit('change', props.mode === 'simplified' ? 'advanced' : 'simplified')
}
</script>

<style scoped>
.editor-mode-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: var(--font-size-base);
  cursor: pointer;
  transition: all 0.2s ease;
  background: transparent;
  line-height: 1.4;
}

.editor-mode-toggle.simplified {
  border: 1px solid var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
  color: var(--color-primary);
}

.editor-mode-toggle.simplified:hover {
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
}

.editor-mode-toggle.advanced {
  border: 1px solid var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 6%, transparent);
  color: var(--color-primary);
}

.editor-mode-toggle.advanced:hover {
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
}
</style>
