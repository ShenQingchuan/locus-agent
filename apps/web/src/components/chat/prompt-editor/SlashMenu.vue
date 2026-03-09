<script setup lang="ts">
import type { SlashMenuCommand } from './types'
import { canUseRegexLookbehind } from 'prosekit/core'
import { useEditor } from 'prosekit/vue'
import { AutocompleteEmpty, AutocompleteList, AutocompletePopover } from 'prosekit/vue/autocomplete'
import { computed, toRef } from 'vue'
import SlashMenuItem from './SlashMenuItem.vue'
import { useSlashMenuSkills } from './useSlashMenuSkills'

const props = defineProps<{
  workspaceRoot?: string
}>()

const editor = useEditor()
const { commands: skillCommands } = useSlashMenuSkills(toRef(props, 'workspaceRoot'))

// Aggregate all command sources here. Skills is one section; extend with more as needed.
const allCommands = computed<SlashMenuCommand[]>(() => [
  ...skillCommands.value,
])

// Group commands by section for rendering
const groupedCommands = computed(() => {
  const groups: { section: string, commands: SlashMenuCommand[] }[] = []
  const map = new Map<string, SlashMenuCommand[]>()

  for (const cmd of allCommands.value) {
    let list = map.get(cmd.section)
    if (!list) {
      list = []
      map.set(cmd.section, list)
      groups.push({ section: cmd.section, commands: list })
    }
    list.push(cmd)
  }

  return groups
})

// Match `/` at line start or after whitespace
const slashRegex = canUseRegexLookbehind()
  ? /(?<!\S)\/(\S*)$/u
  : /(?:^|\s)\/(\S*)$/u

function handleListValueChange(selectedValue: string) {
  const command = allCommands.value.find(c => c.name === selectedValue)
  if (!command)
    return

  // After deleteMatch removes `/query`, insert a mention tag + trailing space
  requestAnimationFrame(() => {
    const view = editor.value.view
    if (!view)
      return

    const mentionType = view.state.schema.nodes.mention
    if (!mentionType)
      return

    const mentionNode = mentionType.create({
      id: command.name,
      value: `/${command.name}`,
      kind: 'slash-command',
    })

    const { state } = view
    const tr = state.tr
      .replaceSelectionWith(mentionNode, false)
      .insertText(' ')
    view.dispatch(tr)
  })
}
</script>

<template>
  <AutocompletePopover
    :regex="slashRegex"
    class="slash-menu-popover"
  >
    <AutocompleteList
      class="slash-menu-list"
      @value-change="handleListValueChange"
    >
      <AutocompleteEmpty class="slash-menu-empty">
        <div class="px-3 py-2 text-xs text-muted-foreground">
          没有匹配的指令
        </div>
      </AutocompleteEmpty>

      <template v-for="group in groupedCommands" :key="group.section">
        <div class="slash-menu-section-label font-sans">
          {{ group.section }}
        </div>
        <SlashMenuItem
          v-for="cmd in group.commands"
          :key="cmd.name"
          :command="cmd"
        />
      </template>
    </AutocompleteList>
  </AutocompletePopover>
</template>

<style>
/* Custom elements default to display:inline — fix layout */
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

.slash-menu-popover {
  z-index: 50;
}

.slash-menu-popover[data-state="closed"] {
  display: none;
}

.slash-menu-list {
  background-color: hsl(var(--popover));
  color: hsl(var(--popover-foreground));
  border: 1px solid hsl(var(--border));
  border-radius: 0.5rem;
  box-shadow:
    0 4px 16px rgb(0 0 0 / 0.12),
    0 2px 4px rgb(0 0 0 / 0.06);
  max-height: 280px;
  max-width: 320px;
  min-width: 220px;
  overflow: hidden;
  overflow-y: auto;
  padding: 0.25rem;
}

html.dark .slash-menu-list {
  box-shadow:
    0 4px 16px rgb(0 0 0 / 0.4),
    0 2px 4px rgb(0 0 0 / 0.2);
}

.slash-menu-section-label {
  padding: 0.375rem 0.625rem 0.25rem;
  font-size: 0.6875rem;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  text-transform: uppercase;
  letter-spacing: 0.03em;
  user-select: none;
}
</style>
