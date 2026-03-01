<script setup lang="ts">
import { ref } from 'vue'
import AppNavRail from '@/components/layout/AppNavRail.vue'

type CodingSection = 'planning' | 'workspace'

const activeSection = ref<CodingSection>('planning')
const currentProjectName = 'locus-agent'
</script>

<template>
  <div class="h-screen flex bg-background">
    <AppNavRail />

    <div class="flex-1 min-w-0 flex">
      <aside class="w-56 border-r border-border bg-sidebar-background flex flex-col">
        <div class="flex items-center px-3 py-3 border-b border-border min-h-12">
          <p class="text-xs text-muted-foreground truncate">
            当前项目：<span class="font-mono text-foreground">{{ currentProjectName }}</span>
          </p>
        </div>

        <div class="p-2 space-y-0.5">
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
              <aside class="min-h-0 border-b xl:border-b-0 xl:border-r border-border px-3 py-2.5">
                <span class="text-xs text-muted-foreground">项目文件树占位示意</span>
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
</template>
