<script setup lang="ts">
import type { ActiveDelegate, TodoTask } from '@/composables/assistant-runtime/types'
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  todoTasks: TodoTask[]
  activeDelegates: ActiveDelegate[]
}>()

const emit = defineEmits<{
  jumpToDelegate: [toolCallId: string]
}>()

// --- Tab state ---

type TabId = 'todo' | 'agents'

const activeTab = ref<TabId>('todo')

const hasTodo = computed(() => props.todoTasks.length > 0)
const hasAgents = computed(() => props.activeDelegates.length > 0)

// Auto-switch to agents tab when delegates appear; fall back to todo when they clear.
watch(hasAgents, (val) => {
  if (val) {
    activeTab.value = 'agents'
  }
  else if (activeTab.value === 'agents') {
    activeTab.value = hasTodo.value ? 'todo' : 'todo'
  }
}, { immediate: true })

// Ensure active tab always points to a visible tab.
watch([hasTodo, hasAgents], () => {
  if (activeTab.value === 'todo' && !hasTodo.value && hasAgents.value)
    activeTab.value = 'agents'
  if (activeTab.value === 'agents' && !hasAgents.value && hasTodo.value)
    activeTab.value = 'todo'
})

// --- Agents tab helpers ---

const runningCount = computed(() => props.activeDelegates.filter(d => d.status === 'pending').length)
const doneCount = computed(() => props.activeDelegates.filter(d => d.status === 'completed').length)
const failedCount = computed(() => props.activeDelegates.filter(d => d.status === 'error').length)

function delegateStatusIcon(status: ActiveDelegate['status']): string {
  switch (status) {
    case 'pending': return 'i-svg-spinners:90-ring-with-bg'
    case 'completed': return 'i-lets-icons:done-ring-round'
    case 'error': return 'i-carbon-close-filled'
  }
}

function delegateStatusClass(status: ActiveDelegate['status']): string {
  switch (status) {
    case 'pending': return 'text-amber-500'
    case 'completed': return 'text-green-500 dark:text-green-400'
    case 'error': return 'text-destructive'
  }
}

function delegateStatusLabel(status: ActiveDelegate['status']): string {
  switch (status) {
    case 'pending': return '执行中'
    case 'completed': return '完成'
    case 'error': return '失败'
  }
}

// --- Todo tab helpers ---

const completedCount = computed(() => props.todoTasks.filter(t => t.status === 'completed').length)
const inProgressCount = computed(() => props.todoTasks.filter(t => t.status === 'in_progress').length)

// --- Collapse state ---

const isCollapsed = ref(false)

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}
</script>

<template>
  <div class="mb-2 overflow-hidden rounded-md border border-border bg-background">
    <!-- Tab bar -->
    <div class="flex items-center justify-between border-b border-border px-2 py-1" :class="isCollapsed ? 'border-b-0' : ''">
      <div class="flex items-center gap-0.5">
        <!-- Todo tab -->
        <button
          v-if="hasTodo"
          class="flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors duration-100"
          :class="activeTab === 'todo'
            ? 'bg-muted text-foreground font-medium'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'"
          @click="activeTab = 'todo'"
        >
          <div class="i-octicon:tasklist-16 h-3.5 w-3.5" />
          <span>待办</span>
          <span class="text-[10px] text-muted-foreground">{{ todoTasks.length }}</span>
        </button>

        <!-- Agents tab -->
        <button
          v-if="hasAgents"
          class="flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors duration-100"
          :class="activeTab === 'agents'
            ? 'bg-muted text-foreground font-medium'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'"
          @click="activeTab = 'agents'"
        >
          <div
            class="h-3.5 w-3.5"
            :class="runningCount > 0 ? 'i-svg-spinners:bars-fade text-amber-500' : 'i-carbon-flow'"
          />
          <span>代理</span>
          <span class="text-[10px] text-muted-foreground">{{ activeDelegates.length }}</span>
        </button>
      </div>

      <!-- Right: aggregate counts + collapse toggle -->
      <div class="flex items-center gap-2 pr-0.5 text-[10px] text-muted-foreground">
        <template v-if="!isCollapsed">
          <template v-if="activeTab === 'todo'">
            <span>已完成 {{ completedCount }}</span>
            <span>进行中 {{ inProgressCount }}</span>
          </template>
          <template v-else-if="activeTab === 'agents'">
            <span v-if="doneCount">完成 {{ doneCount }}</span>
            <span v-if="runningCount" class="text-amber-600 dark:text-amber-400">运行中 {{ runningCount }}</span>
            <span v-if="failedCount" class="text-destructive">失败 {{ failedCount }}</span>
          </template>
        </template>
        <button
          class="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
          :title="isCollapsed ? '展开' : '折叠'"
          @click="toggleCollapse"
        >
          <div
            class="h-3.5 w-3.5 transition-transform duration-200"
            :class="isCollapsed ? 'i-carbon-chevron-down rotate-180' : 'i-carbon-chevron-down rotate-0'"
          />
        </button>
      </div>
    </div>

    <!-- Collapsible content area: max-h keeps it from squeezing message flow -->
    <div v-show="!isCollapsed" class="max-h-40 overflow-y-auto">
      <!-- Todo content -->
      <div
        v-if="activeTab === 'todo'"
        class="px-1.5 py-1.5"
      >
        <div
          v-for="task in todoTasks"
          :key="task.id"
          class="mb-0.5 flex items-center gap-1.5 rounded px-1.5 py-1 last:mb-0 hover:bg-muted/50"
        >
          <div
            class="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground"
            :class="task.status === 'completed' ? 'i-lets-icons:done-ring-round' : 'i-icon-park-outline:hourglass-full'"
          />
          <span
            class="flex-1 text-[13px] leading-5"
            :class="task.status === 'completed' ? 'text-muted-foreground line-through' : 'text-foreground'"
          >
            {{ task.content }}
          </span>
          <span class="text-[11px] text-muted-foreground">
            {{ task.status === 'completed' ? '已完成' : '进行中' }}
          </span>
        </div>
      </div>

      <!-- Agents content -->
      <div
        v-else-if="activeTab === 'agents'"
        class="px-1.5 py-1.5"
      >
        <div
          v-for="delegate in activeDelegates"
          :key="delegate.toolCallId"
          class="group mb-0.5 flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 last:mb-0 hover:bg-muted/50"
          @click="emit('jumpToDelegate', delegate.toolCallId)"
        >
          <!-- Status icon -->
          <div
            class="h-3.5 w-3.5 flex-shrink-0"
            :class="[delegateStatusIcon(delegate.status), delegateStatusClass(delegate.status)]"
          />

          <!-- Agent name -->
          <span class="min-w-0 shrink-0 text-[13px] font-medium text-foreground">
            {{ delegate.agentName }}
          </span>

          <!-- Task description (truncated) -->
          <span class="flex-1 truncate text-[11px] text-muted-foreground">
            {{ delegate.task }}
          </span>

          <!-- Status label + jump hint -->
          <div class="flex flex-shrink-0 items-center gap-1.5 text-[11px]">
            <span :class="delegateStatusClass(delegate.status)">
              {{ delegateStatusLabel(delegate.status) }}
            </span>
            <div
              class="i-carbon-arrow-up-right h-3 w-3 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
