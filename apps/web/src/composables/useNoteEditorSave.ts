import type { NoteEditorChange, NoteWithTags } from '@locus-agent/agent-sdk'
import { useDebounceFn } from '@vueuse/core'
import { computed, ref } from 'vue'

interface EditSaveTask {
  changeId: number
  noteId: string
  data: NoteEditorChange
}

export interface UseNoteEditorSaveOptions {
  /** Get current editing note ID */
  getNoteId: () => string | null
  /** Save note and return updated note or null */
  save: (noteId: string, data: NoteEditorChange) => Promise<NoteWithTags | null>
  /** Called after successful save (e.g. invalidate queries) */
  onSaved?: (noteId: string, updated: NoteWithTags) => void
  /** Debounce delay in ms */
  debounceMs?: number
}

/**
 * Manages debounced note editor save with sequential queue.
 * Ensures only the latest change is persisted when user types rapidly.
 */
export function useNoteEditorSave(options: UseNoteEditorSaveOptions) {
  const {
    getNoteId,
    save,
    onSaved,
    debounceMs = 1000,
  } = options

  const editingData = ref<NoteEditorChange | null>(null)
  const lastSavedAt = ref<Date | null>(null)

  let latestEditChangeId = 0
  let isEditSaveQueueRunning = false
  let pendingEditSaveTask: EditSaveTask | null = null

  async function runEditSaveQueue() {
    if (isEditSaveQueueRunning)
      return

    isEditSaveQueueRunning = true
    try {
      while (pendingEditSaveTask) {
        const task = pendingEditSaveTask
        pendingEditSaveTask = null

        if (task.changeId !== latestEditChangeId || task.noteId !== getNoteId())
          continue

        const updated = await save(task.noteId, task.data)

        if (!updated || task.changeId !== latestEditChangeId)
          continue

        lastSavedAt.value = new Date()
        onSaved?.(task.noteId, updated)
      }
    }
    finally {
      isEditSaveQueueRunning = false
      if (pendingEditSaveTask)
        void runEditSaveQueue()
    }
  }

  function enqueueEditSave(task: EditSaveTask) {
    pendingEditSaveTask = task
    void runEditSaveQueue()
  }

  const debouncedEnqueue = useDebounceFn((task: EditSaveTask) => {
    enqueueEditSave(task)
  }, debounceMs)

  function handleChange(data: NoteEditorChange) {
    editingData.value = data
    const noteId = getNoteId()
    if (!noteId)
      return

    const task: EditSaveTask = {
      changeId: ++latestEditChangeId,
      noteId,
      data,
    }
    debouncedEnqueue(task)
  }

  function reset() {
    editingData.value = null
    lastSavedAt.value = null
  }

  const lastSavedText = computed(() => {
    if (!lastSavedAt.value)
      return ''
    const d = lastSavedAt.value
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    const ss = String(d.getSeconds()).padStart(2, '0')
    return `${hh}:${mm}:${ss} 已保存`
  })

  return {
    editingData,
    lastSavedAt,
    lastSavedText,
    handleChange,
    reset,
  }
}
