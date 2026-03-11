import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed } from 'vue'
import * as workspaceApi from '@/api/workspace'
import { getWorkspaceDisplayName } from '@/utils/workspace'

export const useWorkspaceStore = defineStore('workspace', () => {
  const currentWorkspacePath = useLocalStorage('locus-agent:coding-last-workspace-path', '')

  const currentWorkspaceName = computed(() => getWorkspaceDisplayName(currentWorkspacePath.value))

  const isWorkspaceActive = computed(() => !!currentWorkspacePath.value.trim())

  async function openWorkspace(path: string) {
    const result = await workspaceApi.openWorkspace(path)
    currentWorkspacePath.value = result.rootPath
    return result
  }

  function closeWorkspace() {
    currentWorkspacePath.value = ''
  }

  return {
    currentWorkspacePath,
    currentWorkspaceName,
    isWorkspaceActive,
    openWorkspace,
    closeWorkspace,
  }
})
