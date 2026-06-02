<template>
  <div class="code-cell">
    <div class="cc-header">
      <select v-model="lang" class="cc-lang" @change="$emit('update', localCode)">
        <option value="javascript">JavaScript</option>
        <option value="typescript">TypeScript</option>
        <option value="python">Python</option>
        <option value="json">JSON</option>
      </select>
      <button class="cc-run-btn" @click="runCode"><WsIcon name="arrow-up" size="xs" /> 运行</button>
    </div>
    <textarea
      v-model="localCode"
      class="cc-editor"
      spellcheck="false"
      aria-label="代码编辑器"
      @input="$emit('update', localCode)"
    />
    <div v-if="output" class="cc-output">
      <div class="cc-output-label">输出：</div>
      <pre class="cc-output-content">{{ output }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import WsIcon from '../../../../ui/WsIcon.vue'

const props = defineProps<{ code: string; language: string }>()
const emit = defineEmits<{ update: [code: string]; run: [] }>()

const localCode = ref(props.code)
const lang = ref(props.language || 'javascript')
const output = ref('')

watch(() => props.code, (c) => { localCode.value = c })
watch(() => props.language, (l) => { lang.value = l || 'javascript' })

function runCode(): void {
  try {
    const logs: string[] = []
    const fn = new Function('console', `
      const console = { log: (...a) => logs.push(a.map(String).join(' ')), error: (...a) => logs.push('ERROR: ' + a.map(String).join(' ')) };
      ${localCode.value}
    `)
    fn(logs)
    output.value = logs.join('\n') || '(无输出)'
  } catch (err: any) {
    output.value = 'ERROR: ' + (err?.message || String(err))
  }
  emit('run')
}
</script>

<style scoped>
.code-cell { display: flex; flex-direction: column; height: 100%; }
.cc-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.cc-lang { padding: 3px 8px; border-radius: 4px; border: 1px solid var(--color-border); background: var(--color-bg-base); color: var(--color-text-secondary); font-size: var(--font-size-xs); outline: none; }
.cc-lang option { background: var(--color-bg-surface); color: var(--color-text-primary); }
.cc-run-btn { padding: 3px 10px; border-radius: 4px; border: 1px solid var(--color-primary); background: transparent; color: var(--color-primary); font-size: var(--font-size-xs); cursor: pointer; }
.cc-run-btn:hover { background: color-mix(in srgb, var(--color-primary) 10%, transparent); }
.cc-editor { flex: 1; font-family: 'Fira Code', 'Consolas', monospace; font-size: var(--font-size-sm); line-height: 1.5; background: var(--color-bg-base); border: 1px solid var(--color-border-subtle); border-radius: 6px; padding: 12px; color: var(--color-text-primary); resize: none; outline: none; }
.cc-output { margin-top: 8px; background: var(--color-bg-base); border: 1px solid var(--color-border-subtle); border-radius: 4px; padding: 8px; }
.cc-output-label { font-size: var(--font-size-xs); color: var(--color-text-tertiary); text-transform: uppercase; margin-bottom: 4px; }
.cc-output-content { font-family: 'Fira Code', 'Consolas', monospace; font-size: var(--font-size-sm); color: var(--color-text-secondary); white-space: pre-wrap; margin: 0; }
</style>
