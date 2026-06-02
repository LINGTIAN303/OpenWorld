<template>
  <div class="ws-workflow-empty">
    <!-- 错误态 -->
    <WsEmpty
      v-if="props.error"
      preset="no-connection"
      :title="`加载失败:${props.error}`"
      description="请检查网络或后端服务,然后点击重试"
    >
      <template #action>
        <WsButton
          type="primary"
          data-testid="empty-retry"
          @click="emit('retry')"
        >
          重试
        </WsButton>
      </template>
    </WsEmpty>

    <!-- 搜索空结果 -->
    <WsEmpty
      v-else-if="props.noResults"
      preset="workflow-search-empty"
      :description="searchDescription"
    />

    <!-- 默认:无工作流 + 双 CTA -->
    <WsEmpty
      v-else
      preset="no-workflow"
    >
      <template #action>
        <div class="ws-workflow-empty__ctas">
          <WsButton
            type="primary-gradient"
            data-testid="empty-agent"
            @click="emit('create-with-agent')"
          >
            <template #icon><span aria-hidden="true">✨</span></template>
            让 Agent 创建一个
          </WsButton>
          <WsButton
            type="secondary"
            data-testid="empty-manual"
            @click="emit('create-manual')"
          >
            从空白开始
          </WsButton>
        </div>
      </template>
    </WsEmpty>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import WsEmpty from '@/ui/WsEmpty.vue'
import WsButton from '@/ui/WsButton.vue'

const props = withDefaults(
  defineProps<{
    noResults?: boolean
    error?: string
    keyword?: string
  }>(),
  {
    noResults: false,
    error: '',
    keyword: '',
  },
)

const emit = defineEmits<{
  'create-with-agent': []
  'create-manual': []
  retry: []
}>()

const searchDescription = computed(() => {
  const k = props.keyword.trim()
  return k.length > 0
    ? `没有匹配 "${k}" 的工作流,尝试其他关键词或清空筛选条件`
    : '没有匹配的工作流,尝试其他关键词或清空筛选条件'
})
</script>

<style scoped>
.ws-workflow-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;
}
.ws-workflow-empty__ctas {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
  justify-content: center;
}
</style>
