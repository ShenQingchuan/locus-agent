<script setup lang="ts">
import { canUseRegexLookbehind } from 'prosekit/core'
import { useEditor } from 'prosekit/vue'
import { AutocompleteEmpty, AutocompleteList, AutocompletePopover } from 'prosekit/vue/autocomplete'
import { computed, toRef } from 'vue'
import PathMenuItem from './PathMenuItem.vue'
import { usePathMenuItems } from './usePathMenuItems'

const props = defineProps<{
  workspaceRoot?: string
}>()

const isChatMode = computed(() => !props.workspaceRoot)

const editor = useEditor()
const { items, isLoading, isTruncated, search } = usePathMenuItems(
  toRef(props, 'workspaceRoot'),
)

const mentionRegex = canUseRegexLookbehind()
  ? /(?<!\S)@(\S*)$/u
  : /(?:^|\s)@(\S*)$/u

function handleQueryChange(query: string) {
  search(query)
}

function handleOpenChange(open: boolean) {
  if (open) {
    search('')
  }
}

function handleListValueChange(selectedValue: string) {
  const item = items.value.find(entry => entry.searchText === selectedValue)
  if (!item)
    return

  requestAnimationFrame(() => {
    const view = editor.value.view
    if (!view)
      return

    const mentionType = view.state.schema.nodes.mention
    if (!mentionType)
      return

    const mentionNode = mentionType.create({
      id: item.absolutePath,
      value: `@${item.basename}`,
      kind: item.kind,
    })

    const { state } = view
    const tr = state.tr
      .replaceSelectionWith(mentionNode, false)
      .insertText(' ')
    view.dispatch(tr)
  })
}

function emptyText() {
  if (isLoading.value)
    return '正在加载目录和文件…'
  if (isTruncated.value)
    return '结果已截断，请继续输入缩小范围'
  return '没有匹配的目录或文件'
}
</script>

<template>
  <AutocompletePopover
    :regex="mentionRegex"
    class="path-menu-popover"
    @query-change="handleQueryChange"
    @open-change="handleOpenChange"
  >
    <AutocompleteList
      class="path-menu-list"
      :filter="null"
      @value-change="handleListValueChange"
    >
      <div v-if="isChatMode" class="path-menu-hint">
        <div class="i-carbon-information h-2.5 w-2.5 flex-shrink-0" />
        <span>会话模式下相对于 HOME 目录搜索</span>
      </div>

      <AutocompleteEmpty class="path-menu-empty">
        <div class="px-2 py-1.5 text-[11px] text-muted-foreground">
          {{ emptyText() }}
        </div>
      </AutocompleteEmpty>

      <PathMenuItem
        v-for="item in items"
        :key="item.absolutePath"
        :item="item"
      />
    </AutocompleteList>
  </AutocompletePopover>
</template>

<style>
prosekit-autocomplete-popover {
  display: block;
  background: transparent;
  overflow: visible !important;
  max-height: none !important;
}

prosekit-autocomplete-list {
  display: block;
  overflow: visible;
}

prosekit-autocomplete-item {
  display: block;
}

prosekit-autocomplete-empty {
  display: block;
}

.path-menu-popover {
  z-index: 50;
}

.path-menu-popover[data-state="closed"] {
  display: none;
}

.path-menu-list {
  background-color: hsl(var(--popover));
  color: hsl(var(--popover-foreground));
  border: 1px solid hsl(var(--border));
  border-radius: 0.375rem;
  box-shadow:
    0 4px 16px rgb(0 0 0 / 0.12),
    0 2px 4px rgb(0 0 0 / 0.06);
  max-height: 240px;
  max-width: 560px;
  min-width: 220px;
  overflow: hidden;
  overflow-y: auto;
  padding: 0 0.125rem 0.125rem;
}

html.dark .path-menu-list {
  box-shadow:
    0 4px 16px rgb(0 0 0 / 0.4),
    0 2px 4px rgb(0 0 0 / 0.2);
}

.path-menu-hint {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.625rem;
  color: hsl(var(--muted-foreground));
  background-color: hsl(var(--popover));
  border-bottom: 1px solid hsl(var(--border));
  user-select: none;
}
</style>
