import type { GitChangedFile, GitStatusResponse } from '@locus-agent/shared'
import type { Ref } from 'vue'
import { ref, watch } from 'vue'
import * as workspaceApi from '@/api/workspace'

export function useGitStatus(workspacePath: Ref<string>) {
  const files = ref<GitChangedFile[]>([])
  const summary = ref<GitStatusResponse['summary']>({
    totalFiles: 0,
    totalAdditions: 0,
    totalDeletions: 0,
  })
  const isLoading = ref(false)
  const isGitRepo = ref(true)
  const selectedFilePath = ref<string | null>(null)
  const selectedFileDiff = ref('')
  const isDiffLoading = ref(false)

  let requestToken = 0

  async function refresh() {
    const path = workspacePath.value
    if (!path) {
      return
    }

    const token = ++requestToken
    isLoading.value = true

    try {
      const result = await workspaceApi.fetchGitStatus(path)

      if (token !== requestToken) {
        return
      }

      isGitRepo.value = result.isGitRepo
      files.value = result.files
      summary.value = result.summary

      // If the currently selected file is no longer in the list, deselect it
      if (selectedFilePath.value && !result.files.some(f => f.filePath === selectedFilePath.value)) {
        selectedFilePath.value = null
        selectedFileDiff.value = ''
      }
    }
    catch {
      if (token !== requestToken) {
        return
      }
      files.value = []
      summary.value = { totalFiles: 0, totalAdditions: 0, totalDeletions: 0 }
    }
    finally {
      if (token === requestToken) {
        isLoading.value = false
      }
    }
  }

  async function selectFile(filePath: string) {
    selectedFilePath.value = filePath
    selectedFileDiff.value = ''

    const path = workspacePath.value
    if (!path) {
      return
    }

    isDiffLoading.value = true
    try {
      const result = await workspaceApi.fetchGitDiff(path, filePath)
      // Only apply if still the selected file
      if (selectedFilePath.value === filePath) {
        selectedFileDiff.value = result.patch
      }
    }
    catch {
      if (selectedFilePath.value === filePath) {
        selectedFileDiff.value = ''
      }
    }
    finally {
      isDiffLoading.value = false
    }
  }

  async function commit(message: string) {
    const path = workspacePath.value
    if (!path) {
      return
    }

    const result = await workspaceApi.commitChanges(path, message)
    if (result.success) {
      selectedFilePath.value = null
      selectedFileDiff.value = ''
      await refresh()
    }
    return result
  }

  async function discard(filePaths: string[] = []) {
    const path = workspacePath.value
    if (!path) {
      return
    }

    const result = await workspaceApi.discardChanges(path, filePaths)
    if (result.success) {
      selectedFilePath.value = null
      selectedFileDiff.value = ''
      await refresh()
    }
    return result
  }

  watch(workspacePath, (path) => {
    if (path) {
      refresh()
    }
    else {
      files.value = []
      summary.value = { totalFiles: 0, totalAdditions: 0, totalDeletions: 0 }
      selectedFilePath.value = null
      selectedFileDiff.value = ''
    }
  })

  return {
    files,
    summary,
    isLoading,
    isGitRepo,
    selectedFilePath,
    selectedFileDiff,
    isDiffLoading,
    refresh,
    selectFile,
    commit,
    discard,
  }
}
