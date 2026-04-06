import type { ReviewAnnotation, ReviewAnnotationGroup } from './useReviewAnnotations'
import { computed, ref } from 'vue'

export function useAnnotationGroups(getGroups: () => ReviewAnnotationGroup[]) {
  const editingGroupId = ref<string | null>(null)
  const editingTitle = ref('')

  const hasAnnotations = computed(() =>
    getGroups().some(g => g.annotations.length > 0),
  )

  function startEditing(group: ReviewAnnotationGroup) {
    editingGroupId.value = group.id
    editingTitle.value = group.title
  }

  function finishEditing(
    groupId: string,
    onRename: (groupId: string, title: string) => void,
  ) {
    const title = editingTitle.value.trim()
    if (title) {
      onRename(groupId, title)
    }
    editingGroupId.value = null
  }

  function cancelEditing() {
    editingGroupId.value = null
  }

  function groupAnnotationsByFile(annotations: ReviewAnnotation[]) {
    const map = new Map<string, ReviewAnnotation[]>()
    for (const ann of annotations) {
      const list = map.get(ann.filePath) ?? []
      list.push(ann)
      map.set(ann.filePath, list)
    }
    return map
  }

  function formatRange(ann: ReviewAnnotation): string {
    const side = ann.side === 'additions' ? '+' : '-'
    if (ann.lineStart === ann.lineEnd)
      return `L${ann.lineStart}${side}`
    return `L${ann.lineStart}-${ann.lineEnd}${side}`
  }

  function basename(filePath: string): string {
    return filePath.split('/').pop() ?? filePath
  }

  return {
    editingGroupId,
    editingTitle,
    hasAnnotations,
    startEditing,
    finishEditing,
    cancelEditing,
    groupAnnotationsByFile,
    formatRange,
    basename,
  }
}
