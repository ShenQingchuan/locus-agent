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
    <div v-if="note.tags.length > 0" class="px-3.5 pt-2.5 flex items-center gap-1.5 flex-wrap">
      <span
        v-for="tag in note.tags.slice(0, 3)"
        :key="tag.id"
        class="text-[11px] leading-none px-1.5 py-1 rounded-md bg-secondary/40 text-secondary-foreground/70 truncate max-w-32 font-mono"
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

    <div class="px-3.5 pb-2.5 flex items-center justify-between">
      <span class="text-[11px] text-muted-foreground/80">
        {{ formatRelativeDateShort(note.updatedAt) }}
      </span>
      <div class="flex items-center gap-0.5 flex-shrink-0">
        <button
          class="p-1 rounded text-muted-foreground/80 hover:text-foreground hover:bg-accent/60 transition-colors"
          title="标签"
          @click="handleOpenTags($event, note.id)"
        >
          <div class="i-carbon-tag h-3.5 w-3.5" />
        </button>
        <button
          class="p-1 rounded text-muted-foreground/80 hover:text-destructive hover:bg-accent/60 transition-colors"
          title="删除"
          @click="handleDelete($event, note.id)"
        >
          <div class="i-carbon-trash-can h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  </div>
</template>
