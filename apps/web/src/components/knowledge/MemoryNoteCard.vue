<script setup lang="ts">
import type { NoteWithTags } from '@univedge/locus-agent-sdk'
import type { ContextMenuItem } from '@univedge/locus-ui'
import { formatNotePreview } from '@univedge/locus-agent-sdk'
import { ContextMenu } from '@univedge/locus-ui'
import { computed } from 'vue'

const props = defineProps<{
  note: NoteWithTags
  isHighlighted?: boolean
}>()

const emit = defineEmits<{
  click: [note: NoteWithTags]
  openTags: [noteId: string]
  delete: [noteId: string]
  toGlobal: [note: NoteWithTags]
}>()

const contextMenuItems = computed<ContextMenuItem[]>(() => {
  const items: ContextMenuItem[] = [
    { key: 'tags', label: '管理标签', icon: 'i-carbon-tag' },
  ]

  if (props.note.workspacePath) {
    items.push({
      key: 'to-global',
      label: '转为全局记忆',
      icon: 'i-carbon-earth',
    })
  }

  items.push(
    { key: 'delete', label: '删除', icon: 'i-carbon-trash-can', separator: true, danger: true },
  )
  return items
})

function handleContextMenuSelect(key: string) {
  switch (key) {
    case 'tags':
      emit('openTags', props.note.id)
      break
    case 'to-global':
      emit('toGlobal', props.note)
      break
    case 'delete':
      emit('delete', props.note.id)
      break
  }
}

function handleClick(note: NoteWithTags) {
  emit('click', note)
}

function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const HOUR = 60 * 60 * 1000

  if (diff < 60_000)
    return '刚刚'
  if (diff < 3600_000)
    return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < HOUR * 6)
    return `${Math.floor(diff / 3600_000)} 小时前`

  return formatTime(d)
}
</script>

<template>
  <ContextMenu :items="contextMenuItems" @select="handleContextMenuSelect">
    <div
      class="group rounded-lg border transition-all cursor-pointer"
      :class="isHighlighted
        ? 'border-primary/20 bg-primary/5 shadow-sm ring-0.5 ring-primary/10'
        : 'border-border/60 bg-card hover:border-border hover:shadow-sm'"
      @click="handleClick(note)"
    >
      <div v-if="note.tags.length > 0" class="px-3.5 pt-2.5 flex items-center gap-1.5 flex-wrap">
        <span
          v-for="tag in note.tags.slice(0, 3)"
          :key="tag.id"
          class="text-[11px] leading-none px-1.5 py-1 rounded-md bg-secondary/40 text-secondary-foreground/70 truncate font-mono"
        >
          #{{ tag.name }}
        </span>
        <span v-if="note.tags.length > 3" class="text-[10px] text-muted-foreground/60 font-mono">
          +{{ note.tags.length - 3 }}
        </span>
      </div>

      <div class="px-3.5 pt-2.5 pb-1.5">
        <div class="text-[13px] text-foreground leading-relaxed whitespace-pre-wrap break-words line-clamp-8">
          {{ formatNotePreview(note) }}
        </div>
      </div>

      <div class="px-3.5 pb-2.5 flex items-center gap-1.5">
        <span class="text-[11px] text-muted-foreground/80" :title="new Date(note.updatedAt).toLocaleString('zh-CN')">
          {{ formatRelativeTime(note.updatedAt) }}
        </span>
        <span
          class="text-[10px] leading-none px-1 py-0.5 rounded"
          :class="note.workspacePath
            ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
            : 'bg-muted text-muted-foreground/70'"
        >
          {{ note.workspacePath ? '工作空间' : '全局' }}
        </span>
      </div>
    </div>
  </ContextMenu>
</template>
