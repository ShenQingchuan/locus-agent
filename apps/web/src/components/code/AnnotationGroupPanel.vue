<script setup lang="ts">
import type { ReviewAnnotationGroup } from '@/composables/useReviewAnnotations'
import { useAnnotationGroups } from '@/composables/useAnnotationGroups'

const props = defineProps<{
  groups: ReviewAnnotationGroup[]
  activeGroupId: string | null
}>()

const emit = defineEmits<{
  setActive: [groupId: string | null]
  deleteGroup: [groupId: string]
  removeAnnotation: [groupId: string, annotationId: string]
  submitGroup: [groupId: string]
  submitAll: []
  selectFile: [filePath: string]
  clearAll: []
}>()

const {
  hasAnnotations,
  groupAnnotationsByFile,
  formatRange,
  basename,
} = useAnnotationGroups(() => props.groups)
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2.5 border-b border-border flex-shrink-0">
      <div class="flex items-center gap-1.5 text-xs font-medium">
        <span class="i-carbon-review h-3.5 w-3.5 text-primary" />
        <span>审阅批注</span>
        <span
          v-if="hasAnnotations"
          class="ml-1 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs leading-none tabular-nums"
        >
          {{ groups.reduce((s, g) => s + g.annotations.length, 0) }}
        </span>
      </div>
      <div class="flex items-center gap-1">
        <button
          v-if="hasAnnotations"
          class="h-6 px-2 text-xs rounded text-primary hover:bg-primary/10 transition-colors"
          title="提交所有批注给 AI"
          @click="emit('submitAll')"
        >
          提交批注
        </button>
        <button
          v-if="hasAnnotations"
          class="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          title="清除所有批注"
          @click="emit('clearAll')"
        >
          <span class="i-carbon-trash-can h-3.5 w-3.5" />
        </button>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 min-h-0 overflow-y-auto">
      <!-- Empty state -->
      <div v-if="groups.length === 0" class="h-full flex items-center justify-center px-4">
        <div class="text-center">
          <span class="i-carbon-annotation-visibility h-6 w-6 text-muted-foreground/30 mx-auto block mb-2" />
          <p class="text-xs text-muted-foreground/70">
            暂无批注
          </p>
          <p class="text-xs text-muted-foreground/50 mt-1">
            在 Diff 视图中点击行号旁 + 按钮添加
          </p>
        </div>
      </div>

      <!-- Group list -->
      <div v-else class="py-1">
        <div
          v-for="(group, index) in groups"
          :key="group.id"
          class="border-b border-border/50 last:border-b-0"
        >
          <!-- Group header -->
          <div
            class="flex items-center gap-1.5 px-3 py-2 cursor-pointer transition-colors"
            :class="[
              activeGroupId === group.id
                ? 'bg-primary/5'
                : 'hover:bg-muted/50',
            ]"
            @click="emit('setActive', activeGroupId === group.id ? null : group.id)"
          >
            <span
              class="h-3.5 w-3.5 transition-transform flex-shrink-0 text-muted-foreground"
              :class="[
                activeGroupId === group.id ? 'i-carbon-chevron-down' : 'i-carbon-chevron-right',
              ]"
            />

            <span class="flex-1 min-w-0 text-xs font-medium tabular-nums">
              #{{ index + 1 }}
            </span>
            <span class="text-xs text-muted-foreground/60 flex-shrink-0 tabular-nums">
              {{ group.annotations.length }} 条
            </span>

            <!-- Group actions -->
            <div class="flex items-center gap-0.5 flex-shrink-0" @click.stop>
              <button
                v-if="group.annotations.length > 0"
                class="h-5 w-5 inline-flex items-center justify-center rounded text-muted-foreground/60 hover:text-primary hover:bg-primary/10 transition-colors"
                title="提交该组给 AI"
                @click="emit('submitGroup', group.id)"
              >
                <span class="i-carbon-send h-3 w-3" />
              </button>
              <button
                class="h-5 w-5 inline-flex items-center justify-center rounded text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="删除该组"
                @click="emit('deleteGroup', group.id)"
              >
                <span class="i-carbon-close h-3 w-3" />
              </button>
            </div>
          </div>

          <!-- Expanded annotation list -->
          <div v-if="activeGroupId === group.id && group.annotations.length > 0" class="pb-1.5">
            <template
              v-for="[filePath, fileAnnotations] in groupAnnotationsByFile(group.annotations)"
              :key="filePath"
            >
              <div class="px-3 pt-2 pb-1">
                <button
                  class="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                  :title="filePath"
                  @click="emit('selectFile', filePath)"
                >
                  <span class="i-carbon-document h-3.5 w-3.5 flex-shrink-0" />
                  <span class="truncate">{{ basename(filePath) }}</span>
                </button>
              </div>
              <div
                v-for="ann in fileAnnotations"
                :key="ann.id"
                class="group mx-3 mb-1.5 px-2.5 py-2 rounded-md bg-muted/50 border border-border/50 hover:border-border transition-colors"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="flex-1 min-w-0">
                    <span class="text-xs text-muted-foreground/70 font-mono">
                      {{ formatRange(ann) }}
                    </span>
                    <p class="text-xs text-foreground/90 mt-0.5 leading-relaxed break-words">
                      {{ ann.comment }}
                    </p>
                  </div>
                  <button
                    class="h-5 w-5 flex-shrink-0 inline-flex items-center justify-center rounded text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"
                    title="删除批注"
                    @click="emit('removeAnnotation', group.id, ann.id)"
                  >
                    <span class="i-carbon-close h-3 w-3" />
                  </button>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
