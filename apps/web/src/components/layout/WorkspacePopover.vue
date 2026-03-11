<script setup lang="ts">
import { DirectoryBrowserModal, useToast } from '@univedge/locus-ui'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useWorkspacePicker } from '@/composables/useWorkspacePicker'
import { useWorkspaceStore } from '@/stores/workspace'

const workspaceStore = useWorkspaceStore()
const toast = useToast()

const isPopoverOpen = ref(false)
const popoverRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLElement | null>(null)

const {
  isWorkspacePickerOpen,
  isWorkspacePickerLoading,
  isWorkspacePathLoading,
  currentBrowsePath,
  browseEntries,
  isBrowseTruncated,
  loadBrowseEntries,
  openWorkspacePicker,
  goToParentBrowsePath,
  closeWorkspacePicker,
} = useWorkspacePicker({
  initialPath: workspaceStore.currentWorkspacePath,
})

function openPopover() {
  isPopoverOpen.value = true
}

function closePopover() {
  isPopoverOpen.value = false
}

async function handleSwitchWorkspace() {
  closePopover()
  await openWorkspacePicker()
}

async function handleConfirmWorkspace() {
  try {
    await workspaceStore.openWorkspace(currentBrowsePath.value)
    closeWorkspacePicker()
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : '打开工作空间失败')
  }
}

function handleCloseWorkspace() {
  workspaceStore.closeWorkspace()
  closePopover()
}

function onClickOutside(e: MouseEvent) {
  if (!isPopoverOpen.value)
    return
  const target = e.target as Node
  if (triggerRef.value?.contains(target) || popoverRef.value?.contains(target))
    return
  closePopover()
}

onMounted(() => {
  document.addEventListener('mousedown', onClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onClickOutside)
})
</script>

<template>
  <div class="relative">
    <button
      ref="triggerRef"
      class="flex-center w-9 h-9 rounded-lg transition-colors duration-150"
      :class="isPopoverOpen
        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
        : workspaceStore.isWorkspaceActive
          ? 'bg-green-300/10 text-green-600 dark:text-green-600'
          : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'"
      title="工作空间"
      @click="openPopover"
    >
      <div
        class="h-4.5 w-4.5"
        :class="[
          workspaceStore.isWorkspaceActive ? 'i-mdi:folder-check' : 'i-mdi:folder-cog',
          workspaceStore.isWorkspaceActive ? 'text-green-600 dark:text-green-400' : '',
        ]"
      />
    </button>

    <Teleport to="body">
      <Transition name="ws-popover">
        <div
          v-if="isPopoverOpen"
          ref="popoverRef"
          class="ws-popover-panel fixed z-50 w-80 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg"
        >
          <div v-if="workspaceStore.isWorkspaceActive" class="p-3">
            <div class="flex items-center justify-between mb-1.5">
              <div class="text-xs font-medium text-muted-foreground">
                当前工作空间
              </div>
              <button
                class="flex-center h-5 w-5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                @click="closePopover"
              >
                <div class="i-carbon-close h-3.5 w-3.5" />
              </button>
            </div>
            <div
              class="font-mono text-xs text-foreground break-all leading-relaxed mb-3"
              :title="workspaceStore.currentWorkspacePath"
            >
              {{ workspaceStore.currentWorkspacePath }}
            </div>
            <div class="flex gap-2">
              <button
                class="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium border border-border bg-background text-foreground hover:bg-accent transition-colors"
                @click="handleSwitchWorkspace"
              >
                <div class="i-carbon-switch-layer-2 h-3.5 w-3.5" />
                切换
              </button>
              <button
                class="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium border border-border bg-background text-destructive hover:bg-destructive/10 transition-colors"
                @click="handleCloseWorkspace"
              >
                <div class="i-carbon-close h-3.5 w-3.5" />
                关闭
              </button>
            </div>
          </div>

          <div v-else class="p-3">
            <div class="flex items-center justify-between mb-2">
              <div class="text-xs text-muted-foreground">
                未选择工作空间
              </div>
              <button
                class="flex-center h-5 w-5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                @click="closePopover"
              >
                <div class="i-carbon-close h-3.5 w-3.5" />
              </button>
            </div>
            <button
              class="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded px-2 py-1 transition-colors"
              @click="handleSwitchWorkspace"
            >
              <div class="i-carbon-folder-add h-3.5 w-3.5" />
              选择工作空间
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <DirectoryBrowserModal
      v-model:open="isWorkspacePickerOpen"
      title="选择工作空间"
      :current-path="currentBrowsePath"
      :entries="browseEntries"
      :loading="isWorkspacePickerLoading || isWorkspacePathLoading"
      :truncated="isBrowseTruncated"
      @close="closeWorkspacePicker"
      @refresh="loadBrowseEntries(currentBrowsePath)"
      @go-parent="goToParentBrowsePath"
      @navigate="loadBrowseEntries"
      @submit-path="loadBrowseEntries"
      @confirm="handleConfirmWorkspace"
    />
  </div>
</template>

<style scoped>
.ws-popover-panel {
  top: 12px;
  left: 50%;
  transform: translateX(-50%) translateY(0);
}

.ws-popover-enter-active {
  transition: opacity 280ms cubic-bezier(0.16, 1, 0.3, 1), transform 280ms cubic-bezier(0.16, 1, 0.3, 1);
}

.ws-popover-leave-active {
  transition: opacity 180ms ease-in, transform 180ms ease-in;
}

.ws-popover-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(-100%);
}

.ws-popover-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-16px);
}
</style>
