<script setup lang="ts">
import { computed, ref } from 'vue'
import VirtualList from './VirtualList.vue'

export interface TreeNode {
  /** Unique identifier */
  id: string
  /** Display label */
  label: string
  /** Child nodes */
  children?: TreeNode[]
  /** Arbitrary extra data consumers can attach */
  data?: unknown
}

export interface FlatTreeNode {
  /** The original tree node */
  node: TreeNode
  /** Nesting depth (0 = root) */
  depth: number
  /** Whether this node has children */
  hasChildren: boolean
  /** Whether this node is expanded */
  expanded: boolean
}

const props = withDefaults(defineProps<{
  /** Tree data */
  nodes: TreeNode[]
  /** Item height in px */
  itemHeight?: number
  /** Indent per level in px */
  indent?: number
  /** Overscan count for virtual scrolling */
  overscan?: number
  /** Initially expanded node IDs */
  defaultExpanded?: string[]
  /** Additional class for the scroll container */
  containerClass?: string
}>(), {
  itemHeight: 32,
  indent: 16,
  overscan: 5,
  defaultExpanded: () => [],
  containerClass: '',
})

const emit = defineEmits<{
  /** Emitted when a node is clicked */
  select: [node: TreeNode]
  /** Emitted when a node's expand state changes */
  toggle: [node: TreeNode, expanded: boolean]
}>()

defineSlots<{
  /** Custom render for each tree node */
  default: (props: { node: TreeNode, depth: number, hasChildren: boolean, expanded: boolean }) => any
}>()

// Expanded state
const expandedIds = ref<Set<string>>(new Set(props.defaultExpanded))

function isExpanded(id: string): boolean {
  return expandedIds.value.has(id)
}

function toggleExpand(node: TreeNode) {
  const newSet = new Set(expandedIds.value)
  const nowExpanded = !newSet.has(node.id)
  if (nowExpanded) {
    newSet.add(node.id)
  }
  else {
    newSet.delete(node.id)
  }
  expandedIds.value = newSet
  emit('toggle', node, nowExpanded)
}

function handleNodeClick(node: TreeNode) {
  emit('select', node)
}

// Flatten tree to visible nodes
const flatNodes = computed<FlatTreeNode[]>(() => {
  const result: FlatTreeNode[] = []

  function walk(nodes: TreeNode[], depth: number) {
    for (const node of nodes) {
      const hasChildren = !!node.children?.length
      const expanded = hasChildren && isExpanded(node.id)
      result.push({ node, depth, hasChildren, expanded })
      if (expanded) {
        walk(node.children!, depth + 1)
      }
    }
  }

  walk(props.nodes, 0)
  return result
})

function getNode(index: number): FlatTreeNode {
  return flatNodes.value[index]!
}

// Expose for programmatic control
defineExpose({
  /** Expand a node by ID */
  expand(id: string) {
    const newSet = new Set(expandedIds.value)
    newSet.add(id)
    expandedIds.value = newSet
  },
  /** Collapse a node by ID */
  collapse(id: string) {
    const newSet = new Set(expandedIds.value)
    newSet.delete(id)
    expandedIds.value = newSet
  },
  /** Expand all nodes */
  expandAll() {
    const allIds = new Set<string>()
    function walk(nodes: TreeNode[]) {
      for (const n of nodes) {
        if (n.children?.length) {
          allIds.add(n.id)
          walk(n.children)
        }
      }
    }
    walk(props.nodes)
    expandedIds.value = allIds
  },
  /** Collapse all nodes */
  collapseAll() {
    expandedIds.value = new Set()
  },
})
</script>

<template>
  <VirtualList
    :count="flatNodes.length"
    :estimate-size="itemHeight"
    :overscan="overscan"
    :container-class="containerClass"
  >
    <template #default="{ index }">
      <div
        class="tree-node flex items-center cursor-pointer hover:bg-accent/50 select-none"
        :style="{ paddingLeft: `${getNode(index).depth * indent}px` }"
        @click="handleNodeClick(getNode(index).node)"
      >
        <!-- Expand/collapse toggle -->
        <div
          class="tree-toggle flex-shrink-0 w-5 h-5 flex items-center justify-center"
          :class="getNode(index).hasChildren ? 'opacity-100 cursor-pointer' : 'opacity-0 pointer-events-none'"
          @click.stop="toggleExpand(getNode(index).node)"
        >
          <div
            class="i-carbon-chevron-right h-3.5 w-3.5 text-muted-foreground transition-transform duration-150"
            :class="getNode(index).expanded && 'rotate-90'"
          />
        </div>

        <!-- Node content (slot or default label) -->
        <div class="tree-content flex-1 min-w-0 truncate">
          <slot
            :node="getNode(index).node"
            :depth="getNode(index).depth"
            :has-children="getNode(index).hasChildren"
            :expanded="getNode(index).expanded"
          >
            <span class="text-sm">{{ getNode(index).node.label }}</span>
          </slot>
        </div>
      </div>
    </template>
  </VirtualList>
</template>
