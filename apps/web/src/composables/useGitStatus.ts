import type { GitStatusResponse } from '@locus-agent/agent-sdk'
import type { Ref } from 'vue'
import { useQuery, useQueryCache } from '@pinia/colada'
import { computed, onScopeDispose, ref, watch } from 'vue'
import * as workspaceApi from '@/api/workspace'

const SESSION_PREFIX = 'locus-agent:git-status:'

function getSessionCache(path: string): GitStatusResponse | null {
  try {
    const raw = sessionStorage.getItem(SESSION_PREFIX + path)
    return raw ? JSON.parse(raw) : null
  }
  catch {
    return null
  }
}

function setSessionCache(path: string, data: GitStatusResponse) {
  try {
    sessionStorage.setItem(SESSION_PREFIX + path, JSON.stringify(data))
  }
  catch { /* quota exceeded */ }
}

export function getGitStatusQueryKey(path: string) {
  return ['git-status', path] as const
}

export function useGitStatus(workspacePath: Ref<string>, isActive: Ref<boolean> = ref(true)) {
  const queryCache = useQueryCache()
  const selectedFilePath = ref<string | null>(null)
  const selectedFileStaged = ref<boolean | undefined>(undefined)
  const isRefreshing = ref(false)

  // Pre-populate Pinia Colada cache from sessionStorage before useQuery reads it
  const initialPath = workspacePath.value
  if (initialPath) {
    const cached = getSessionCache(initialPath)
    if (cached) {
      queryCache.setQueryData(getGitStatusQueryKey(initialPath), cached)
    }
  }

  // Also handle path changes after initial mount
  watch(workspacePath, (path) => {
    if (path) {
      const cached = getSessionCache(path)
      if (cached) {
        queryCache.setQueryData(getGitStatusQueryKey(path), cached)
      }
    }
    else {
      selectedFilePath.value = null
      selectedFileStaged.value = undefined
    }
  })

  // --- File system watcher via SSE ---
  let eventSource: EventSource | null = null

  function connectWatcher(path: string) {
    disconnectWatcher()
    const url = `/api/workspace/git/watch?path=${encodeURIComponent(path)}`
    eventSource = new EventSource(url)
    eventSource.onmessage = (e) => {
      if (e.data === 'changed')
        invalidateAll()
    }
  }

  function disconnectWatcher() {
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
  }

  watch([workspacePath, isActive], ([path, active]) => {
    if (path && active)
      connectWatcher(path)
    else
      disconnectWatcher()
  }, { immediate: true })

  onScopeDispose(disconnectWatcher)

  // --- Git Status Query ---
  const { data: statusData, isPending: isLoading } = useQuery({
    key: () => getGitStatusQueryKey(workspacePath.value),
    query: async () => {
      const path = workspacePath.value
      const result = await workspaceApi.fetchGitStatus(path)
      setSessionCache(path, result)
      return result
    },
    staleTime: 60_000, // Watcher handles most updates; this is a safety net
    enabled: () => !!workspacePath.value,
  })

  const files = computed(() => statusData.value?.files ?? [])
  const summary = computed(() => statusData.value?.summary ?? {
    totalFiles: 0,
    totalAdditions: 0,
    totalDeletions: 0,
  })
  const isGitRepo = computed(() => statusData.value?.isGitRepo ?? true)
  const unpushedCommits = computed(() => statusData.value?.unpushedCommits ?? 0)

  // Clear isRefreshing when new data arrives
  watch(statusData, () => {
    isRefreshing.value = false
  })

  // --- Git Diff Query ---
  const { data: diffData, isPending: isDiffLoading } = useQuery({
    key: () => ['git-diff', workspacePath.value, selectedFilePath.value!, selectedFileStaged.value ?? 'all'] as const,
    query: () => workspaceApi.fetchGitDiff(workspacePath.value, selectedFilePath.value!, selectedFileStaged.value),
    staleTime: 10_000,
    enabled: () => !!workspacePath.value && !!selectedFilePath.value,
  })

  const selectedFileDiff = computed(() => diffData.value?.patch ?? '')

  // Deselect file if it disappears from the list after refresh
  watch(files, (newFiles) => {
    if (selectedFilePath.value && !newFiles.some(f => f.filePath === selectedFilePath.value)) {
      selectedFilePath.value = null
      selectedFileStaged.value = undefined
    }
  })

  function selectFile(filePath: string, staged?: boolean) {
    selectedFilePath.value = filePath
    selectedFileStaged.value = staged
  }

  function refresh() {
    if (!workspacePath.value)
      return
    if (isRefreshing.value)
      return
    isRefreshing.value = true
    queryCache.invalidateQueries({ key: getGitStatusQueryKey(workspacePath.value) })
    if (selectedFilePath.value) {
      queryCache.invalidateQueries({ key: ['git-diff', workspacePath.value, selectedFilePath.value] })
    }
  }

  function invalidateAll() {
    queryCache.invalidateQueries({ key: ['git-status'] })
    queryCache.invalidateQueries({ key: ['git-diff'] })
  }

  async function stage(filePaths: string[]) {
    const path = workspacePath.value
    if (!path || filePaths.length === 0)
      return
    await workspaceApi.stageFiles(path, filePaths)
    invalidateAll()
  }

  async function unstage(filePaths: string[]) {
    const path = workspacePath.value
    if (!path || filePaths.length === 0)
      return
    await workspaceApi.unstageFiles(path, filePaths)
    invalidateAll()
  }

  async function commit(message: string, filePaths: string[] = []) {
    const path = workspacePath.value
    if (!path)
      return

    const result = await workspaceApi.commitChanges(path, message, filePaths)
    if (result.success) {
      selectedFilePath.value = null
      selectedFileStaged.value = undefined
      invalidateAll()
    }
    return result
  }

  async function discard(filePaths: string[] = []) {
    const path = workspacePath.value
    if (!path)
      return

    const result = await workspaceApi.discardChanges(path, filePaths)
    if (result.success) {
      selectedFilePath.value = null
      selectedFileStaged.value = undefined
      invalidateAll()
    }
    return result
  }

  async function push() {
    const path = workspacePath.value
    if (!path)
      return
    const result = await workspaceApi.pushChanges(path)
    if (result.success) {
      invalidateAll()
    }
    return result
  }

  return {
    files,
    summary,
    isLoading,
    isRefreshing,
    isGitRepo,
    unpushedCommits,
    selectedFilePath,
    selectedFileStaged,
    selectedFileDiff,
    isDiffLoading,
    refresh,
    selectFile,
    stage,
    unstage,
    commit,
    discard,
    push,
  }
}
