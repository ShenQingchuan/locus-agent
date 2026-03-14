<script setup lang="ts">
import type { NoteWithTags, TagWithCount } from '@univedge/locus-agent-sdk'
import type { ContextMenuItem, TreeNode } from '@univedge/locus-ui'
import type { TagTreeData } from '@/utils/tagTree'
import { ContextMenu, Tree } from '@univedge/locus-ui'
import { computed, ref } from 'vue'
import { buildTagTree } from '@/utils/tagTree'

const props = defineProps<{
  tags: TagWithCount[]
  notes: NoteWithTags[]
  selectedTagId: string | null
  activeTagPath: string | null
  notesCount: number
}>()

const emit = defineEmits<{
  selectTag: [tagId: string | null]
  tagTreeSelect: [node: TreeNode]
  deleteTags: [tagIds: string[], groupName: string]
}>()

const tagTree = computed(() => buildTagTree(props.tags, props.notes))

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

// Context menu for tag nodes
const contextMenuRef = ref<InstanceType<typeof ContextMenu> | null>(null)
const contextMenuNode = ref<TreeNode | null>(null)

const tagContextMenuItems = computed<ContextMenuItem[]>(() => {
  if (!contextMenuNode.value)
    return []
  const data = contextMenuNode.value.data as TagTreeData
  const hasChildren = !!(contextMenuNode.value.children?.length)
  if (data.tagId && !hasChildren) {
    return [{ key: 'delete', label: '删除标签', icon: 'i-carbon-trash-can', danger: true }]
  }
  return [{ key: 'delete-group', label: '删除该分组下所有标签', icon: 'i-carbon-trash-can', danger: true }]
})

function collectTagIds(node: TreeNode): string[] {
  const ids: string[] = []
  const data = node.data as TagTreeData
  if (data.tagId)
    ids.push(data.tagId)
  if (node.children) {
    for (const child of node.children) {
      ids.push(...collectTagIds(child))
    }
  }
  return ids
}

function handleTagContextMenu(e: MouseEvent, node: TreeNode) {
  e.preventDefault()
  e.stopPropagation()
  contextMenuNode.value = node
  contextMenuRef.value?.openAt(e.clientX, e.clientY)
}

function handleContextMenuSelect(key: string) {
  if (!contextMenuNode.value)
    return
  const data = contextMenuNode.value.data as TagTreeData
  const name = contextMenuNode.value.id

  if (key === 'delete' && data.tagId) {
    emit('deleteTags', [data.tagId], name)
  }
  else if (key === 'delete-group') {
    const tagIds = collectTagIds(contextMenuNode.value)
    if (tagIds.length > 0) {
      emit('deleteTags', tagIds, name)
    }
  }
  contextMenuNode.value = null
}
</script>

<template>
  <div class="w-52 h-full flex flex-col">
    <!-- All memories button -->
    <div class="px-2 pt-2">
      <button
        class="w-full flex items-center gap-2 px-1.5 py-2 rounded-lg text-sm transition-colors"
        :class="!selectedTagId && !activeTagPath
          ? 'bg-accent text-accent-foreground font-medium'
          : 'text-foreground hover:bg-accent/50'"
        @click="handleSelectAll"
      >
        <div class="i-carbon-notebook h-4 w-4 opacity-60" />
        <span>全部记忆</span>
        <span class="ml-auto text-xs text-muted-foreground font-mono">{{ notesCount }}</span>
      </button>
    </div>

    <!-- Tag tree -->
    <div class="flex-1 overflow-hidden px-2 pt-3 pb-2 flex flex-col">
      <div class="pl-2 pb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
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
                @contextmenu="handleTagContextMenu($event, node)"
              >
                <div
                  class="h-3.5 w-3.5 opacity-50 flex-shrink-0"
                  :class="hasChildren ? 'i-carbon-folder' : 'i-carbon-tag'"
                />
                <span class="truncate font-mono">{{ node.label }}</span>
                <span class="ml-auto text-[11px] text-muted-foreground/60 flex-shrink-0 font-mono">
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

    <ContextMenu
      ref="contextMenuRef"
      :items="tagContextMenuItems"
      @select="handleContextMenuSelect"
    />
  </div>
</template>
