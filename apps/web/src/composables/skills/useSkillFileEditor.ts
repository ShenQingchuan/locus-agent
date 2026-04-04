import type { SkillDetail } from '@univedge/locus-agent-sdk'
import type { useToast } from '@univedge/locus-ui'
import type { Ref } from 'vue'
import { computed, ref } from 'vue'
import { saveSkillFileContent } from '@/api/skills'
import { parseFrontmatter } from '@/utils/skills'

export interface UseSkillFileEditorOptions {
  selectedSkillId: Ref<string | null>
  selectedFilePath: Ref<string | null>
  selectedSkill: Ref<SkillDetail | null>
  fileContent: Ref<string>
  getWorkspaceRoot: () => string | undefined
  toast: ReturnType<typeof useToast>
}

export function useSkillFileEditor(options: UseSkillFileEditorOptions) {
  const isEditMode = ref(false)
  const editorContent = ref('')
  const isSavingFile = ref(false)
  const hasUnsavedChanges = ref(false)

  const isMarkdownFile = computed(() => {
    if (!options.selectedFilePath.value)
      return false
    return options.selectedFilePath.value.endsWith('.md') || options.selectedFilePath.value.endsWith('.markdown')
  })

  const parsedFile = computed(() => {
    if (!isMarkdownFile.value && options.selectedFilePath.value)
      return { frontmatter: '', body: options.fileContent.value }
    if (options.selectedFilePath.value === 'SKILL.md' && options.selectedSkill.value) {
      return {
        frontmatter: options.selectedSkill.value.rawFrontmatter,
        body: options.selectedSkill.value.content,
      }
    }
    return parseFrontmatter(options.fileContent.value)
  })

  const previewContent = computed(() => {
    if (!options.selectedFilePath.value)
      return options.selectedSkill.value?.content ?? ''
    return parsedFile.value.body
  })

  function enterEditMode() {
    editorContent.value = options.fileContent.value
    isEditMode.value = true
    hasUnsavedChanges.value = false
  }

  async function exitEditMode() {
    if (hasUnsavedChanges.value) {
      const confirmed = await options.toast.confirm('当前文件有未保存的修改，确定要退出编辑模式吗？')
      if (!confirmed)
        return
    }
    isEditMode.value = false
    hasUnsavedChanges.value = false
  }

  function exitEditState() {
    isEditMode.value = false
    hasUnsavedChanges.value = false
  }

  function setEditorContent(content: string) {
    editorContent.value = content
  }

  function onEditorChange(value: string) {
    editorContent.value = value
    hasUnsavedChanges.value = value !== options.fileContent.value
  }

  async function saveFile() {
    if (!options.selectedSkillId.value || !options.selectedFilePath.value || isSavingFile.value)
      return

    isSavingFile.value = true
    try {
      await saveSkillFileContent({
        skillId: options.selectedSkillId.value,
        filePath: options.selectedFilePath.value,
        content: editorContent.value,
        workspaceRoot: options.getWorkspaceRoot(),
      })
      options.fileContent.value = editorContent.value
      hasUnsavedChanges.value = false
      options.toast.success('保存成功')
    }
    catch (error) {
      options.toast.error(error instanceof Error ? error.message : '保存失败')
    }
    finally {
      isSavingFile.value = false
    }
  }

  return {
    isEditMode,
    editorContent,
    isSavingFile,
    hasUnsavedChanges,
    isMarkdownFile,
    parsedFile,
    previewContent,
    enterEditMode,
    exitEditMode,
    exitEditState,
    setEditorContent,
    onEditorChange,
    saveFile,
  }
}
