<template>
  <Teleport to="body">
    <div class="menu-backdrop" @click.self="$emit('close')"></div>
    <div class="member-action-menu">
      <div class="menu-header">
        <div class="menu-avatar" :style="{ background: member.color }">{{ member.name[0] }}</div>
        <span class="menu-name">{{ member.name }}</span>
      </div>
      <div class="menu-actions">
        <button v-if="member.groupRole === 'member'" class="menu-item" @click="$emit('setAdmin', member.id)">设为管理员</button>
        <button v-if="member.groupRole === 'admin'" class="menu-item" @click="$emit('setAdmin', member.id)">取消管理员</button>
        <button class="menu-item" @click="$emit('mute', member.id)">🔇 禁言</button>
        <button class="menu-item danger" @click="$emit('kick', member.id)">移出群聊</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { GroupMember } from '../types'

defineProps<{ member: GroupMember }>()
defineEmits<{ close: []; setAdmin: [memberId: string]; mute: [memberId: string]; kick: [memberId: string] }>()
</script>

<style scoped>
.menu-backdrop { position: fixed; inset: 0; z-index: 9998; }
.member-action-menu { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--color-surface-elevated); border: 1px solid var(--color-border); border-radius: 12px; padding: 4px; min-width: 200px; z-index: 9999; box-shadow: 0 8px 24px rgba(0,0,0,0.2); }
.menu-header { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--color-border); margin-bottom: 4px; }
.menu-avatar { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: 700; font-size: 11px; }
.menu-name { font-weight: 600; font-size: 13px; }
.menu-actions { display: flex; flex-direction: column; }
.menu-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border: none; background: transparent; border-radius: 6px; cursor: pointer; font-size: 12px; text-align: left; width: 100%; color: var(--color-text); }
.menu-item:hover { background: var(--color-surface); }
.menu-item.danger { color: #ef4444; }
.menu-item.danger:hover { background: rgba(239,68,68,0.08); }
</style>
