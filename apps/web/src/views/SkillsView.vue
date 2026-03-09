<script setup lang="ts">
import type { SkillDetail, SkillFileNode, SkillSummary, WorkspaceDirectoryEntry } from '@locus-agent/shared'
import type { FileTreeNode } from '@locus-agent/ui'
import { DirectoryBrowserModal, FileTree, useToast } from '@locus-agent/ui'
import { useLocalStorage } from '@vueuse/core'
import MarkdownRender from 'markstream-vue'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createSkill, fetchSkillDetail, fetchSkillFileContent, fetchSkillFiles, fetchSkills, saveSkillFileContent, updateSkillPreference, watchSkillFiles } from '@/api/skills'
import * as workspaceApi from '@/api/workspace'
import MonacoEditor from '@/components/code/MonacoEditor.vue'
import AppNavRail from '@/components/layout/AppNavRail.vue'

type SourceFilter = 'all' | 'system' | 'project'

function getWorkspaceDisplayName(path: string): string {
  const normalized = path.trim()
  if (!normalized)
    return '未选择工作空间'
  return normalized.split('/').filter(Boolean).pop() || normalized
}

const sourceFilterOptions: Array<{ value: SourceFilter, label: string }> = [
  { value: 'all', label: '所有' },
  { value: 'system', label: '全局' },
  { value: 'project', label: '工作空间' },
]

const toast = useToast()
const route = useRoute()
const router = useRouter()
const lastWorkspacePath = useLocalStorage('locus-agent:coding-last-workspace-path', '')
const initialWorkspacePath = lastWorkspacePath.value.trim()
const workspaceRootInput = ref(initialWorkspacePath)
const currentWorkspaceName = ref(getWorkspaceDisplayName(initialWorkspacePath))
const sourceFilter = ref<SourceFilter>('all')
const skills = ref<SkillSummary[]>([])
const initialQuerySkillName = (route.query.skill as string) || null
const selectedSkillId = ref<string | null>(null)
const selectedSkill = ref<SkillDetail | null>(null)
const isLoadingList = ref(false)
const isLoadingDetail = ref(false)
const isSaving = ref(false)
const errorMessage = ref<string | null>(null)
const isWorkspacePickerOpen = ref(false)
const isWorkspacePickerLoading = ref(false)
const isWorkspacePathLoading = ref(false)
const currentBrowsePath = ref(initialWorkspacePath)
const browseEntries = ref<WorkspaceDirectoryEntry[]>([])
const isBrowseTruncated = ref(false)
let browseRequestToken = 0

// File tree state
const fileTreeNodes = ref<FileTreeNode[]>([])
const isLoadingFileTree = ref(false)
const fileTreeDefaultExpanded = ref<string[]>([])
const selectedFilePath = ref<string | null>((route.query.file as string) || null)

// File content state
const fileContent = ref('')
const fileLanguage = ref('markdown')
const isLoadingFile = ref(false)
const isEditMode = ref(false)
const editorContent = ref('')
const isSavingFile = ref(false)

// Track whether editor content has been modified by user
const hasUnsavedChanges = ref(false)

// Create skill state
const isCreating = ref(false)
const newSkillName = ref('')
const isCreateSubmitting = ref(false)
const createNameInputRef = ref<HTMLInputElement | null>(null)

// SSE watcher - suppress reload while user is editing
let unwatchFiles: (() => void) | null = null
let pendingSSERefresh = false

const filteredSkills = computed(() => {
  if (sourceFilter.value === 'all')
    return skills.value
  return skills.value.filter(skill => skill.source === sourceFilter.value)
})

const selectedWorkspaceRoot = computed(() => workspaceRootInput.value.trim() || undefined)

const createSkillSource = computed(() => {
  if (sourceFilter.value === 'system')
    return 'system' as const
  if (sourceFilter.value === 'project' && selectedWorkspaceRoot.value)
    return 'project' as const
  if (selectedWorkspaceRoot.value)
    return 'project' as const
  return 'system' as const
})

// Whether the current file is markdown (for preview mode)
const isMarkdownFile = computed(() => {
  if (!selectedFilePath.value)
    return false
  return selectedFilePath.value.endsWith('.md') || selectedFilePath.value.endsWith('.markdown')
})

// Parse frontmatter from raw markdown content
function parseFrontmatter(raw: string): { frontmatter: string, body: string } {
  if (!raw.startsWith('---\n') && !raw.startsWith('---\r\n'))
    return { frontmatter: '', body: raw }

  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match)
    return { frontmatter: '', body: raw }

  return {
    frontmatter: match[1] ?? '',
    body: raw.slice(match[0].length).trim(),
  }
}

// Parsed result for current file
const parsedFile = computed(() => {
  if (!isMarkdownFile.value && selectedFilePath.value)
    return { frontmatter: '', body: fileContent.value }

  // For SKILL.md, use server-parsed data
  if (selectedFilePath.value === 'SKILL.md' && selectedSkill.value) {
    return {
      frontmatter: selectedSkill.value.rawFrontmatter,
      body: selectedSkill.value.content,
    }
  }

  // For other markdown files, parse on the client
  return parseFrontmatter(fileContent.value)
})

// The content to show in preview (body without frontmatter)
const previewContent = computed(() => {
  if (!selectedFilePath.value)
    return selectedSkill.value?.content ?? ''
  return parsedFile.value.body
})

async function runWithLoadingState(
  target: { value: boolean },
  task: () => Promise<void>,
  options: { delay?: number, minVisible?: number } = {},
) {
  const delay = options.delay ?? 140
  const minVisible = options.minVisible ?? 160

  let shownAt = 0
  const timer = setTimeout(() => {
    target.value = true
    shownAt = Date.now()
  }, delay)

  try {
    await task()
  }
  finally {
    clearTimeout(timer)
    if (shownAt > 0) {
      const visibleFor = Date.now() - shownAt
      if (visibleFor < minVisible) {
        await new Promise(resolve => setTimeout(resolve, minVisible - visibleFor))
      }
      target.value = false
    }
  }
}

function updateWorkspaceDisplay(path?: string) {
  const normalized = path?.trim() || ''
  workspaceRootInput.value = normalized
  currentBrowsePath.value = normalized
  currentWorkspaceName.value = getWorkspaceDisplayName(normalized)
}

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

function refreshBrowsePath() {
  if (!currentBrowsePath.value)
    return
  loadBrowseEntries(currentBrowsePath.value)
}

function closeWorkspacePicker() {
  isWorkspacePickerOpen.value = false
}

async function applyWorkspaceSelection(path: string) {
  try {
    await runWithLoadingState(isLoadingList, async () => {
      const result = await workspaceApi.openWorkspace(path)
      updateWorkspaceDisplay(result.rootPath)
      lastWorkspacePath.value = result.rootPath
      isWorkspacePickerOpen.value = false
      await loadSkills()
    })
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : '打开工作空间失败')
  }
}

async function clearWorkspaceSelection() {
  updateWorkspaceDisplay('')
  lastWorkspacePath.value = ''
  await loadSkills()
}

async function loadSkills() {
  isLoadingList.value = true
  errorMessage.value = null
  try {
    const result = await fetchSkills(selectedWorkspaceRoot.value)
    skills.value = result.skills

    // If we have a current selection, try to keep it
    let nextSelectedId = selectedSkillId.value && result.skills.some(s => s.id === selectedSkillId.value)
      ? selectedSkillId.value
      : null

    // On first load, resolve skill name from query
    if (!nextSelectedId && initialQuerySkillName) {
      const match = result.skills.find(s => s.name === initialQuerySkillName)
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
    const result = await fetchSkillDetail(id, selectedWorkspaceRoot.value)
    selectedSkill.value = result.skill
    await loadFileTree(id)
    // Restore file from query, or default to SKILL.md
    const fileToOpen = selectedFilePath.value || 'SKILL.md'
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

async function loadFileTree(id: string) {
  isLoadingFileTree.value = true
  try {
    const result = await fetchSkillFiles(id, selectedWorkspaceRoot.value)
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
    const result = await fetchSkillFileContent(selectedSkillId.value, filePath, selectedWorkspaceRoot.value)
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

async function onFileSelect(node: FileTreeNode) {
  if (node.type === 'directory')
    return
  // Warn if unsaved changes
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
      workspaceRoot: selectedWorkspaceRoot.value,
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

async function patchSkillPreference(patch: Partial<Pick<SkillSummary, 'enabled' | 'modelInvocable' | 'userInvocable'>>) {
  if (!selectedSkill.value || isSaving.value)
    return

  isSaving.value = true
  errorMessage.value = null
  try {
    const result = await updateSkillPreference({
      id: selectedSkill.value.id,
      workspaceRoot: selectedWorkspaceRoot.value,
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

      const listResult = await fetchSkills(selectedWorkspaceRoot.value)
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

// ---- Create skill ----
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
      workspaceRoot: selectedWorkspaceRoot.value,
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

// ---- SSE file watcher ----
function setupFileWatcher() {
  unwatchFiles?.()
  unwatchFiles = null

  unwatchFiles = watchSkillFiles(selectedWorkspaceRoot.value, async () => {
    // If user is editing, defer the refresh
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
    // Reload detail and file tree
    try {
      const detailResult = await fetchSkillDetail(prevId, selectedWorkspaceRoot.value)
      selectedSkill.value = detailResult.skill
    }
    catch { /* ignore */ }

    // Reload file tree
    await loadFileTree(prevId)

    // Reload current file content if not editing
    if (prevFile && !isEditMode.value) {
      await loadFileContent(prevFile)
    }
  }
}

// ---- Route query sync ----
function syncRouteQuery() {
  const query: Record<string, string> = {}
  const currentSkill = skills.value.find(s => s.id === selectedSkillId.value)
  if (currentSkill)
    query.skill = currentSkill.name
  if (selectedFilePath.value)
    query.file = selectedFilePath.value
  router.replace({ query })
}

// ---- Watchers ----
watch(selectedSkillId, async (id) => {
  syncRouteQuery()
  await loadSkillDetail(id)
})

watch(selectedFilePath, () => {
  syncRouteQuery()
})

watch(lastWorkspacePath, (value) => {
  if (!workspaceRootInput.value.trim()) {
    updateWorkspaceDisplay(value)
  }
})

watch(selectedWorkspaceRoot, () => {
  setupFileWatcher()
})

// When exiting edit mode, flush pending SSE refresh
watch(isEditMode, async (editing) => {
  if (!editing && pendingSSERefresh) {
    await handleSSERefresh()
  }
})

onMounted(async () => {
  updateWorkspaceDisplay(lastWorkspacePath.value)
  await loadSkills()
  setupFileWatcher()
})

onUnmounted(() => {
  unwatchFiles?.()
})
</script>

<template>
  <div class="flex h-screen bg-background text-foreground">
    <AppNavRail />

    <main class="min-w-0 flex-1 flex">
      <!-- Left panel: Skill list -->
      <section class="w-64 border-r border-border bg-background/80 flex flex-col font-sans flex-shrink-0">
        <header class="px-4 py-3 border-b border-border space-y-3">
          <div class="flex items-center justify-between">
            <h1 class="text-sm font-semibold">
              技能管理
            </h1>
            <button
              class="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="新建技能"
              @click="startCreateSkill"
            >
              <span class="i-material-symbols:add h-4.5 w-4.5" />
            </button>
          </div>

          <div class="flex items-center gap-1.5">
            <button
              class="min-w-0 inline-flex items-center gap-1.5 rounded px-1.5 py-1 transition-colors hover:bg-muted"
              @click="openWorkspacePicker"
            >
              <span class="i-material-symbols:folder-managed h-3.5 w-3.5 flex-none text-muted-foreground" />
              <span
                class="max-w-[9rem] truncate text-xs text-muted-foreground"
                :title="currentWorkspaceName"
              >
                {{ currentWorkspaceName }}
              </span>
            </button>
            <button
              v-if="selectedWorkspaceRoot"
              class="h-6 px-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
              @click="clearWorkspaceSelection"
            >
              清除
            </button>
          </div>

          <div class="flex items-center border-b border-border -mb-3">
            <button
              v-for="option in sourceFilterOptions"
              :key="option.value"
              class="relative px-2.5 py-1.5 text-xs transition-colors"
              :class="sourceFilter === option.value ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'"
              @click="sourceFilter = option.value"
            >
              {{ option.label }}
              <span
                v-if="sourceFilter === option.value"
                class="absolute inset-x-0 bottom-0 h-0.5 bg-foreground"
              />
            </button>
          </div>
        </header>

        <div class="flex-1 overflow-y-auto">
          <div v-if="errorMessage" class="mx-3 mt-3 rounded border border-red/30 bg-red/8 px-2.5 py-1.5 text-xs text-red-600">
            {{ errorMessage }}
          </div>

          <div v-if="isLoadingList" class="px-4 py-6 text-xs text-muted-foreground">
            正在加载 Skills ...
          </div>

          <div v-else-if="filteredSkills.length === 0 && !isCreating" class="px-4 py-6 text-xs text-muted-foreground">
            当前范围内没有可用 Skills。
          </div>

          <div v-else class="py-0.5">
            <!-- Create new skill input -->
            <div v-if="isCreating" class="px-2 py-1">
              <div class="flex items-center gap-1.5 bg-muted/60 rounded px-2.5 py-1.5">
                <span class="i-material-symbols:add-circle-outline h-3.5 w-3.5 flex-none text-muted-foreground" />
                <input
                  ref="createNameInputRef"
                  v-model="newSkillName"
                  class="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                  placeholder="技能名称，回车确认"
                  :disabled="isCreateSubmitting"
                  @keydown="handleCreateKeydown"
                  @blur="cancelCreateSkill"
                >
              </div>
              <div class="mt-1 px-1 text-[10px] text-muted-foreground/70">
                {{ createSkillSource === 'system' ? '全局' : '工作空间' }}
              </div>
            </div>

            <button
              v-for="skill in filteredSkills"
              :key="skill.id"
              class="w-full h-9 px-3 flex items-center justify-between gap-2 text-left transition-colors"
              :class="selectedSkillId === skill.id ? 'bg-accent text-foreground' : 'hover:bg-accent/50 text-foreground/90'"
              @click="selectedSkillId = skill.id"
            >
              <span class="min-w-0 truncate text-sm">{{ skill.name }}</span>
              <span class="flex items-center gap-1.5 flex-none">
                <span
                  class="h-1.5 w-1.5 rounded-full"
                  :class="skill.effective ? 'bg-green-500' : 'bg-muted-foreground/40'"
                />
              </span>
            </button>
          </div>
        </div>
      </section>

      <!-- Center area: file preview / editor -->
      <section class="min-w-0 flex-1 flex flex-col font-sans">
        <div v-if="!selectedSkillId" class="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          选择一个 Skill 查看详情
        </div>

        <template v-else-if="selectedSkill">
          <!-- Toolbar -->
          <header class="h-11 border-b border-border flex items-center justify-between px-4 flex-shrink-0 gap-3">
            <div class="flex items-center gap-2 min-w-0">
              <span v-if="selectedFilePath" class="text-xs font-mono text-muted-foreground truncate">
                {{ selectedFilePath }}
              </span>
              <span v-if="hasUnsavedChanges" class="h-2 w-2 rounded-full bg-amber-500 flex-shrink-0" title="有未保存修改" />
            </div>

            <div class="flex items-center gap-1.5 flex-shrink-0">
              <template v-if="isEditMode">
                <button
                  class="h-7 px-2.5 rounded text-xs font-medium transition-colors bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  :disabled="isSavingFile || !hasUnsavedChanges"
                  @click="saveFile"
                >
                  {{ isSavingFile ? '保存中...' : '保存' }}
                </button>
                <button
                  class="h-7 px-2.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  @click="exitEditMode"
                >
                  退出编辑
                </button>
              </template>
              <template v-else>
                <button
                  v-if="selectedFilePath"
                  class="h-7 px-2.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors inline-flex items-center gap-1"
                  @click="enterEditMode"
                >
                  <span class="i-material-symbols:edit-outline text-2xs" />
                  编辑
                </button>
              </template>
            </div>
          </header>

          <!-- Content area -->
          <div v-if="isLoadingDetail || isLoadingFile" class="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            加载中 ...
          </div>

          <div v-else-if="isEditMode" class="flex-1 overflow-hidden">
            <MonacoEditor
              :model-value="editorContent"
              :language="fileLanguage"
              :options="{ lineNumbers: 'on', folding: true }"
              class="skill-editor"
              @update:model-value="onEditorChange"
            />
          </div>

          <div v-else class="flex-1 overflow-y-auto">
            <!-- Preview: markdown rendered -->
            <template v-if="isMarkdownFile || !selectedFilePath">
              <!-- Frontmatter block -->
              <section
                v-if="parsedFile.frontmatter"
                class="mx-6 mt-5 rounded border border-border bg-muted/20 overflow-hidden"
              >
                <div class="px-3 py-1.5 border-b border-border bg-muted/30">
                  <span class="text-[10px] font-medium font-sans text-muted-foreground uppercase tracking-wider">Frontmatter</span>
                </div>
                <pre class="px-3 py-2.5 text-xs leading-5 overflow-x-auto whitespace-pre-wrap font-mono text-foreground/80">{{ parsedFile.frontmatter }}</pre>
              </section>

              <section class="px-6 py-5">
                <div class="prose prose-sm dark:prose-invert max-w-none text-foreground">
                  <MarkdownRender :content="previewContent" />
                </div>
              </section>
            </template>
            <!-- Preview: non-markdown files as code block -->
            <template v-else>
              <section class="px-6 py-5">
                <pre class="text-xs leading-5 overflow-x-auto whitespace-pre-wrap font-mono text-foreground/80 bg-muted/30 rounded p-4">{{ fileContent }}</pre>
              </section>
            </template>
          </div>
        </template>

        <div v-else-if="isLoadingDetail" class="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          加载中 ...
        </div>
      </section>

      <!-- Right sidebar: info + file tree -->
      <aside
        v-if="selectedSkill"
        class="w-60 border-l border-border bg-background/60 flex flex-col flex-shrink-0 font-sans overflow-hidden"
      >
        <!-- Info overview -->
        <div class="flex-shrink-0 overflow-y-auto">
          <div class="px-3 py-3 space-y-2.5">
            <div class="flex items-center justify-between gap-2">
              <h3 class="text-sm font-semibold truncate">
                {{ selectedSkill.name }}
              </h3>
              <button
                class="h-6 min-w-[52px] px-2 inline-flex gap-2 items-center justify-center rounded text-[10px] font-medium transition-colors disabled:opacity-50"
                :class="selectedSkill.enabled
                  ? 'border border-border text-muted-foreground hover:bg-muted'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'"
                :disabled="isSaving"
                @click="toggleSkillEnabled(!selectedSkill.enabled)"
              >
                <div v-if="selectedSkill.enabled" class="i-material-symbols:toggle-on h-3.5 w-3.5" />
                <div v-else class="i-material-symbols:toggle-off h-3.5 w-3.5" />
                {{ selectedSkill.enabled ? '停用' : '启用' }}
              </button>
            </div>

            <p v-if="selectedSkill.description" class="text-xs leading-4.5 text-muted-foreground line-clamp-3">
              {{ selectedSkill.description }}
            </p>

            <div class="flex items-center gap-1.5 flex-wrap my-2">
              <span class="px-1.5 py-0.5 text-[10px] text-muted-foreground border border-border rounded bg-muted/30">
                {{ selectedSkill.source === 'system' ? '全局' : '工作空间' }}
              </span>
              <span
                v-if="selectedSkill.effective"
                class="px-1.5 py-0.5 text-[10px] text-green-600 border border-green/30 rounded bg-green/8"
              >
                生效中
              </span>
            </div>
          </div>
        </div>

        <!-- Divider -->
        <div class="border-t border-border flex-shrink-0" />

        <!-- File tree -->
        <div class="flex-1 overflow-hidden flex flex-col min-h-0">
          <div class="px-3 py-2 flex-shrink-0">
            <span class="text-xs font-medium font-sans text-muted-foreground uppercase tracking-wider">{{ selectedSkill.resourceCount }} 个文件</span>
          </div>

          <div v-if="isLoadingFileTree" class="px-3 py-3 text-xs text-muted-foreground">
            加载中 ...
          </div>

          <div v-else-if="fileTreeNodes.length === 0" class="px-3 py-3 text-xs text-muted-foreground">
            暂无文件
          </div>

          <div v-else class="flex-1 overflow-hidden">
            <FileTree
              :key="selectedSkillId ?? undefined"
              :nodes="fileTreeNodes"
              :selected-id="selectedFilePath"
              :item-height="26"
              :indent="12"
              :default-expanded="fileTreeDefaultExpanded"
              container-class="h-full"
              @select="onFileSelect"
            >
              <template #default="{ node }">
                <div
                  class="flex items-center gap-1.5 min-w-0 py-0.5 px-1 rounded"
                  :class="selectedFilePath === node.id
                    ? 'text-accent-foreground font-medium'
                    : 'text-foreground/80 hover:text-foreground'"
                >
                  <span class="truncate font-mono text-11px">{{ node.label }}</span>
                </div>
              </template>
            </FileTree>
          </div>
        </div>
      </aside>
    </main>

    <DirectoryBrowserModal
      v-model:open="isWorkspacePickerOpen"
      title="选择工作目录"
      :current-path="currentBrowsePath"
      :entries="browseEntries"
      :loading="isWorkspacePickerLoading || isWorkspacePathLoading"
      :truncated="isBrowseTruncated"
      @close="closeWorkspacePicker"
      @refresh="refreshBrowsePath"
      @go-parent="goToParentBrowsePath"
      @navigate="loadBrowseEntries"
      @submit-path="loadBrowseEntries"
      @confirm="applyWorkspaceSelection(currentBrowsePath)"
    />
  </div>
</template>

<style scoped>
.skill-editor {
  height: 100%;
  min-height: 0;
}

.skill-editor :deep(.monaco-editor-container) {
  height: 100%;
  min-height: 0;
  border: none;
  border-radius: 0;
}
</style>
