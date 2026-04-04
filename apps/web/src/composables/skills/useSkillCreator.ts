import type { SkillSource } from '@univedge/locus-agent-sdk'
import type { useToast } from '@univedge/locus-ui'
import type { ComputedRef, Ref } from 'vue'
import { nextTick, ref } from 'vue'
import { createSkill } from '@/api/skills'

export interface UseSkillCreatorOptions {
  createSkillSource: ComputedRef<SkillSource>
  getWorkspaceRoot: () => string | undefined
  loadSkills: () => Promise<void>
  selectedSkillId: Ref<string | null>
  toast: ReturnType<typeof useToast>
}

export function useSkillCreator(options: UseSkillCreatorOptions) {
  const isCreating = ref(false)
  const newSkillName = ref('')
  const isCreateSubmitting = ref(false)
  const createNameInputRef = ref<HTMLInputElement | null>(null)

  function startCreateSkill() {
    isCreating.value = true
    newSkillName.value = ''
    nextTick(() => {
      createNameInputRef.value?.focus()
    })
  }

  function cancelCreateSkill() {
    isCreating.value = false
    newSkillName.value = ''
  }

  async function confirmCreateSkill() {
    const name = newSkillName.value.trim()
    if (!name || isCreateSubmitting.value)
      return

    isCreateSubmitting.value = true
    try {
      const result = await createSkill({
        name,
        source: options.createSkillSource.value,
        workspaceRoot: options.getWorkspaceRoot(),
      })

      if (result.success && result.skill) {
        isCreating.value = false
        newSkillName.value = ''
        await options.loadSkills()
        options.selectedSkillId.value = result.skill.id
        options.toast.success(`技能 "${name}" 创建成功`)
      }
    }
    catch (error) {
      options.toast.error(error instanceof Error ? error.message : '创建技能失败')
    }
    finally {
      isCreateSubmitting.value = false
    }
  }

  function handleCreateKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault()
      confirmCreateSkill()
    }
    else if (event.key === 'Escape') {
      cancelCreateSkill()
    }
  }

  return {
    isCreating,
    newSkillName,
    isCreateSubmitting,
    createNameInputRef,
    startCreateSkill,
    cancelCreateSkill,
    confirmCreateSkill,
    handleCreateKeydown,
  }
}
