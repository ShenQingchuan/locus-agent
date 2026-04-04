import type { SkillDetail } from '@univedge/locus-agent-sdk'
import type { Ref } from 'vue'
import { watch } from 'vue'
import { fetchSkillDetail, watchSkillFiles } from '@/api/skills'

export interface UseSkillFileWatcherOptions {
  isEditMode: Ref<boolean>
  hasUnsavedChanges: Ref<boolean>
  getWorkspaceRoot: () => string | undefined
  loadSkills: () => Promise<void>
  selectedSkillId: Ref<string | null>
  selectedFilePath: Ref<string | null>
  selectedSkill: Ref<SkillDetail | null>
  loadFileTree: (id: string) => Promise<void>
  loadFileContent: (filePath: string) => Promise<void>
}

export function useSkillFileWatcher(options: UseSkillFileWatcherOptions) {
  let unwatchFiles: (() => void) | null = null
  let pendingSSERefresh = false

  async function handleSSERefresh() {
    pendingSSERefresh = false
    const prevId = options.selectedSkillId.value
    const prevFile = options.selectedFilePath.value

    await options.loadSkills()

    if (prevId && options.selectedSkillId.value === prevId) {
      try {
        const detailResult = await fetchSkillDetail(prevId, options.getWorkspaceRoot())
        options.selectedSkill.value = detailResult.skill
      }
      catch { /* ignore */ }

      await options.loadFileTree(prevId)

      if (prevFile && !options.isEditMode.value) {
        await options.loadFileContent(prevFile)
      }
    }
  }

  function setupFileWatcher() {
    unwatchFiles?.()
    unwatchFiles = null

    unwatchFiles = watchSkillFiles(options.getWorkspaceRoot(), async () => {
      if (options.isEditMode.value && options.hasUnsavedChanges.value) {
        pendingSSERefresh = true
        return
      }
      await handleSSERefresh()
    })
  }

  watch(options.isEditMode, async (editing) => {
    if (!editing && pendingSSERefresh) {
      await handleSSERefresh()
    }
  })

  function cleanup() {
    unwatchFiles?.()
  }

  return {
    setupFileWatcher,
    cleanup,
  }
}
