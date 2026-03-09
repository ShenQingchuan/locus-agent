import type { MaybeRef } from 'vue'
import type { SlashMenuCommand } from './types'
import { onMounted, ref, toValue, watch } from 'vue'
import { fetchSkills } from '@/api/skills'

export function useSlashMenuSkills(workspaceRoot?: MaybeRef<string | undefined>) {
  const commands = ref<SlashMenuCommand[]>([])
  const isLoading = ref(false)

  async function reload() {
    isLoading.value = true
    try {
      const root = toValue(workspaceRoot)
      const res = await fetchSkills(root)
      commands.value = res.skills
        .filter(s => s.userInvocable && s.enabled)
        .map(s => ({
          name: s.name,
          description: s.description,
          section: 'Skills',
          icon: 'i-carbon-flash',
          badge: s.source === 'system' ? '系统' : '项目',
          badgeVariant: s.source === 'system' ? 'info' as const : 'warning' as const,
          insertText: `/${s.name} `,
        }))
    }
    catch {
      commands.value = []
    }
    finally {
      isLoading.value = false
    }
  }

  onMounted(reload)

  watch(() => toValue(workspaceRoot), reload)

  return { commands, isLoading, reload }
}
