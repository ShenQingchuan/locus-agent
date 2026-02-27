<script setup lang="ts">
import type { NoteWithTags } from '@locus-agent/shared'
import { formatNotePreview, formatRelativeDateShort } from '@locus-agent/shared'

defineProps<{
  note: NoteWithTags
  isHighlighted?: boolean
}>()

const emit = defineEmits<{
  click: [note: NoteWithTags]
  openTags: [noteId: string]
  delete: [noteId: string]
}>()

function handleClick(note: NoteWithTags) {
  emit('click', note)
}

function handleOpenTags(e: Event, noteId: string) {
  e.stopPropagation()
  emit('openTags', noteId)
}

function handleDelete(e: Event, noteId: string) {
  e.stopPropagation()
  emit('delete', noteId)
}
</script>

<template>
  <div
    class="group rounded-lg border transition-all cursor-pointer"
    :class="isHighlighted
      ? 'border-primary/20 bg-primary/5 shadow-sm ring-0.5 ring-primary/10'
      : 'border-border/60 bg-card hover:border-border hover:shadow-sm'"
    @click="handleClick(note)"
  >
    <div class="px-3 pt-3 pb-2">
      <div class="text-[13px] text-foreground leading-relaxed whitespace-pre-wrap break-words line-clamp-8">
        {{ formatNotePreview(note) }}
      </div>
    </div>
    <div class="px-3 pb-2.5 flex items-center justify-between gap-1">
      <div class="flex items-center gap-1.5 min-w-0 overflow-hidden">
        <span class="text-[11px] text-muted-foreground/50 flex-shrink-0">
          {{ formatRelativeDateShort(note.updatedAt) }}
        </span>
        <span
          v-for="tag in note.tags.slice(0, 2)"
          :key="tag.id"
          class="text-[11px] px-1 py-px rounded bg-secondary/50 text-secondary-foreground/70 truncate"
        >
          #{{ tag.name }}
        </span>
        <span v-if="note.tags.length > 2" class="text-[11px] text-muted-foreground/40">
          +{{ note.tags.length - 2 }}
        </span>
      </div>
      <div class="flex items-center gap-0 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          class="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="标签"
          @click="handleOpenTags($event, note.id)"
        >
          <div class="i-carbon-tag h-3 w-3" />
        </button>
        <button
          class="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-accent transition-colors"
          title="删除"
          @click="handleDelete($event, note.id)"
        >
          <div class="i-carbon-trash-can h-3 w-3" />
        </button>
      </div>
    </div>
  </div>
</template>
