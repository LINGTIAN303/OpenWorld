<template>
  <div class="member-list">
    <div class="list-header">
      <span class="section-label">成员 ({{ store.groupMembers.length }})</span>
      <button class="invite-btn" @click="$emit('invite')">＋ 邀请</button>
    </div>
    <div class="members">
      <div v-for="member in store.groupMembers" :key="member.id" class="member-item" @click="onMemberClick(member)">
        <div class="member-avatar" :style="{ background: member.color }">
          <span class="avatar-letter">{{ member.name[0] }}</span>
        </div>
        <div class="member-info">
          <div class="member-name-row">
            <span class="member-name">{{ member.name }}</span>
            <span v-if="member.groupRole === 'owner'" class="role-tag owner-tag">群主</span>
            <span v-else-if="member.groupRole === 'admin'" class="role-tag admin-tag">管理员</span>
            <span v-if="member.muted" class="mute-tag">🔇</span>
          </div>
          <div class="member-role-text">{{ member.role }}</div>
        </div>
      </div>
    </div>

    <MemberActionMenu
      v-if="selectedMember"
      :member="selectedMember"
      @close="selectedMember = null"
      @set-admin="onSetAdmin"
      @mute="onMute"
      @kick="onKick"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useGroupChatStore } from '../GroupChatStore'
import { saveCasualGroupSession } from '../GroupSessionManager'
import type { GroupMember } from '../types'
import MemberActionMenu from './MemberActionMenu.vue'

defineEmits<{ invite: [] }>()

const store = useGroupChatStore()
const selectedMember = ref<GroupMember | null>(null)

function onMemberClick(member: GroupMember): void {
  selectedMember.value = member
}

async function onSetAdmin(memberId: string): Promise<void> {
  const member = store.groupMembers.find(m => m.id === memberId)
  if (!member) { selectedMember.value = null; return }
  const newRole = member.groupRole === 'admin' ? 'member' as const : 'admin' as const
  store.updateGroupMember(memberId, { groupRole: newRole })
  selectedMember.value = null
  await persistMembers()
}

async function onMute(memberId: string): Promise<void> {
  const member = store.groupMembers.find(m => m.id === memberId)
  if (!member) { selectedMember.value = null; return }
  store.updateGroupMember(memberId, { muted: !member.muted })
  selectedMember.value = null
  await persistMembers()
}

async function onKick(memberId: string): Promise<void> {
  store.setGroupMembers(store.groupMembers.filter(m => m.id !== memberId))
  selectedMember.value = null
  await persistMembers()
}

async function persistMembers(): Promise<void> {
  if (!store.groupInfo) return
  await saveCasualGroupSession({
    info: { ...store.groupInfo, updatedAt: Date.now() },
    members: [...store.groupMembers],
    messages: [...store.casualMessages],
    desireConfig: { ...store.desireConfig },
    costTracker: { ...store.costTracker },
  })
}
</script>

<style scoped>
.member-list {}
.list-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.section-label { font-size: 11px; color: var(--color-text-tertiary); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
.invite-btn { padding: 4px 10px; border: 1px solid var(--color-primary); border-radius: 6px; background: transparent; color: var(--color-primary); cursor: pointer; font-size: 11px; font-weight: 600; }
.invite-btn:hover { background: rgba(108,92,231,0.08); }

.members { display: flex; flex-direction: column; gap: 2px; }
.member-item { display: flex; align-items: center; gap: 10px; padding: 6px 4px; border-radius: 6px; cursor: pointer; }
.member-item:hover { background: var(--color-surface); }
.member-avatar { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.avatar-letter { color: white; font-weight: 700; font-size: 12px; }
.member-info { flex: 1; min-width: 0; }
.member-name-row { display: flex; align-items: center; gap: 4px; }
.member-name { font-size: 12px; font-weight: 600; }
.role-tag { font-size: 9px; padding: 1px 4px; border-radius: 3px; font-weight: 600; }
.owner-tag { background: rgba(245,158,11,0.15); color: #f59e0b; }
.admin-tag { background: rgba(59,130,246,0.15); color: #3b82f6; }
.mute-tag { font-size: 10px; }
.member-role-text { font-size: 10px; color: var(--color-text-tertiary); }
</style>
