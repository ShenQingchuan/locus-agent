import type { DiffLineAnnotation } from '@pierre/diffs'
import type { Ref } from 'vue'
import { computed, reactive, ref, watch } from 'vue'
import * as api from '@/api/reviewAnnotations'

export interface ReviewAnnotation {
  id: string
  filePath: string
  side: 'additions' | 'deletions'
  lineStart: number
  lineEnd: number
  comment: string
  createdAt: number
}

export interface ReviewAnnotationGroup {
  id: string
  title: string
  annotations: ReviewAnnotation[]
}

export interface AnnotationMetadata {
  annotationId: string
  groupId: string
  comment: string
  lineStart: number
  lineEnd: number
}

function dtoToAnnotation(dto: api.ReviewAnnotationDTO): ReviewAnnotation {
  return {
    id: dto.id,
    filePath: dto.filePath,
    side: dto.side,
    lineStart: dto.lineStart,
    lineEnd: dto.lineEnd,
    comment: dto.comment,
    createdAt: new Date(dto.createdAt).getTime(),
  }
}

function dtoToGroup(dto: api.ReviewAnnotationGroupDTO): ReviewAnnotationGroup {
  return {
    id: dto.id,
    title: dto.title,
    annotations: dto.annotations.map(dtoToAnnotation),
  }
}

const groups = reactive<Map<string, ReviewAnnotationGroup>>(new Map())
const activeGroupId = ref<string | null>(null)
const boundProjectKey = ref<string | null>(null)
const serverSyncedGroups = new Set<string>()
const pendingGroupCreations = new Map<string, Promise<boolean>>()
let loadGeneration = 0

async function loadFromServer(projectKey: string) {
  const gen = ++loadGeneration
  try {
    const dtos = await api.fetchAnnotationGroups(projectKey)
    if (gen !== loadGeneration)
      return

    const prevActiveId = activeGroupId.value
    groups.clear()
    serverSyncedGroups.clear()
    for (const dto of dtos) {
      groups.set(dto.id, dtoToGroup(dto))
      serverSyncedGroups.add(dto.id)
    }
    activeGroupId.value = (prevActiveId && groups.has(prevActiveId))
      ? prevActiveId
      : (dtos[0]?.id ?? null)
  }
  catch {
    // Silently fail — the user can still add annotations optimistically
  }
}

export function useReviewAnnotations(projectKey?: Ref<string | null>) {
  if (projectKey) {
    watch(projectKey, (key) => {
      if (key && key !== boundProjectKey.value) {
        boundProjectKey.value = key
        loadFromServer(key)
      }
      else if (!key) {
        boundProjectKey.value = null
        groups.clear()
        serverSyncedGroups.clear()
        activeGroupId.value = null
      }
    }, { immediate: true })
  }

  const allGroups = computed(() => Array.from(groups.values()))

  const activeGroup = computed(() => {
    if (!activeGroupId.value)
      return null
    return groups.get(activeGroupId.value) ?? null
  })

  const totalAnnotationCount = computed(() =>
    allGroups.value.reduce((sum, g) => sum + g.annotations.length, 0),
  )

  function createGroup(title: string): string {
    const id = crypto.randomUUID()
    groups.set(id, { id, title, annotations: [] })
    activeGroupId.value = id

    if (boundProjectKey.value) {
      const promise = api.createAnnotationGroup({ id, projectKey: boundProjectKey.value, title })
        .then(() => {
          serverSyncedGroups.add(id)
          return true
        })
        .catch(() => false)
        .finally(() => pendingGroupCreations.delete(id))
      pendingGroupCreations.set(id, promise)
    }

    return id
  }

  function deleteGroup(groupId: string) {
    groups.delete(groupId)
    serverSyncedGroups.delete(groupId)
    if (activeGroupId.value === groupId) {
      activeGroupId.value = allGroups.value[0]?.id ?? null
    }

    api.deleteAnnotationGroup(groupId).catch(() => {})
  }

  function renameGroup(groupId: string, title: string) {
    const group = groups.get(groupId)
    if (group)
      group.title = title

    if (serverSyncedGroups.has(groupId))
      api.renameAnnotationGroup(groupId, title).catch(() => {})
  }

  function setActiveGroup(groupId: string | null) {
    activeGroupId.value = groupId
  }

  function addAnnotation(
    groupId: string,
    filePath: string,
    side: 'additions' | 'deletions',
    lineStart: number,
    lineEnd: number,
    comment: string,
  ): string {
    const group = groups.get(groupId)
    if (!group)
      throw new Error(`Group ${groupId} not found`)

    const id = crypto.randomUUID()
    group.annotations.push({
      id,
      filePath,
      side,
      lineStart,
      lineEnd,
      comment,
      createdAt: Date.now(),
    })

    const persist = () => api.addAnnotation({ id, groupId, filePath, side, lineStart, lineEnd, comment }).catch(() => {})
    const pending = pendingGroupCreations.get(groupId)
    if (pending) {
      pending.then((ok) => {
        if (ok)
          persist()
      })
    }
    else if (serverSyncedGroups.has(groupId)) {
      persist()
    }

    return id
  }

  function updateAnnotation(groupId: string, annotationId: string, comment: string) {
    const group = groups.get(groupId)
    if (!group)
      return
    const annotation = group.annotations.find(a => a.id === annotationId)
    if (annotation)
      annotation.comment = comment

    if (serverSyncedGroups.has(groupId))
      api.updateAnnotation(annotationId, comment).catch(() => {})
  }

  function removeAnnotation(groupId: string, annotationId: string) {
    const group = groups.get(groupId)
    if (!group)
      return
    const idx = group.annotations.findIndex(a => a.id === annotationId)
    if (idx !== -1)
      group.annotations.splice(idx, 1)

    if (serverSyncedGroups.has(groupId))
      api.removeAnnotation(annotationId).catch(() => {})
  }

  function getAnnotationsForFile(filePath: string): DiffLineAnnotation<AnnotationMetadata>[] {
    const result: DiffLineAnnotation<AnnotationMetadata>[] = []
    for (const group of groups.values()) {
      for (const ann of group.annotations) {
        if (ann.filePath !== filePath)
          continue
        result.push({
          side: ann.side,
          lineNumber: Math.max(ann.lineStart - 1, 1),
          metadata: {
            annotationId: ann.id,
            groupId: group.id,
            comment: ann.comment,
            lineStart: ann.lineStart,
            lineEnd: ann.lineEnd,
          },
        })
      }
    }
    return result
  }

  function getAnnotationCountForFile(filePath: string): number {
    let count = 0
    for (const group of groups.values()) {
      count += group.annotations.filter(a => a.filePath === filePath).length
    }
    return count
  }

  function formatGroupForAI(groupId: string): string {
    const group = groups.get(groupId)
    if (!group || group.annotations.length === 0)
      return ''

    const byFile = new Map<string, ReviewAnnotation[]>()
    for (const ann of group.annotations) {
      const list = byFile.get(ann.filePath) ?? []
      list.push(ann)
      byFile.set(ann.filePath, list)
    }

    const lines: string[] = [
      `请根据以下代码审阅意见，对工作区中的文件进行修改：`,
      '',
      `## 审阅意见组：${group.title}`,
      '',
    ]

    for (const [filePath, annotations] of byFile) {
      lines.push(`### 文件: ${filePath}`)
      for (const ann of annotations) {
        const sideLabel = ann.side === 'additions' ? '新增侧' : '删除侧'
        const rangeLabel = ann.lineStart === ann.lineEnd
          ? `第 ${ann.lineStart} 行`
          : `第 ${ann.lineStart}-${ann.lineEnd} 行`
        lines.push(`- ${rangeLabel} (${sideLabel}):`)
        lines.push(`  意见: "${ann.comment}"`)
        lines.push('')
      }
    }

    lines.push('请逐一修改以上提到的问题。')
    return lines.join('\n')
  }

  function clearAll() {
    groups.clear()
    activeGroupId.value = null
    serverSyncedGroups.clear()

    if (boundProjectKey.value) {
      api.clearAllAnnotations(boundProjectKey.value).catch(() => {})
    }
  }

  return {
    groups: allGroups,
    activeGroupId,
    activeGroup,
    totalAnnotationCount,
    createGroup,
    deleteGroup,
    renameGroup,
    setActiveGroup,
    addAnnotation,
    updateAnnotation,
    removeAnnotation,
    getAnnotationsForFile,
    getAnnotationCountForFile,
    formatGroupForAI,
    clearAll,
  }
}
