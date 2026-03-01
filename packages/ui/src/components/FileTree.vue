<script setup lang="ts">
import type { TreeNode } from './Tree.vue'
import Tree from './Tree.vue'

export interface FileTreeNode extends TreeNode {
  /** Stable path-like ID, e.g. src/components/App.vue */
  id: string
  /** File or directory name */
  label: string
  /** Node kind */
  type: 'file' | 'directory'
  /** Optional extra metadata */
  data?: unknown
  /** Child nodes for directories */
  children?: FileTreeNode[]
}

const props = withDefaults(defineProps<{
  nodes: FileTreeNode[]
  selectedId?: string | null
  itemHeight?: number
  indent?: number
  overscan?: number
  defaultExpanded?: string[]
  containerClass?: string
}>(), {
  selectedId: null,
  itemHeight: 28,
  indent: 14,
  overscan: 8,
  defaultExpanded: () => [],
  containerClass: '',
})

const emit = defineEmits<{
  select: [node: FileTreeNode]
  toggle: [node: FileTreeNode, expanded: boolean]
}>()

function onSelect(node: TreeNode) {
  emit('select', node as FileTreeNode)
}

function onToggle(node: TreeNode, expanded: boolean) {
  emit('toggle', node as FileTreeNode, expanded)
}
</script>

<template>
  <Tree
    :nodes="nodes"
    :item-height="itemHeight"
    :indent="indent"
    :overscan="overscan"
    :default-expanded="defaultExpanded"
    :container-class="containerClass"
    @select="onSelect"
    @toggle="onToggle"
  >
    <template #default="{ node }">
      <div
        class="flex items-center gap-1.5 min-w-0 py-0.5 px-1 rounded text-sm transition-colors"
        :class="props.selectedId === node.id
          ? 'bg-accent text-accent-foreground font-medium'
          : 'text-foreground/90 hover:text-foreground'"
      >
        <span class="truncate font-mono">{{ node.label }}</span>
      </div>
    </template>
  </Tree>
</template>
