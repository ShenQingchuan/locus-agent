<script setup lang="ts">
import type { Tag, TagWithCount } from '@univedge/locus-agent-sdk'
import type { TreeNode } from '@univedge/locus-ui'
import type { TagTreeData } from '@/utils/tagTree'
import { Modal, Tree } from '@univedge/locus-ui'
import { computed, ref, watch } from 'vue'
import { buildTagTree } from '@/utils/tagTree'

const props = defineProps<{
  open: boolean
  noteTags: Tag[]
  allTags: (Tag | TagWithCount)[]
}>()

const emit = defineEmits<{
  save: [tagNames: string[]]
  close: []
}>()

const input = ref('')
const selected = ref<Set<string>>(new Set())

const noteTagNames = computed(() => new Set(props.noteTags.map(t => t.name)))

// Build tree from flat tags (ensure TagWithCount format)
const tagsWithCount = computed((): TagWithCount[] =>
  props.allTags.map(t => ({
    ...t,
    noteCount: (t as TagWithCount).noteCount ?? 0,
  })),
)
const tagTree = computed(() => buildTagTree(tagsWithCount.value))

const defaultExpandedTagIds = computed(() =>
  tagTree.value
    .filter(n => n.children && n.children.length > 0)
    .map(n => n.id),
)

watch(() => props.open, (open) => {
  if (open) {
    selected.value = new Set(props.noteTags.map(t => t.name))
    input.value = ''
  }
})

const hasChanges = computed(() => {
  const current = new Set(selected.value)
  const note = noteTagNames.value
  if (current.size !== note.size)
    return true
  for (const n of current) {
    if (!note.has(n))
      return true
  }
  return false
})

const customTagNames = computed(() => {
  const allNames = new Set(props.allTags.map(t => t.name))
  return [...selected.value].filter(name => !allNames.has(name))
})

function toggleByName(name: string) {
  const next = new Set(selected.value)
  if (next.has(name))
    next.delete(name)
  else
    next.add(name)
  selected.value = next
}

function toggle(tag: Tag) {
  toggleByName(tag.name)
}

function isSelected(name: string) {
  return selected.value.has(name)
}

function handleLeafClick(node: TreeNode) {
  const data = node.data as TagTreeData
  if (data.tagId)
    toggleByName(node.id)
}

function addNew() {
  const name = input.value.trim()
  if (name) {
    selected.value = new Set([...selected.value, name])
    input.value = ''
  }
}

function handleSave() {
  emit('save', [...selected.value])
  emit('close')
}

function handleClose() {
  emit('close')
}
</script>

<template>
  <Modal
    :open="open"
    max-width="max-w-md"
    @close="handleClose"
  >
    <h3 class="text-sm font-semibold text-foreground font-mono mb-3">
      管理标签
    </h3>

    <div class="flex gap-2 mb-3">
      <input
        v-model="input"
        type="text"
        placeholder="新建或搜索标签..."
        class="flex-1 h-9 px-3 rounded-md border border-border bg-transparent text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        @keydown.enter.prevent="addNew"
      >
      <button
        class="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 font-mono"
        :disabled="!input.trim()"
        @click="addNew"
      >
        添加
      </button>
    </div>

    <div class="flex-1 overflow-y-auto min-h-24 border border-border rounded-md p-2">
      <template v-if="tagTree.length > 0 || customTagNames.length > 0">
        <Tree
          v-if="tagTree.length > 0"
          :nodes="tagTree"
          :item-height="32"
          :indent="16"
          :default-expanded="defaultExpandedTagIds"
          container-class="min-h-20"
        >
          <template #default="{ node, hasChildren }">
            <div
              class="flex items-center gap-2 flex-1 min-w-0 py-0.5"
              :class="(node.data as TagTreeData).tagId ? 'cursor-pointer' : ''"
              @click.stop="handleLeafClick(node)"
            >
              <div
                v-if="(node.data as TagTreeData).tagId"
                class="h-4 w-4 rounded border flex items-center justify-center flex-shrink-0"
                :class="isSelected(node.id) ? 'bg-primary border-primary' : 'border-border'"
              >
                <div v-if="isSelected(node.id)" class="i-carbon-checkmark h-2.5 w-2.5 text-primary-foreground" />
              </div>
              <div
                v-else
                class="h-4 w-4 flex-shrink-0 opacity-50"
                :class="hasChildren ? 'i-carbon-folder' : 'i-carbon-tag'"
              />
              <span class="text-sm text-foreground truncate font-mono">{{ node.label }}</span>
              <span class="ml-auto text-[10px] text-muted-foreground flex-shrink-0 font-mono">
                {{ (node.data as TagTreeData).noteCount }}
              </span>
            </div>
          </template>
        </Tree>
        <div
          v-for="name in customTagNames"
          :key="`custom-${name}`"
          class="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-accent/50 cursor-pointer mt-1"
          @click="toggle({ id: '', name, createdAt: new Date() })"
        >
          <div
            class="h-4 w-4 rounded border flex items-center justify-center flex-shrink-0"
            :class="isSelected(name) ? 'bg-primary border-primary' : 'border-border'"
          >
            <div v-if="isSelected(name)" class="i-carbon-checkmark h-2.5 w-2.5 text-primary-foreground" />
          </div>
          <span class="text-sm text-foreground truncate font-mono">{{ name }}</span>
          <span class="ml-auto text-[10px] text-muted-foreground/60 font-mono">新建</span>
        </div>
      </template>
      <div v-else class="h-full min-h-20 flex flex-col items-center justify-center text-center text-sm text-muted-foreground/70 py-6 font-mono">
        <div class="i-carbon-tag-group h-8 w-8 mb-2 opacity-40" />
        <p>暂无标签</p>
        <p class="text-xs mt-0.5">
          在上方输入框创建新标签
        </p>
      </div>
    </div>

    <div class="mt-4 flex justify-end gap-2">
      <button
        class="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-accent transition-colors font-mono"
        @click="handleClose"
      >
        取消
      </button>
      <button
        class="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 font-mono"
        :disabled="!hasChanges"
        @click="handleSave"
      >
        保存
      </button>
    </div>
  </Modal>
</template>
