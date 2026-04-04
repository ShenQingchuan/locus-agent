import type { SkillDetail, SkillSummary } from '@univedge/locus-agent-sdk'
import type { FileTreeNode } from '@univedge/locus-ui'
import { useToast } from '@univedge/locus-ui'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { fetchSkillDetail, fetchSkillFileContent, fetchSkillFiles, fetchSkills, updateSkillPreference } from '@/api/skills'
import { useSkillCreator } from '@/composables/skills/useSkillCreator'
import { useSkillFileEditor } from '@/composables/skills/useSkillFileEditor'
import { useSkillFileWatcher } from '@/composables/skills/useSkillFileWatcher'
import { collectDirectoryIds, convertToFileTreeNodes, countFileNodes } from '@/utils/skills'

type SourceFilter = 'all' | 'system' | 'project'

export interface UseSkillsManagerOptions {
  /** Reactive getter for the selected workspace root (undefined = none) */
  selectedWorkspaceRoot: () => string | undefined
  /** Initial skill name from route query */
  initialQuerySkillName?: string | null
  /** Initial file path from route query */
  initialQueryFile?: string | null
}

export function useSkillsManager(options: UseSkillsManagerOptions) {
  const toast = useToast()
  const getWorkspaceRoot = options.selectedWorkspaceRoot

  // --- Skills list state ---
  const sourceFilter = ref<SourceFilter>('all')
  const skills = ref<SkillSummary[]>([])
  const selectedSkillId = ref<string | null>(null)
  const selectedSkill = ref<SkillDetail | null>(null)
  const isLoadingList = ref(false)
  const isLoadingDetail = ref(false)
  const isSaving = ref(false)
  const errorMessage = ref<string | null>(null)

  const filteredSkills = computed(() => {
    if (sourceFilter.value === 'all')
      return skills.value
    return skills.value.filter(skill => skill.source === sourceFilter.value)
  })

  const createSkillSource = computed(() => {
    if (sourceFilter.value === 'system')
      return 'system' as const
    if (sourceFilter.value === 'project' && getWorkspaceRoot())
      return 'project' as const
    if (getWorkspaceRoot())
      return 'project' as const
    return 'system' as const
  })

  // --- File tree state ---
  const fileTreeNodes = ref<FileTreeNode[]>([])
  const isLoadingFileTree = ref(false)
  const fileTreeDefaultExpanded = ref<string[]>([])
  const selectedFilePath = ref<string | null>(null)
  const pendingFileRestore = ref<string | null>(options.initialQueryFile ?? null)
  const fileTreeFileCount = computed(() => countFileNodes(fileTreeNodes.value))

  // --- File content state ---
  const fileContent = ref('')
  const fileLanguage = ref('markdown')
  const isLoadingFile = ref(false)

  const editor = useSkillFileEditor({
    selectedSkillId,
    selectedFilePath,
    selectedSkill,
    fileContent,
    getWorkspaceRoot,
    toast,
  })

  const creator = useSkillCreator({
    createSkillSource,
    getWorkspaceRoot,
    loadSkills,
    selectedSkillId,
    toast,
  })

  // --- Data loading ---
  async function loadSkills() {
    isLoadingList.value = true
    errorMessage.value = null
    try {
      const result = await fetchSkills(getWorkspaceRoot())
      skills.value = result.skills

      let nextSelectedId = selectedSkillId.value && result.skills.some(s => s.id === selectedSkillId.value)
        ? selectedSkillId.value
        : null

      if (!nextSelectedId && options.initialQuerySkillName) {
        const match = result.skills.find(s => s.name === options.initialQuerySkillName)
        if (match)
          nextSelectedId = match.id
      }

      selectedSkillId.value = nextSelectedId || (result.skills[0]?.id ?? null)
    }
    catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '加载 Skills 失败'
      skills.value = []
      selectedSkillId.value = null
    }
    finally {
      isLoadingList.value = false
    }
  }

  async function loadSkillDetail(id: string | null) {
    if (!id) {
      selectedSkill.value = null
      fileTreeNodes.value = []
      selectedFilePath.value = null
      fileContent.value = ''
      return
    }

    isLoadingDetail.value = true
    try {
      const result = await fetchSkillDetail(id, getWorkspaceRoot())
      selectedSkill.value = result.skill
      await loadFileTree(id)
      const fileToOpen = pendingFileRestore.value || 'SKILL.md'
      pendingFileRestore.value = null
      selectedFilePath.value = fileToOpen
      await loadFileContent(fileToOpen)
    }
    catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '加载 Skill 详情失败'
      selectedSkill.value = null
      fileTreeNodes.value = []
    }
    finally {
      isLoadingDetail.value = false
    }
  }

  async function loadFileTree(id: string) {
    isLoadingFileTree.value = true
    try {
      const result = await fetchSkillFiles(id, getWorkspaceRoot())
      fileTreeNodes.value = convertToFileTreeNodes(result.files)
      fileTreeDefaultExpanded.value = collectDirectoryIds(result.files)
    }
    catch {
      fileTreeNodes.value = []
    }
    finally {
      isLoadingFileTree.value = false
    }
  }

  async function loadFileContent(filePath: string) {
    if (!selectedSkillId.value)
      return

    isLoadingFile.value = true
    editor.exitEditState()
    try {
      const result = await fetchSkillFileContent(selectedSkillId.value, filePath, getWorkspaceRoot())
      fileContent.value = result.content
      fileLanguage.value = result.language
      editor.setEditorContent(result.content)
    }
    catch (error) {
      fileContent.value = ''
      toast.error(error instanceof Error ? error.message : '加载文件失败')
    }
    finally {
      isLoadingFile.value = false
    }
  }

  // --- File operations ---
  async function onFileSelect(node: FileTreeNode) {
    if (node.type === 'directory')
      return
    if (editor.hasUnsavedChanges.value) {
      const confirmed = await toast.confirm('当前文件有未保存的修改，确定要切换文件吗？')
      if (!confirmed)
        return
    }
    selectedFilePath.value = node.id
    loadFileContent(node.id)
  }

  // --- Preference updates ---
  async function patchSkillPreference(patch: Partial<Pick<SkillSummary, 'enabled' | 'modelInvocable' | 'userInvocable'>>) {
    if (!selectedSkill.value || isSaving.value)
      return

    isSaving.value = true
    errorMessage.value = null
    try {
      const result = await updateSkillPreference({
        id: selectedSkill.value.id,
        workspaceRoot: getWorkspaceRoot(),
        ...patch,
      })

      if (result.skill) {
        const currentSelectedId = selectedSkill.value.id

        selectedSkill.value = {
          ...selectedSkill.value,
          enabled: result.skill.enabled,
          modelInvocable: result.skill.modelInvocable,
          userInvocable: result.skill.userInvocable,
          effective: result.skill.effective,
          overriddenById: result.skill.overriddenById,
        }

        const listResult = await fetchSkills(getWorkspaceRoot())
        skills.value = listResult.skills

        if (!listResult.skills.some(skill => skill.id === currentSelectedId)) {
          selectedSkillId.value = listResult.skills[0]?.id ?? null
        }
      }
    }
    catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '更新 Skill 设置失败'
    }
    finally {
      isSaving.value = false
    }
  }

  async function toggleSkillEnabled(nextEnabled: boolean) {
    await patchSkillPreference({ enabled: nextEnabled })
  }

  // --- SSE file watcher ---
  const watcher = useSkillFileWatcher({
    isEditMode: editor.isEditMode,
    hasUnsavedChanges: editor.hasUnsavedChanges,
    getWorkspaceRoot,
    loadSkills,
    selectedSkillId,
    selectedFilePath,
    selectedSkill,
    loadFileTree,
    loadFileContent,
  })

  // --- Lifecycle ---
  onMounted(async () => {
    await loadSkills()
    watcher.setupFileWatcher()
  })

  onUnmounted(() => {
    watcher.cleanup()
  })

  return {
    // Skills list
    sourceFilter,
    skills,
    filteredSkills,
    selectedSkillId,
    selectedSkill,
    isLoadingList,
    isLoadingDetail,
    isSaving,
    errorMessage,
    createSkillSource,
    loadSkills,
    loadSkillDetail,
    toggleSkillEnabled,

    // File tree
    fileTreeNodes,
    isLoadingFileTree,
    fileTreeDefaultExpanded,
    selectedFilePath,
    fileTreeFileCount,
    onFileSelect,

    // File content
    fileContent,
    fileLanguage,
    isLoadingFile,
    isEditMode: editor.isEditMode,
    editorContent: editor.editorContent,
    isSavingFile: editor.isSavingFile,
    hasUnsavedChanges: editor.hasUnsavedChanges,
    enterEditMode: editor.enterEditMode,
    exitEditMode: editor.exitEditMode,
    onEditorChange: editor.onEditorChange,
    saveFile: editor.saveFile,

    // Markdown preview
    isMarkdownFile: editor.isMarkdownFile,
    parsedFile: editor.parsedFile,
    previewContent: editor.previewContent,

    // Create skill
    isCreating: creator.isCreating,
    newSkillName: creator.newSkillName,
    isCreateSubmitting: creator.isCreateSubmitting,
    createNameInputRef: creator.createNameInputRef,
    startCreateSkill: creator.startCreateSkill,
    cancelCreateSkill: creator.cancelCreateSkill,
    confirmCreateSkill: creator.confirmCreateSkill,
    handleCreateKeydown: creator.handleCreateKeydown,

    // SSE
    setupFileWatcher: watcher.setupFileWatcher,
  }
}
