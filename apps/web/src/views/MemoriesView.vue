<script setup lang="ts">
import AddTagsModal from '@/components/knowledge/AddTagsModal.vue'
import MemoriesComposer from '@/components/knowledge/MemoriesComposer.vue'
import MemoriesTagSidebar from '@/components/knowledge/MemoriesTagSidebar.vue'
import MemoryNoteCard from '@/components/knowledge/MemoryNoteCard.vue'
import NoteEditor from '@/components/knowledge/NoteEditor.vue'
import AppNavRail from '@/components/layout/AppNavRail.vue'
import { useMemoriesView } from '@/composables/useMemoriesView'

const {
  store,
  workspaceStore,
  sidebarCollapsed,
  toggleSidebar,
  memoryScope,
  allNotesList,
  tagsList,
  isLoading,
  notes,
  groupedNotes,
  formatTimelineDate,
  formatTimelineYear,
  activeTagPath,
  handleTagTreeSelect,
  selectTag,
  handleDeleteTags,
  composerRef,
  handlePublish,
  isPublishing,
  highlightedNoteId,
  highlightedCardRef,
  editingNoteId,
  handleEditingEditorChange,
  lastSavedText,
  startEditing,
  cancelEditing,
  handleDeleteNote,
  handleToGlobal,
  showAddTagsModal,
  addTagsNoteTags,
  openTagsModal,
  handleSaveTags,
} = useMemoriesView()
</script>

<template>
  <div class="h-screen flex bg-background">
    <AppNavRail />

    <div class="flex-1 flex min-w-0">
      <!-- Left sidebar: tags -->
      <aside
        class="flex-shrink-0 border-r border-border bg-sidebar-background flex flex-col h-full transition-[width] duration-200 overflow-hidden"
        :style="{ width: sidebarCollapsed ? '0px' : '208px' }"
        :class="sidebarCollapsed ? 'border-r-0' : ''"
      >
        <MemoriesTagSidebar
          :tags="tagsList"
          :notes="allNotesList ?? []"
          :selected-tag-id="store.selectedTagId"
          :active-tag-path="activeTagPath"
          :notes-count="allNotesList?.length ?? 0"
          @select-tag="selectTag"
          @tag-tree-select="handleTagTreeSelect"
          @delete-tags="handleDeleteTags"
        />
      </aside>

      <!-- Center: composer + card stream -->
      <div class="flex-1 flex flex-col min-w-0 h-full">
        <div class="flex-shrink-0 h-10 flex items-center px-3 border-b border-border/50 font-mono gap-3">
          <button
            class="flex-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors flex-shrink-0"
            :title="sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
            @click="toggleSidebar"
          >
            <div
              class="h-4 w-4 transition-transform duration-200"
              :class="sidebarCollapsed ? 'i-carbon-side-panel-open' : 'i-carbon-side-panel-close'"
            />
          </button>

          <div class="flex items-center gap-0.5 font-sans">
            <button
              class="px-2 py-1 rounded text-xs transition-colors"
              :class="memoryScope === 'all' ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground hover:text-foreground'"
              @click="memoryScope = 'all'"
            >
              全部
            </button>
            <button
              class="px-2 py-1 rounded text-xs transition-colors"
              :class="memoryScope === 'global' ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground hover:text-foreground'"
              @click="memoryScope = 'global'"
            >
              全局
            </button>
            <button
              class="px-2 py-1 rounded text-xs transition-colors"
              :class="[
                memoryScope === 'workspace' ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground hover:text-foreground',
                !workspaceStore.isWorkspaceActive ? 'opacity-50 cursor-not-allowed' : '',
              ]"
              :disabled="!workspaceStore.isWorkspaceActive"
              :title="workspaceStore.isWorkspaceActive ? workspaceStore.currentWorkspaceName : '请先选择工作空间'"
              @click="workspaceStore.isWorkspaceActive && (memoryScope = 'workspace')"
            >
              工作空间
            </button>
          </div>

          <span v-if="store.selectedTagId || activeTagPath" class="text-xs text-muted-foreground">
            #{{ store.selectedTagId ? tagsList.find(t => t.id === store.selectedTagId)?.name : activeTagPath }}
          </span>
        </div>

        <div class="flex-1 overflow-y-auto">
          <div class="max-w-4xl mx-auto px-4 py-6">
            <!-- Composer -->
            <MemoriesComposer
              ref="composerRef"
              @publish="handlePublish"
            >
              <template #actions="{ data, requestPublish }">
                <button
                  class="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
                  :class="data?.content?.trim()
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'bg-muted text-muted-foreground cursor-not-allowed'"
                  :disabled="!data?.content?.trim() || isPublishing"
                  @click="requestPublish()"
                >
                  <div v-if="isPublishing" class="i-carbon-circle-dash h-3.5 w-3.5 animate-spin" />
                  <div v-else class="i-carbon-add" />
                  新建
                </button>
              </template>
            </MemoriesComposer>

            <!-- Card stream - Timeline view -->
            <div v-if="isLoading" class="py-12 text-center text-sm text-muted-foreground">
              <div class="i-carbon-circle-dash h-5 w-5 animate-spin mx-auto mb-2 opacity-50" />
              加载中...
            </div>

            <div v-else-if="notes.length === 0" class="py-16 text-center">
              <div class="i-carbon-idea mx-auto h-10 w-10 text-muted-foreground/30 mb-4" />
              <p class="text-sm text-muted-foreground/70">
                {{ store.searchQuery ? '没有找到匹配的记忆' : '暂无数据' }}
              </p>
            </div>

            <div v-else class="space-y-6">
              <div
                v-for="group in groupedNotes"
                :key="group.dateKey"
                class="timeline-group"
              >
                <!-- Timeline date header -->
                <div class="flex items-center gap-3 mb-3">
                  <div class="flex items-center gap-2">
                    <div class="w-2 h-2 rounded-full bg-primary/60" />
                    <span class="text-sm font-medium text-foreground">
                      {{ formatTimelineDate(group.date) }}
                    </span>
                    <span v-if="formatTimelineYear(group.date)" class="text-xs text-muted-foreground">
                      {{ formatTimelineYear(group.date) }}
                    </span>
                  </div>
                  <div class="flex-1 h-px bg-border/50" />
                  <span class="text-xs text-muted-foreground/60">
                    {{ group.notes.length }} 条记忆
                  </span>
                </div>

                <!-- Cards for this day -->
                <div class="columns-2 gap-3 pl-4 border-l-2 border-border/30 ml-0.75">
                  <div
                    v-for="note in group.notes"
                    :key="note.id"
                    :data-note-id="note.id"
                    class="break-inside-avoid mb-3"
                  >
                    <!-- Inline editing area -->
                    <div
                      v-if="editingNoteId === note.id"
                      class="rounded-lg border border-border/80 bg-card shadow-sm overflow-hidden col-span-full w-full"
                      style="column-span: all; -webkit-column-span: all;"
                    >
                      <div class="editing-editor">
                        <NoteEditor
                          :key="`edit-${note.id}`"
                          :editor-state="note.editorState ?? null"
                          :content="note.content"
                          @change="handleEditingEditorChange"
                        />
                      </div>
                      <div class="flex items-center justify-between px-3 py-1.5 border-t border-border/50 bg-muted/20">
                        <span class="text-xs text-muted-foreground/60">
                          {{ store.isSaving ? '保存中...' : lastSavedText || '编辑中' }}
                        </span>
                        <div class="flex items-center gap-1">
                          <button
                            class="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                            title="管理标签"
                            @click="openTagsModal(note.id)"
                          >
                            <div class="i-carbon-tag h-3.5 w-3.5" />
                          </button>
                          <button
                            class="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded"
                            @click="cancelEditing"
                          >
                            完成
                          </button>
                        </div>
                      </div>
                    </div>

                    <!-- Normal card -->
                    <div
                      v-else
                      :ref="(el) => { if (highlightedNoteId === note.id) highlightedCardRef = el as HTMLElement }"
                    >
                      <MemoryNoteCard
                        :note="note"
                        :is-highlighted="highlightedNoteId === note.id"
                        @click="(n) => { highlightedNoteId = null; startEditing(n) }"
                        @open-tags="openTagsModal"
                        @delete="handleDeleteNote"
                        @to-global="handleToGlobal"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <AddTagsModal
      :open="showAddTagsModal"
      :note-tags="addTagsNoteTags"
      :all-tags="tagsList"
      @save="handleSaveTags"
      @close="showAddTagsModal = false"
    />
  </div>
</template>

<style scoped>
.composer-editor :deep(.note-editor-content) {
  min-height: 120px;
  max-height: 320px;
  overflow-y: auto;
  padding: 1rem 1.25rem 0.75rem;
  font-size: 0.875rem;
}

.composer-editor :deep(.flex-shrink-0.border-b) {
  border-color: transparent;
  background: transparent;
  padding-left: 0.75rem;
}

.editing-editor :deep(.note-editor-content) {
  min-height: 80px;
  max-height: 360px;
  overflow-y: auto;
  padding: 0.75rem 1rem 0.5rem;
  font-size: 0.8125rem;
}

.editing-editor :deep(.flex-shrink-0.border-b) {
  border-color: transparent;
  background: transparent;
  padding-left: 0.5rem;
}

.composer-editor :deep(.note-editor-content h1),
.editing-editor :deep(.note-editor-content h1) {
  font-size: 1.25rem;
}

.composer-editor :deep(.note-editor-content h2),
.editing-editor :deep(.note-editor-content h2) {
  font-size: 1.1rem;
}

.composer-editor :deep(.note-editor-content h3),
.editing-editor :deep(.note-editor-content h3) {
  font-size: 1rem;
}

.composer-editor :deep(.note-editor-content h4),
.editing-editor :deep(.note-editor-content h4) {
  font-size: 0.9375rem;
}
</style>
