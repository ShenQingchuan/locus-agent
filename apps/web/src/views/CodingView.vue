<script setup lang="ts">
import type {
  WorkspaceDirectoryEntry,
  WorkspaceTreeNode,
} from '@locus-agent/shared'
import type { FileTreeNode } from '@locus-agent/ui'
import { DirectoryBrowserModal, FileTree, useToast } from '@locus-agent/ui'
import { ref } from 'vue'
import * as workspaceApi from '@/api/workspace'
import AppNavRail from '@/components/layout/AppNavRail.vue'

type CodingSection = 'planning' | 'workspace'

const activeSection = ref<CodingSection>('planning')
const currentProjectName = ref('未选择工作空间')
const workspaceTree = ref<FileTreeNode[]>([])
const selectedFileId = ref<string | null>(null)
const isWorkspaceLoading = ref(false)
const isWorkspacePickerOpen = ref(false)
const isWorkspacePickerLoading = ref(false)
const isWorkspacePathLoading = ref(false)
const currentBrowsePath = ref('')
const browseEntries = ref<WorkspaceDirectoryEntry[]>([])
const isBrowseTruncated = ref(false)

const toast = useToast()

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

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
        await sleep(minVisible - visibleFor)
      }
      target.value = false
    }
  }
}

function toFileTreeNodes(nodes: WorkspaceTreeNode[]): FileTreeNode[] {
  return nodes.map(node => ({
    id: node.id,
    label: node.label,
    type: node.type,
    children: node.children ? toFileTreeNodes(node.children) : undefined,
  }))
}

function handleFileSelect(node: FileTreeNode) {
  if (node.type === 'file') {
    selectedFileId.value = node.id
  }
}

async function loadBrowseEntries(path: string) {
  if (!path) {
    return
  }

  try {
    await runWithLoadingState(isWorkspacePathLoading, async () => {
      const result = await workspaceApi.fetchWorkspaceDirectories(path)
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

function closeWorkspacePicker() {
  isWorkspacePickerOpen.value = false
}

async function openCurrentBrowsePathAsWorkspace() {
  if (!currentBrowsePath.value) {
    return
  }

  try {
    await runWithLoadingState(isWorkspaceLoading, async () => {
      const result = await workspaceApi.openWorkspace(currentBrowsePath.value)
      currentProjectName.value = result.rootName
      workspaceTree.value = toFileTreeNodes(result.tree)
      selectedFileId.value = null
      activeSection.value = 'workspace'
      isWorkspacePickerOpen.value = false

      if (result.truncated) {
        toast.warning('工作空间较大，已进行部分裁剪显示')
      }
    })
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : '打开工作空间失败')
  }
}

function goToParentBrowsePath() {
  if (!currentBrowsePath.value) {
    return
  }

  const normalized = currentBrowsePath.value.endsWith('/')
    ? currentBrowsePath.value.slice(0, -1)
    : currentBrowsePath.value
  const index = normalized.lastIndexOf('/')

  if (index <= 0) {
    return
  }

  const parentPath = normalized.slice(0, index)
  if (parentPath) {
    loadBrowseEntries(parentPath)
  }
}
</script>

<template>
  <div class="h-screen flex bg-background">
    <AppNavRail />

    <div class="flex-1 min-w-0 flex">
      <aside class="w-56 border-r border-border bg-sidebar-background flex flex-col">
        <div class="px-3 py-3 border-b border-border min-h-12">
          <button
            class="w-full text-left text-xs text-muted-foreground truncate hover:text-foreground transition-colors"
            @click="openWorkspacePicker"
          >
            当前项目：<span class="font-mono text-foreground">{{ currentProjectName }}</span>
          </button>
        </div>

        <div class="p-2 space-y-0.5">
          <button
            class="w-full text-left px-2.5 py-2 rounded text-sm transition-colors"
            :class="activeSection === 'workspace'
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground'"
            @click="activeSection = 'workspace'"
          >
            <span class="inline-flex items-center gap-2">
              <span class="i-streamline:computer-pc-desktop-remix h-4 w-4" />
              编码工作台
            </span>
          </button>

          <button
            class="w-full text-left px-2.5 py-2 rounded text-sm transition-colors"
            :class="activeSection === 'planning'
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground'"
            @click="activeSection = 'planning'"
          >
            <span class="inline-flex items-center gap-2">
              <span class="i-bi:kanban-fill h-4 w-4" />
              任务编排
            </span>
          </button>
        </div>
      </aside>

      <div class="flex-1 min-w-0 flex">
        <div class="flex-1 min-w-0 flex flex-col border-r border-border">
          <header class="h-11 border-b border-border px-4 flex items-center justify-between">
            <h1 class="text-sm font-semibold">
              {{ activeSection === 'planning' ? '任务编排' : '编码界面' }}
            </h1>
            <button
              v-if="activeSection === 'planning'"
              class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded px-1.5 py-1 transition-colors"
            >
              <div class="i-carbon-add h-4 w-4" />
              <span>新建任务</span>
            </button>
          </header>

          <main class="flex-1 min-h-0">
            <section
              v-if="activeSection === 'planning'"
              class="h-full min-h-0 grid grid-cols-1 md:grid-cols-3 md:divide-x divide-border"
            >
              <div class="min-h-0 overflow-y-auto px-3 py-2.5">
                <span class="text-xs text-muted-foreground">Kanban Backlog 占位示意</span>
              </div>
              <div class="min-h-0 overflow-y-auto px-3 py-2.5">
                <span class="text-xs text-muted-foreground">Kanban In Progress 占位示意</span>
              </div>
              <div class="min-h-0 overflow-y-auto px-3 py-2.5">
                <span class="text-xs text-muted-foreground">Kanban Done 占位示意</span>
              </div>
            </section>

            <section
              v-else
              class="h-full min-h-0 grid grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)]"
            >
              <aside class="min-h-0 border-b xl:border-b-0 xl:border-r border-border px-2 py-2">
                <div v-if="isWorkspaceLoading" class="h-full flex items-center justify-center px-2">
                  <div class="inline-flex items-center gap-2.5 text-xs text-muted-foreground">
                    <span class="i-svg-spinners:90-ring-with-bg h-4 w-4" />
                    <span>正在载入文件...</span>
                  </div>
                </div>
                <template v-else-if="workspaceTree.length > 0">
                  <FileTree
                    :nodes="workspaceTree"
                    :selected-id="selectedFileId"
                    :item-height="28"
                    container-class="h-full"
                    :default-expanded="[workspaceTree[0]!.id]"
                    @select="handleFileSelect"
                  />
                </template>
                <div v-else class="h-full flex items-center justify-center px-2">
                  <div class="inline-flex items-center gap-2 text-xs text-muted-foreground text-center">
                    <span class="i-carbon-folder-add h-4 w-4 opacity-70" />
                    <span>尚未选择工作空间</span>
                  </div>
                </div>
              </aside>

              <div class="min-h-0 px-3 py-2.5">
                <span class="text-xs text-muted-foreground">编码台活动区占位示意（编辑器 + Git 改动）</span>
              </div>
            </section>
          </main>
        </div>

        <aside class="w-80 xl:w-[340px] min-w-0 flex flex-col">
          <div class="h-11 px-3 border-b border-border flex items-center">
            <p class="text-sm font-medium">
              研发助手
            </p>
          </div>

          <div class="flex-1 min-h-0 px-3 py-2.5">
            <span class="text-xs text-muted-foreground">编码台助手区占位示意（对话与建议）</span>
          </div>
        </aside>
      </div>
    </div>
  </div>

  <DirectoryBrowserModal
    :open="isWorkspacePickerOpen"
    :current-path="currentBrowsePath"
    :entries="browseEntries"
    :loading="isWorkspacePickerLoading || isWorkspacePathLoading"
    :truncated="isBrowseTruncated"
    :confirm-loading="isWorkspaceLoading"
    @close="closeWorkspacePicker"
    @refresh="loadBrowseEntries(currentBrowsePath)"
    @go-parent="goToParentBrowsePath"
    @navigate="loadBrowseEntries"
    @confirm="openCurrentBrowsePathAsWorkspace"
  />
</template>
