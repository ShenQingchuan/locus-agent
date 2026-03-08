<script setup lang="ts">
import type { SkillDetail, SkillSummary, WorkspaceDirectoryEntry } from '@locus-agent/shared'
import { DirectoryBrowserModal, useToast } from '@locus-agent/ui'
import { useLocalStorage } from '@vueuse/core'
import MarkdownRender from 'markstream-vue'
import { computed, onMounted, ref, watch } from 'vue'
import { fetchSkillDetail, fetchSkills, updateSkillPreference } from '@/api/skills'
import * as workspaceApi from '@/api/workspace'
import AppNavRail from '@/components/layout/AppNavRail.vue'

type SourceFilter = 'all' | 'system' | 'project'
type DetailTab = 'content' | 'overview'

const sourceFilterOptions: Array<{ value: SourceFilter, label: string }> = [
  { value: 'all', label: '所有' },
  { value: 'system', label: '全局' },
  { value: 'project', label: '工作空间' },
]
const detailTabs: Array<{ value: DetailTab, label: string }> = [
  { value: 'content', label: '技能内容' },
  { value: 'overview', label: '信息概览' },
]
const toast = useToast()
const lastWorkspacePath = useLocalStorage('locus-agent:coding-last-workspace-path', '')
const workspaceRootInput = ref(lastWorkspacePath.value)
const currentWorkspaceName = ref(lastWorkspacePath.value ? lastWorkspacePath.value.split('/').filter(Boolean).pop() || '未选择工作空间' : '未选择工作空间')
const sourceFilter = ref<SourceFilter>('all')
const skills = ref<SkillSummary[]>([])
const selectedSkillId = ref<string | null>(null)
const selectedSkill = ref<SkillDetail | null>(null)
const isLoadingList = ref(false)
const isLoadingDetail = ref(false)
const isSaving = ref(false)
const errorMessage = ref<string | null>(null)
const activeDetailTab = ref<DetailTab>('content')
const isWorkspacePickerOpen = ref(false)
const isWorkspacePickerLoading = ref(false)
const isWorkspacePathLoading = ref(false)
const currentBrowsePath = ref(lastWorkspacePath.value.trim())
const browseEntries = ref<WorkspaceDirectoryEntry[]>([])
const isBrowseTruncated = ref(false)
let browseRequestToken = 0

const filteredSkills = computed(() => {
  if (sourceFilter.value === 'all')
    return skills.value
  return skills.value.filter(skill => skill.source === sourceFilter.value)
})

const selectedWorkspaceRoot = computed(() => workspaceRootInput.value.trim() || undefined)
const referenceResources = computed(() => {
  return selectedSkill.value?.resources.filter(resource => resource.type === 'reference') ?? []
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
  currentWorkspaceName.value = normalized
    ? normalized.split('/').filter(Boolean).pop() || normalized
    : '未选择工作空间'
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

    const nextSelectedId = selectedSkillId.value && result.skills.some(skill => skill.id === selectedSkillId.value)
      ? selectedSkillId.value
      : (result.skills[0]?.id ?? null)

    selectedSkillId.value = nextSelectedId
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
    return
  }

  isLoadingDetail.value = true
  try {
    const result = await fetchSkillDetail(id, selectedWorkspaceRoot.value)
    selectedSkill.value = result.skill
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载 Skill 详情失败'
    selectedSkill.value = null
  }
  finally {
    isLoadingDetail.value = false
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
      skills.value = skills.value.map(skill => skill.id === result.skill!.id ? result.skill! : skill)
      if (selectedSkill.value.id === result.skill.id) {
        selectedSkill.value = {
          ...selectedSkill.value,
          enabled: result.skill.enabled,
          modelInvocable: result.skill.modelInvocable,
          userInvocable: result.skill.userInvocable,
          effective: result.skill.effective,
          overriddenById: result.skill.overriddenById,
        }
      }
      await loadSkills()
      await loadSkillDetail(result.skill.id)
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

watch(selectedSkillId, async (id) => {
  activeDetailTab.value = 'content'
  await loadSkillDetail(id)
})

watch(lastWorkspacePath, (value) => {
  if (!workspaceRootInput.value.trim()) {
    updateWorkspaceDisplay(value)
  }
})

onMounted(async () => {
  updateWorkspaceDisplay(lastWorkspacePath.value)
  await loadSkills()
})
</script>

<template>
  <div class="flex h-screen bg-background text-foreground">
    <AppNavRail />

    <main class="min-w-0 flex-1 flex">
      <section class="w-90 border-r border-border bg-background/80 flex flex-col font-sans">
        <header class="px-5 py-4 border-b border-border space-y-4">
          <h1 class="text-base font-semibold">
            技能管理
          </h1>

          <div class="mt-2 flex items-center gap-2">
            <button
              class="min-w-0 inline-flex items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-muted"
              @click="openWorkspacePicker"
            >
              <span class="i-material-symbols:folder-managed h-4 w-4 flex-none text-muted-foreground" />
              <span class="text-sm text-foreground/90 whitespace-nowrap">工作目录</span>
              <span
                class="max-w-[12rem] truncate text-xs font-sans text-muted-foreground"
                :title="currentWorkspaceName"
              >
                {{ currentWorkspaceName }}
              </span>
            </button>

            <button
              v-if="selectedWorkspaceRoot"
              class="h-7 px-2 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
              @click="clearWorkspaceSelection"
            >
              清除
            </button>
          </div>

          <div class="flex items-center border-b border-border -mb-4">
            <button
              v-for="option in sourceFilterOptions"
              :key="option.value"
              class="relative px-3 py-2 text-sm transition-colors"
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
          <div v-if="errorMessage" class="mx-3 mt-3 rounded-lg border border-red/30 bg-red/8 px-3 py-2 text-sm text-red-600">
            {{ errorMessage }}
          </div>

          <div v-if="isLoadingList" class="px-4 py-6 text-sm text-muted-foreground font-sans">
            正在加载 Skills ...
          </div>

          <div v-else-if="filteredSkills.length === 0" class="px-4 py-6 text-sm text-muted-foreground font-sans">
            当前范围内没有可用 Skills。
          </div>

          <div v-else class="py-1 font-sans">
            <button
              v-for="skill in filteredSkills"
              :key="skill.id"
              class="w-full h-10 px-4 flex items-center justify-between gap-3 text-left transition-colors"
              :class="selectedSkillId === skill.id ? 'bg-accent text-foreground' : 'hover:bg-accent/50 text-foreground/90'"
              @click="selectedSkillId = skill.id"
            >
              <span class="min-w-0 truncate text-sm">{{ skill.name }}</span>
              <span class="flex items-center gap-2 flex-none text-xs text-muted-foreground">
                <span>{{ skill.source === 'system' ? '全局' : '工作空间' }}</span>
                <span
                  class="h-2 w-2 rounded-full"
                  :class="skill.effective ? 'bg-green-500' : 'bg-muted-foreground/40'"
                />
              </span>
            </button>
          </div>
        </div>
      </section>

      <section class="min-w-0 flex-1 flex flex-col font-sans">
        <div v-if="!selectedSkillId" class="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          选择一个 Skill 查看详情。
        </div>

        <template v-else>
          <header class="border-b border-border">
            <div class="px-6 py-5 flex items-start justify-between gap-4">
              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h2 class="text-lg font-semibold truncate">
                    {{ selectedSkill?.name || 'Skill' }}
                  </h2>
                  <span
                    v-if="selectedSkill"
                    class="px-2 py-0.5 text-xs text-muted-foreground border border-border bg-muted/30"
                  >
                    {{ selectedSkill.source === 'system' ? '全局' : '工作空间' }}
                  </span>
                </div>
                <p class="mt-2 text-sm leading-6 text-muted-foreground font-sans">
                  {{ selectedSkill?.description }}
                </p>
              </div>

              <button
                v-if="selectedSkill"
                class="h-9 min-w-[88px] px-4 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90"
                :disabled="isSaving"
                @click="toggleSkillEnabled(!selectedSkill.enabled)"
              >
                {{ selectedSkill.enabled ? '停用' : '启用' }}
              </button>
            </div>

            <div class="px-6 flex items-center gap-5">
              <button
                v-for="tab in detailTabs"
                :key="tab.value"
                class="relative py-3 text-sm transition-colors"
                :class="activeDetailTab === tab.value ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'"
                @click="activeDetailTab = tab.value"
              >
                {{ tab.label }}
                <span
                  v-if="activeDetailTab === tab.value"
                  class="absolute inset-x-0 bottom-0 h-0.5 bg-foreground"
                />
              </button>
            </div>
          </header>

          <div v-if="isLoadingDetail" class="px-6 py-6 text-sm text-muted-foreground font-sans">
            正在加载 Skill 详情 ...
          </div>

          <div v-else-if="selectedSkill" class="flex-1 overflow-y-auto font-sans">
            <template v-if="activeDetailTab === 'content'">
              <section class="px-6 py-6">
                <div class="prose prose-sm dark:prose-invert max-w-none font-sans text-foreground">
                  <MarkdownRender :content="selectedSkill.content" />
                </div>
              </section>
            </template>

            <template v-else>
              <section class="border-b border-border">
                <div class="px-6 py-3 text-sm font-medium">
                  Frontmatter
                </div>
                <pre class="px-6 pb-5 text-xs leading-6 overflow-x-auto whitespace-pre-wrap font-mono">{{ selectedSkill.rawFrontmatter || '(empty)' }}</pre>
              </section>

              <section class="border-b border-border">
                <div class="px-6 py-3 text-sm font-medium">
                  Reference
                </div>
                <div v-if="referenceResources.length === 0" class="px-6 pb-5 text-sm text-muted-foreground">
                  无 reference 文件。
                </div>
                <div v-else>
                  <div
                    v-for="resource in referenceResources"
                    :key="resource.path"
                    class="px-6 py-3 flex items-center justify-between gap-4 border-t border-border first:border-t-0"
                  >
                    <code class="text-xs break-all font-mono">{{ resource.path }}</code>
                  </div>
                </div>
              </section>
            </template>
          </div>
        </template>
      </section>
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
