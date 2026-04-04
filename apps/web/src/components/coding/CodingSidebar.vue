<script setup lang="ts">
defineProps<{
  activeSection: 'chat' | 'workspace' | 'planning'
  isCollapsed: boolean
  isResizing: boolean
  width: number
  viewingPlan: boolean
}>()

const emit = defineEmits<{
  'update:activeSection': [section: 'chat' | 'workspace' | 'planning']
  'update:isCollapsed': [collapsed: boolean]
  'resizeStart': [e: MouseEvent]
  'closePlan': []
}>()

function setSection(section: 'chat' | 'workspace' | 'planning') {
  emit('update:activeSection', section)
  emit('closePlan')
}
</script>

<template>
  <aside
    class="min-w-0 border-r border-border bg-sidebar-background flex flex-col relative"
    :class="[
      isResizing ? '' : 'transition-[width] duration-150',
      isCollapsed ? 'items-center' : '',
    ]"
    :style="{ width: isCollapsed ? '48px' : `${width}px` }"
  >
    <!-- Nav buttons -->
    <div :class="isCollapsed ? 'p-1.5 space-y-0.5' : 'p-2 space-y-0.5'">
      <!-- 研发对话 -->
      <button
        class="flex items-center rounded transition-colors"
        :class="[
          isCollapsed
            ? 'h-8 w-8 inline-flex items-center justify-center'
            : 'w-full text-left px-2.5 py-2 text-sm',
          activeSection === 'chat'
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground',
        ]"
        :title="isCollapsed ? '研发对话' : undefined"
        @click="setSection('chat')"
      >
        <div v-if="isCollapsed" class="i-carbon-chat-bot h-4 w-4" />
        <div v-else class="inline-flex items-center gap-2 whitespace-nowrap">
          <span class="i-streamline-pixel:coding-apps-websites-android h-4 w-4" />
          研发对话
        </div>
      </button>

      <!-- 变更审阅 -->
      <button
        class="flex items-center rounded transition-colors"
        :class="[
          isCollapsed
            ? 'h-8 w-8 inline-flex items-center justify-center'
            : 'w-full text-left px-2.5 py-2 text-sm',
          activeSection === 'workspace' && !viewingPlan
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground',
        ]"
        :title="isCollapsed ? '变更审阅' : undefined"
        @click="setSection('workspace')"
      >
        <div v-if="isCollapsed" class="i-lucide:git-pull-request-arrow h-4 w-4" />
        <div v-else class="inline-flex items-center gap-2 whitespace-nowrap">
          <span class="i-lucide:git-pull-request-arrow h-4 w-4" />
          变更审阅
        </div>
      </button>

      <!-- 任务编排 -->
      <button
        class="flex items-center rounded transition-colors"
        :class="[
          isCollapsed
            ? 'h-8 w-8 inline-flex items-center justify-center'
            : 'w-full text-left px-2.5 py-2 text-sm',
          activeSection === 'planning' && !viewingPlan
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground',
        ]"
        :title="isCollapsed ? '任务编排' : undefined"
        @click="setSection('planning')"
      >
        <div v-if="isCollapsed" class="i-bi:kanban-fill h-4 w-4" />
        <div v-else class="inline-flex items-center gap-2 whitespace-nowrap">
          <span class="i-bi:kanban-fill h-4 w-4" />
          任务编排
        </div>
      </button>
    </div>

    <!-- Collapse / Expand toggle (bottom) -->
    <div class="mt-auto p-2 flex" :class="isCollapsed ? 'justify-center' : 'justify-end'">
      <button
        class="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        :title="isCollapsed ? '展开侧边栏' : '收起侧边栏'"
        @click="emit('update:isCollapsed', !isCollapsed)"
      >
        <span
          class="h-3.5 w-3.5 transition-transform"
          :class="isCollapsed ? 'i-carbon-chevron-right' : 'i-carbon-chevron-left'"
        />
      </button>
    </div>

    <!-- Resize handle -->
    <div
      v-if="!isCollapsed"
      class="absolute top-0 -right-1.5 w-3 h-full cursor-col-resize z-10 group/resize"
      style="touch-action: none; user-select: none;"
      @mousedown="emit('resizeStart', $event)"
    >
      <div
        class="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 transition-colors"
        :class="isResizing ? 'bg-primary/50' : 'bg-transparent group-hover/resize:bg-primary/30'"
      />
    </div>
  </aside>
</template>
