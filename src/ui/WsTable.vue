<template>
  <div class="ws-table-wrapper">
    <table :class="['ws-table', { 'ws-table--striped': striped, 'ws-table--bordered': bordered, 'ws-table--compact': compact }]" :aria-label="ariaLabel">
      <thead>
        <tr>
          <th v-for="col in columns" :key="col.key" :style="{ width: col.width, textAlign: col.align ?? 'left' }">
            <slot :name="`header-${col.key}`" :column="col">{{ col.title }}</slot>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="data.length === 0">
          <td :colspan="columns.length" class="ws-table__empty">
            <slot name="empty">暂无数据</slot>
          </td>
        </tr>
        <tr v-for="(row, idx) in data" :key="rowKey ? row[rowKey] : idx" :class="{ 'ws-table__row--clickable': $attrs.onClick }">
          <td v-for="col in columns" :key="col.key" :style="{ textAlign: col.align ?? 'left' }">
            <slot :name="col.key" :row="row" :index="idx">{{ row[col.key] }}</slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
export interface TableColumn {
  key: string
  title: string
  width?: string
  align?: 'left' | 'center' | 'right'
  sortable?: boolean
}

withDefaults(defineProps<{
  columns: TableColumn[]
  data: Record<string, any>[]
  rowKey?: string
  striped?: boolean
  bordered?: boolean
  compact?: boolean
  ariaLabel?: string
}>(), {
  striped: false,
  bordered: false,
  compact: false,
})
</script>

<style scoped>
.ws-table-wrapper { overflow-x: auto; border-radius: var(--radius-lg); border: 1px solid var(--color-border-subtle); }
.ws-table { width: 100%; border-collapse: collapse; font-size: var(--font-size-sm); }
.ws-table th, .ws-table td { padding: var(--space-3) var(--space-4); text-align: left; }
.ws-table--compact th, .ws-table--compact td { padding: var(--space-2) var(--space-3); }

.ws-table thead { background: var(--color-bg-elevated); }
.ws-table th { font-weight: var(--font-weight-semibold); color: var(--color-text-secondary); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.03em; border-bottom: 1px solid var(--color-border-subtle); white-space: nowrap; }

.ws-table tbody tr { border-bottom: 1px solid var(--color-border-subtle); transition: background var(--duration-fast) var(--ease-default); }
.ws-table tbody tr:last-child { border-bottom: none; }
.ws-table tbody tr:hover { background: var(--color-bg-hover); }
.ws-table--striped tbody tr:nth-child(even) { background: var(--color-bg-elevated); }
.ws-table--striped tbody tr:nth-child(even):hover { background: var(--color-bg-hover); }
.ws-table--bordered td { border-right: 1px solid var(--color-border-subtle); }
.ws-table--bordered td:last-child { border-right: none; }

.ws-table__row--clickable { cursor: pointer; }
.ws-table__empty { text-align: center; color: var(--color-text-tertiary); padding: var(--space-8) !important; }
</style>
