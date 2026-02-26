<script setup lang="ts">
import type { Tag, TagWithCount } from '@locus-agent/shared'
import { computed, ref, watch } from 'vue'

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
  return Array.from(selected.value).filter(name => !allNames.has(name))
})

function toggle(tag: Tag) {
  const next = new Set(selected.value)
  if (next.has(tag.name))
    next.delete(tag.name)
  else
    next.add(tag.name)
  selected.value = next
}

function isSelected(name: string) {
  return selected.value.has(name)
}

function addNew() {
  const name = input.value.trim()
  if (name) {
    selected.value = new Set([...selected.value, name])
    input.value = ''
  }
}

function handleSave() {
  emit('save', Array.from(selected.value))
  emit('close')
}

function handleCancel() {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      @click.self="handleCancel"
    >
      <div
        class="w-full max-w-md rounded-lg border border-border bg-background p-4 shadow-lg max-h-[80vh] flex flex-col"
        @click.stop
      >
        <h3 class="text-sm font-semibold text-foreground mb-3">
          管理标签
        </h3>

        <div class="flex gap-2 mb-3">
          <input
            v-model="input"
            type="text"
            placeholder="新建或搜索标签..."
            class="flex-1 h-9 px-3 rounded-md border border-border bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            @keydown.enter.prevent="addNew"
          >
          <button
            class="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            :disabled="!input.trim()"
            @click="addNew"
          >
            添加
          </button>
        </div>

        <div class="flex-1 overflow-y-auto min-h-24 border border-border rounded-md p-2">
          <template v-if="allTags.length > 0 || customTagNames.length > 0">
            <div
              v-for="tag in allTags"
              :key="tag.id"
              class="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-accent/50 cursor-pointer"
              @click="toggle(tag)"
            >
              <div
                class="h-4 w-4 rounded border flex items-center justify-center flex-shrink-0"
                :class="isSelected(tag.name) ? 'bg-primary border-primary' : 'border-border'"
              >
                <div v-if="isSelected(tag.name)" class="i-carbon-checkmark h-2.5 w-2.5 text-primary-foreground" />
              </div>
              <span class="text-sm text-foreground truncate">{{ tag.name }}</span>
              <span class="ml-auto text-[10px] text-muted-foreground">{{ (tag as TagWithCount).noteCount ?? 0 }}</span>
            </div>
            <div
              v-for="name in customTagNames"
              :key="`custom-${name}`"
              class="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-accent/50 cursor-pointer"
              @click="toggle({ id: '', name, createdAt: new Date() })"
            >
              <div
                class="h-4 w-4 rounded border flex items-center justify-center flex-shrink-0"
                :class="isSelected(name) ? 'bg-primary border-primary' : 'border-border'"
              >
                <div v-if="isSelected(name)" class="i-carbon-checkmark h-2.5 w-2.5 text-primary-foreground" />
              </div>
              <span class="text-sm text-foreground truncate">{{ name }}</span>
              <span class="ml-auto text-[10px] text-muted-foreground/60">新建</span>
            </div>
          </template>
          <div v-else class="h-full min-h-20 flex flex-col items-center justify-center text-center text-sm text-muted-foreground/70 py-6">
            <div class="i-carbon-tag-group h-8 w-8 mb-2 opacity-40" />
            <p>暂无标签</p>
            <p class="text-xs mt-0.5">
              在上方输入框创建新标签
            </p>
          </div>
        </div>

        <div class="mt-4 flex justify-end gap-2">
          <button
            class="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-accent transition-colors"
            @click="handleCancel"
          >
            取消
          </button>
          <button
            class="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            :disabled="!hasChanges"
            @click="handleSave"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
