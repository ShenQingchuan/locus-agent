<script setup lang="ts">
import type { TagWithCount } from '@locus-agent/shared'
import type { TreeNode } from '@locus-agent/ui'
import type { TagTreeData } from '@/utils/tagTree'
import { Tree } from '@locus-agent/ui'
import { buildTagTree } from '@/utils/tagTree'
import { computed } from 'vue'

const props = defineProps<{
  tags: TagWithCount[]
  selectedTagId: string | null
  activeTagPath: string | null
  notesCount: number
}>()

const emit = defineEmits<{
  selectTag: [tagId: string | null]
  tagTreeSelect: [node: TreeNode]
}>()

const tagTree = computed(() => buildTagTree(props.tags))

const defaultExpandedTagIds = computed(() =>
  tagTree.value
    .filter(n => n.children && n.children.length > 0)
    .map(n => n.id),
)

function handleSelectAll() {
  emit('selectTag', null)
}

function handleTagTreeSelect(node: TreeNode) {
  emit('tagTreeSelect', node)
}
</script>

<template>
  <div class="w-52 h-full flex flex-col">
    <!-- All memories button -->
    <div class="px-2 pt-2">
      <button
        class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
        :class="!selectedTagId && !activeTagPath
          ? 'bg-accent text-accent-foreground font-medium'
          : 'text-foreground hover:bg-accent/50'"
        @click="handleSelectAll"
      >
        <div class="i-carbon-notebook h-4 w-4 opacity-60" />
        <span>全部记忆</span>
        <span class="ml-auto text-xs text-muted-foreground">{{ notesCount }}</span>
      </button>
    </div>

    <!-- Tag tree -->
    <div class="flex-1 overflow-hidden px-2 pt-3 pb-2 flex flex-col">
      <div class="px-3 pb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        标签
      </div>
      <template v-if="tagTree.length > 0">
        <div class="flex-1 overflow-y-auto">
          <Tree
            :nodes="tagTree"
            :item-height="30"
            :indent="12"
            :default-expanded="defaultExpandedTagIds"
            container-class="h-full"
            @select="handleTagTreeSelect"
          >
            <template #default="{ node, hasChildren }">
              <div
                class="flex items-center gap-1.5 flex-1 min-w-0 py-0.5 px-1 rounded text-sm transition-colors"
                :class="activeTagPath === node.id || selectedTagId === (node.data as TagTreeData).tagId
                  ? 'text-accent-foreground font-medium'
                  : 'text-foreground'"
              >
                <div
                  class="h-3.5 w-3.5 opacity-50 flex-shrink-0"
                  :class="hasChildren ? 'i-carbon-folder' : 'i-carbon-tag'"
                />
                <span class="truncate">{{ node.label }}</span>
                <span class="ml-auto text-[11px] text-muted-foreground/60 flex-shrink-0">
                  {{ (node.data as TagTreeData).noteCount }}
                </span>
              </div>
            </template>
          </Tree>
        </div>
      </template>
      <div v-else class="px-3 py-4 text-xs text-muted-foreground/60 text-center">
        暂无标签
      </div>
    </div>
  </div>
</template>
