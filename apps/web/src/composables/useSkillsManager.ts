import type { SkillDetail, SkillFileNode, SkillSummary } from '@univedge/locus-agent-sdk'
import type { FileTreeNode } from '@univedge/locus-ui'
import { useToast } from '@univedge/locus-ui'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { createSkill, fetchSkillDetail, fetchSkillFileContent, fetchSkillFiles, fetchSkills, saveSkillFileContent, updateSkillPreference, watchSkillFiles } from '@/api/skills'

const RE_FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

type SourceFilter = 'all' | 'system' | 'project'

export interface UseSkillsManagerOptions {
  /** Reactive getter for the selected workspace root (undefined = none) */
  selectedWorkspaceRoot: () => string | undefined
  /** Initial skill name from route query */
  initialQuerySkillName?: string | null
  /** Initial file path from route query */
  initialQueryFile?: string | null
}

// Parse frontmatter from raw markdown content
function parseFrontmatter(raw: string): { frontmatter: string, body: string } {
  if (!raw.startsWith('---\n') && !raw.startsWith('---\r\n'))
    return { frontmatter: '', body: raw }

  const match = raw.match(RE_FRONTMATTER)
  if (!match)
    return { frontmatter: '', body: raw }

  return {
    frontmatter: match[1] ?? '',
    body: raw.slice(match[0].length).trim(),
  }
}

function convertToFileTreeNodes(nodes: SkillFileNode[]): FileTreeNode[] {
  return nodes.map(node => ({
    id: node.path,
    label: node.name,
    type: node.type,
    children: node.children ? convertToFileTreeNodes(node.children) : undefined,
  }))
}

function collectDirectoryIds(nodes: SkillFileNode[]): string[] {
  const ids: string[] = []
  for (const node of nodes) {
    if (node.type === 'directory') {
      ids.push(node.path)
      if (node.children) {
        ids.push(...collectDirectoryIds(node.children))
      }
    }
  }
  return ids
}

function countFileNodes(nodes: FileTreeNode[]): number {
  let count = 0
  for (const node of nodes) {
    if (node.type === 'file')
      count++
    if (node.children)
      count += countFileNodes(node.children)
  }
  return count
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
  const isEditMode = ref(false)
  const editorContent = ref('')
  const isSavingFile = ref(false)
  const hasUnsavedChanges = ref(false)

  // --- Markdown preview ---
  const isMarkdownFile = computed(() => {
    if (!selectedFilePath.value)
      return false
    return selectedFilePath.value.endsWith('.md') || selectedFilePath.value.endsWith('.markdown')
  })

  const parsedFile = computed(() => {
    if (!isMarkdownFile.value && selectedFilePath.value)
      return { frontmatter: '', body: fileContent.value }
    if (selectedFilePath.value === 'SKILL.md' && selectedSkill.value) {
      return {
        frontmatter: selectedSkill.value.rawFrontmatter,
        body: selectedSkill.value.content,
      }
    }
    return parseFrontmatter(fileContent.value)
  })

  const previewContent = computed(() => {
    if (!selectedFilePath.value)
      return selectedSkill.value?.content ?? ''
    return parsedFile.value.body
  })

  // --- Create skill state ---
  const isCreating = ref(false)
  const newSkillName = ref('')
  const isCreateSubmitting = ref(false)
  const createNameInputRef = ref<HTMLInputElement | null>(null)

  // --- SSE watcher ---
  let unwatchFiles: (() => void) | null = null
  let pendingSSERefresh = false

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
    isEditMode.value = false
    hasUnsavedChanges.value = false
    try {
      const result = await fetchSkillFileContent(selectedSkillId.value, filePath, getWorkspaceRoot())
      fileContent.value = result.content
      fileLanguage.value = result.language
      editorContent.value = result.content
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
    if (hasUnsavedChanges.value) {
      const confirmed = await toast.confirm('当前文件有未保存的修改，确定要切换文件吗？')
      if (!confirmed)
        return
    }
    selectedFilePath.value = node.id
    loadFileContent(node.id)
  }

  function enterEditMode() {
    editorContent.value = fileContent.value
    isEditMode.value = true
    hasUnsavedChanges.value = false
  }

  async function exitEditMode() {
    if (hasUnsavedChanges.value) {
      const confirmed = await toast.confirm('当前文件有未保存的修改，确定要退出编辑模式吗？')
      if (!confirmed)
        return
    }
    isEditMode.value = false
    hasUnsavedChanges.value = false
  }

  function onEditorChange(value: string) {
    editorContent.value = value
    hasUnsavedChanges.value = value !== fileContent.value
  }

  async function saveFile() {
    if (!selectedSkillId.value || !selectedFilePath.value || isSavingFile.value)
      return

    isSavingFile.value = true
    try {
      await saveSkillFileContent({
        skillId: selectedSkillId.value,
        filePath: selectedFilePath.value,
        content: editorContent.value,
        workspaceRoot: getWorkspaceRoot(),
      })
      fileContent.value = editorContent.value
      hasUnsavedChanges.value = false
      toast.success('保存成功')
    }
    catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败')
    }
    finally {
      isSavingFile.value = false
    }
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

  // --- Create skill ---
  function startCreateSkill() {
    isCreating.value = true
    newSkillName.value = ''
    nextTick(() => {
      createNameInputRef.value?.focus()
    })
  }

  function cancelCreateSkill() {
    isCreating.value = false
    newSkillName.value = ''
  }

  async function confirmCreateSkill() {
    const name = newSkillName.value.trim()
    if (!name || isCreateSubmitting.value)
      return

    isCreateSubmitting.value = true
    try {
      const result = await createSkill({
        name,
        source: createSkillSource.value,
        workspaceRoot: getWorkspaceRoot(),
      })

      if (result.success && result.skill) {
        isCreating.value = false
        newSkillName.value = ''
        await loadSkills()
        selectedSkillId.value = result.skill.id
        toast.success(`技能 "${name}" 创建成功`)
      }
    }
    catch (error) {
      toast.error(error instanceof Error ? error.message : '创建技能失败')
    }
    finally {
      isCreateSubmitting.value = false
    }
  }

  function handleCreateKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault()
      confirmCreateSkill()
    }
    else if (event.key === 'Escape') {
      cancelCreateSkill()
    }
  }

  // --- SSE file watcher ---
  function setupFileWatcher() {
    unwatchFiles?.()
    unwatchFiles = null

    unwatchFiles = watchSkillFiles(getWorkspaceRoot(), async () => {
      if (isEditMode.value && hasUnsavedChanges.value) {
        pendingSSERefresh = true
        return
      }
      await handleSSERefresh()
    })
  }

  async function handleSSERefresh() {
    pendingSSERefresh = false
    const prevId = selectedSkillId.value
    const prevFile = selectedFilePath.value

    await loadSkills()

    if (prevId && selectedSkillId.value === prevId) {
      try {
        const detailResult = await fetchSkillDetail(prevId, getWorkspaceRoot())
        selectedSkill.value = detailResult.skill
      }
      catch { /* ignore */ }

      await loadFileTree(prevId)

      if (prevFile && !isEditMode.value) {
        await loadFileContent(prevFile)
      }
    }
  }

  // --- Lifecycle ---
  watch(isEditMode, async (editing) => {
    if (!editing && pendingSSERefresh) {
      await handleSSERefresh()
    }
  })

  onMounted(async () => {
    await loadSkills()
    setupFileWatcher()
  })

  onUnmounted(() => {
    unwatchFiles?.()
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
    isEditMode,
    editorContent,
    isSavingFile,
    hasUnsavedChanges,
    enterEditMode,
    exitEditMode,
    onEditorChange,
    saveFile,

    // Markdown preview
    isMarkdownFile,
    parsedFile,
    previewContent,

    // Create skill
    isCreating,
    newSkillName,
    isCreateSubmitting,
    createNameInputRef,
    startCreateSkill,
    cancelCreateSkill,
    confirmCreateSkill,
    handleCreateKeydown,

    // SSE
    setupFileWatcher,
  }
}
