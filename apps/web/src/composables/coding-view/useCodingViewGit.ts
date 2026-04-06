import type { ComputedRef, Ref } from 'vue'
import { useToast } from '@univedge/locus-ui'
import { computed, ref, watch } from 'vue'
import { useGitStatus } from '@/composables/useGitStatus'
import { notifyReviewAnnotationsAfterCommit } from '@/composables/useReviewAnnotations'
import { useChatStore } from '@/stores/chat'
import { useWorkspaceStore } from '@/stores/workspace'

export function useCodingViewGit(
  currentProjectPath: ComputedRef<string>,
  activeSection: Ref<'chat' | 'planning' | 'workspace'>,
  isCodingViewActive: Ref<boolean>,
  currentProjectKey: Ref<string | undefined>,
) {
  const toast = useToast()
  const chatStore = useChatStore()
  const workspaceStore = useWorkspaceStore()

  const isCommitDialogOpen = ref(false)
  const gitStatus = useGitStatus(computed(() => workspaceStore.currentWorkspacePath), isCodingViewActive)

  const isGitStatusUpdating = computed(
    () => activeSection.value === 'workspace'
      && (gitStatus.isLoading.value || gitStatus.isRefreshing.value),
  )

  function handleCommit() {
    isCommitDialogOpen.value = true
  }

  async function handleCommitConfirm(message: string) {
    isCommitDialogOpen.value = false
    try {
      const result = await gitStatus.commit(message)
      if (result?.success) {
        toast.success('提交成功')
        const pk = currentProjectKey.value
        if (pk)
          notifyReviewAnnotationsAfterCommit(pk)
      }
      else {
        toast.error(result?.message || '提交失败')
      }
    }
    catch (error) {
      toast.error(error instanceof Error ? error.message : '提交失败')
    }
  }

  async function handlePush() {
    const confirmed = await toast.confirm({
      title: '推送到远程',
      message: '确定要将本地提交推送到远程仓库吗？',
      confirmText: '推送',
      cancelText: '取消',
    })
    if (!confirmed)
      return

    try {
      const result = await gitStatus.push()
      if (result?.success) {
        toast.success('推送成功')
      }
      else {
        toast.error(result?.message || '推送失败')
      }
    }
    catch (error) {
      toast.error(error instanceof Error ? error.message : '推送失败')
    }
  }

  async function handleDiscard() {
    const confirmed = await toast.confirm({
      title: '回滚全部变更',
      message: '此操作将撤销所有未提交的变更，且无法恢复。确定继续？',
      confirmText: '回滚',
      cancelText: '取消',
      type: 'error',
    })
    if (!confirmed)
      return

    try {
      const result = await gitStatus.discard()
      if (result?.success) {
        toast.success('已回滚全部变更')
      }
      else {
        toast.error(result?.message || '回滚失败')
      }
    }
    catch (error) {
      toast.error(error instanceof Error ? error.message : '回滚失败')
    }
  }

  watch(() => chatStore.isStreaming, (cur, prev) => {
    if (prev && !cur) {
      setTimeout(() => gitStatus.refresh(), 500)
    }
  })

  return {
    isCommitDialogOpen,
    gitStatus,
    isGitStatusUpdating,
    handleCommit,
    handleCommitConfirm,
    handlePush,
    handleDiscard,
  }
}
