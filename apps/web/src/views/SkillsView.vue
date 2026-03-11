<script setup lang="ts">
import { FileTree } from '@univedge/locus-ui'
import MarkdownRender from 'markstream-vue'
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MonacoEditor from '@/components/code/MonacoEditor.vue'
import AppNavRail from '@/components/layout/AppNavRail.vue'
import { useSkillsManager } from '@/composables/useSkillsManager'
import { useWorkspaceStore } from '@/stores/workspace'

const sourceFilterOptions: Array<{ value: 'all' | 'system' | 'project', label: string }> = [
  { value: 'all', label: '所有' },
  { value: 'system', label: '全局' },
  { value: 'project', label: '工作空间' },
]

const route = useRoute()
const router = useRouter()
const workspaceStore = useWorkspaceStore()

const selectedWorkspaceRoot = computed(() => workspaceStore.currentWorkspacePath.trim() || undefined)

const {
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
  fileTreeNodes,
  isLoadingFileTree,
  fileTreeDefaultExpanded,
  selectedFilePath,
  fileTreeFileCount,
  onFileSelect,
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
  isMarkdownFile,
  parsedFile,
  previewContent,
  isCreating,
  newSkillName,
  isCreateSubmitting,
  createNameInputRef,
  startCreateSkill,
  cancelCreateSkill,
  handleCreateKeydown,
  setupFileWatcher,
} = useSkillsManager({
  selectedWorkspaceRoot: () => selectedWorkspaceRoot.value,
  initialQuerySkillName: (route.query.skill as string) || null,
  initialQueryFile: (route.query.file as string) || null,
})

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

watch(selectedWorkspaceRoot, () => {
  setupFileWatcher()
  loadSkills()
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
                class="h-6 min-w-[52px] px-2 inline-flex gap-2 items-center justify-center rounded text-[10px] font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
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
            <span class="text-xs font-medium font-sans text-muted-foreground uppercase tracking-wider">{{ fileTreeFileCount }} 个文件</span>
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
