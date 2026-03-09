import type { WorkspaceDirectoryEntry } from '@locus-agent/agent-sdk'
import { useToast } from '@locus-agent/ui'
import { ref } from 'vue'
import * as workspaceApi from '@/api/workspace'
import { runWithLoadingState } from '@/utils/loadingState'

export interface UseWorkspacePickerOptions {
  /** Initial path shown in the directory browser */
  initialPath?: string
}

export function useWorkspacePicker(options: UseWorkspacePickerOptions = {}) {
  const toast = useToast()

  const isWorkspacePickerOpen = ref(false)
  const isWorkspacePickerLoading = ref(false)
  const isWorkspacePathLoading = ref(false)
  const currentBrowsePath = ref(options.initialPath ?? '')
  const browseEntries = ref<WorkspaceDirectoryEntry[]>([])
  const isBrowseTruncated = ref(false)
  let browseRequestToken = 0

  async function loadBrowseEntries(path: string) {
    if (!path)
      return

    const token = ++browseRequestToken
    try {
      await runWithLoadingState(isWorkspacePathLoading, async () => {
        const result = await workspaceApi.fetchWorkspaceDirectories(path)
        if (token !== browseRequestToken)
          return
        currentBrowsePath.value = result.path
        browseEntries.value = result.entries
        isBrowseTruncated.value = result.truncated
      })
    }
    catch (error) {
      toast.error(error instanceof Error ? error.message : '加载目录失败')
    }
  }

  async function openWorkspacePicker() {
    isWorkspacePickerOpen.value = true
    try {
      await runWithLoadingState(isWorkspacePickerLoading, async () => {
        const result = await workspaceApi.fetchWorkspaceRoots()
        const nextPath = currentBrowsePath.value || result.defaultPath || result.roots[0]?.path || ''
        if (nextPath) {
          await loadBrowseEntries(nextPath)
        }
      })
    }
    catch (error) {
      toast.error(error instanceof Error ? error.message : '加载工作空间根目录失败')
    }
  }

  function goToParentBrowsePath() {
    if (!currentBrowsePath.value)
      return

    const normalized = currentBrowsePath.value.endsWith('/')
      ? currentBrowsePath.value.slice(0, -1)
      : currentBrowsePath.value
    const index = normalized.lastIndexOf('/')

    if (index <= 0)
      return

    loadBrowseEntries(normalized.slice(0, index) || '/')
  }

  function closeWorkspacePicker() {
    isWorkspacePickerOpen.value = false
  }

  return {
    isWorkspacePickerOpen,
    isWorkspacePickerLoading,
    isWorkspacePathLoading,
    currentBrowsePath,
    browseEntries,
    isBrowseTruncated,
    loadBrowseEntries,
    openWorkspacePicker,
    goToParentBrowsePath,
    closeWorkspacePicker,
  }
}
