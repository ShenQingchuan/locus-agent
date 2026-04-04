import type {
  EmbeddingLocalFamily,
  EmbeddingProvider,
  EmbeddingStatus,
} from '@/api/embedding'
import { useToast } from '@univedge/locus-ui'
import { useThrottleFn } from '@vueuse/core'
import { computed, nextTick, ref, watch } from 'vue'
import { useEmbeddingTasks } from '@/composables/useEmbeddingTasks'

export interface UseSettingsEmbeddingCardProps {
  refreshToken?: number
}

export function useSettingsEmbeddingCard(props: UseSettingsEmbeddingCardProps) {
  const toast = useToast()

  const embeddingState = ref<EmbeddingStatus>({
    status: 'loading' as any,
    indexedCount: 0,
    indexedWith: null,
    vecAvailable: true,
    embeddingConfigured: false,
    provider: 'zhipu',
    localFamily: 'qwen',
    localModelLabel: 'Qwen3-Embedding-0.6B',
    localModelId: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
    localModelSource: 'https://huggingface.co/onnx-community/Qwen3-Embedding-0.6B-ONNX',
    localModelReady: false,
    localModelFiles: [],
    localRuntimeInstalled: false,
  })

  const embeddingProgress = ref<{
    indexedCount?: number
    totalCount?: number
    percent?: number
  }>({})

  const embeddingBusy = ref(false)
  const providerSwitching = ref(false)

  const runtimeUninstalling = ref(false)
  const modelDeleting = ref(false)
  const installOutputEl = ref<HTMLPreElement | null>(null)

  const {
    runtimeInstalling,
    runtimeInstallOutput,
    modelDownloading,
    downloadFileList,
    runtimeInstallCompletedAt,
    modelDownloadCompletedAt,
    startRuntimeInstall,
    startModelDownload,
  } = useEmbeddingTasks()

  function scrollInstallOutputToBottom() {
    nextTick(() => {
      if (installOutputEl.value)
        installOutputEl.value.scrollTop = installOutputEl.value.scrollHeight
    })
  }

  const activeProvider = computed(() => embeddingState.value.provider)
  const activeLocalFamily = computed(() => embeddingState.value.localFamily)

  const LOCAL_FAMILY_OPTIONS: { value: EmbeddingLocalFamily, label: string }[] = [
    { value: 'qwen', label: 'Qwen' },
    { value: 'bge', label: 'BGE' },
  ]

  const indexedWithLabel = computed(() => {
    return embeddingState.value.indexedWith?.label ?? null
  })

  const activeSelectionKey = computed(() => {
    if (activeProvider.value === 'local')
      return `local:${embeddingState.value.localModelId}`
    return 'zhipu:embedding-3'
  })

  const hasMismatchedIndex = computed(() => {
    const { indexedCount, indexedWith } = embeddingState.value
    if (indexedCount === 0 || !indexedWith)
      return false

    const indexedKey = indexedWith.provider === 'local'
      ? `local:${indexedWith.modelId}`
      : `zhipu:${indexedWith.modelId}`

    return indexedKey !== activeSelectionKey.value
  })

  const embeddingStatusLabel = computed(() => {
    switch (embeddingState.value.status) {
      case 'loading' as any: return '加载中...'
      case 'not_configured': return '未配置'
      case 'indexing': return '索引中...'
      case 'ready': return '已就绪'
      case 'error': return '错误'
      default: return '未知'
    }
  })

  function formatFileSize(bytes: number): string {
    if (bytes < 1024)
      return `${bytes} B`
    if (bytes < 1024 * 1024)
      return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  async function loadEmbeddingStatus() {
    try {
      const { fetchEmbeddingStatus } = await import('@/api/embedding')
      const status = await fetchEmbeddingStatus()
      embeddingState.value = status
    }
    catch {
      embeddingState.value.status = 'not_configured'
    }
  }

  async function switchProvider(provider: EmbeddingProvider) {
    if (provider === activeProvider.value || providerSwitching.value)
      return
    providerSwitching.value = true
    try {
      const { setEmbeddingProvider } = await import('@/api/embedding')
      const result = await setEmbeddingProvider(provider)
      embeddingState.value = result
    }
    catch (err) {
      toast.error(`切换失败: ${err instanceof Error ? err.message : '未知错误'}`)
    }
    finally {
      providerSwitching.value = false
    }
  }

  async function switchLocalFamily(value: string) {
    if ((value !== 'qwen' && value !== 'bge') || value === activeLocalFamily.value || providerSwitching.value)
      return

    providerSwitching.value = true
    try {
      const { setLocalEmbeddingFamily } = await import('@/api/embedding')
      const result = await setLocalEmbeddingFamily(value)
      embeddingState.value = result
    }
    catch (err) {
      toast.error(`切换失败: ${err instanceof Error ? err.message : '未知错误'}`)
    }
    finally {
      providerSwitching.value = false
    }
  }

  async function handleDeleteModel() {
    if (modelDeleting.value)
      return

    modelDeleting.value = true
    try {
      const { deleteModel } = await import('@/api/embedding')
      await deleteModel()
      toast.success('模型已删除')
      await loadEmbeddingStatus()
    }
    catch (err) {
      toast.error(`删除失败: ${err instanceof Error ? err.message : '未知错误'}`)
    }
    finally {
      modelDeleting.value = false
    }
  }

  async function handleUninstallRuntime() {
    if (runtimeUninstalling.value)
      return

    runtimeUninstalling.value = true
    try {
      const { uninstallRuntime } = await import('@/api/embedding')
      await uninstallRuntime()
      toast.success('ONNX 运行时已卸载')
      await loadEmbeddingStatus()
    }
    catch (err) {
      toast.error(`卸载失败: ${err instanceof Error ? err.message : '未知错误'}`)
    }
    finally {
      runtimeUninstalling.value = false
    }
  }

  const onReindex = useThrottleFn(async () => {
    embeddingBusy.value = true
    embeddingProgress.value = {}
    embeddingState.value.status = 'indexing'

    const { startReindex } = await import('@/api/embedding')
    startReindex(
      (data) => {
        embeddingProgress.value = {
          indexedCount: data.indexedCount,
          totalCount: data.totalCount,
          percent: data.percent,
        }
      },
      () => {
        embeddingBusy.value = false
        toast.success('索引完成')
        loadEmbeddingStatus()
      },
      (msg) => {
        embeddingState.value.status = 'error'
        embeddingState.value.error = msg
        embeddingBusy.value = false
        toast.error(`索引失败: ${msg}`)
      },
    )
  }, 2000)

  async function onDismissError() {
    try {
      const { clearEmbeddingError } = await import('@/api/embedding')
      await clearEmbeddingError()
    }
    catch { /* clear frontend state even if API fails */ }
    await loadEmbeddingStatus()
  }

  watch(runtimeInstallOutput, () => {
    if (runtimeInstalling.value)
      scrollInstallOutputToBottom()
  })

  watch(runtimeInstallCompletedAt, (value, oldValue) => {
    if (value && value !== oldValue)
      void loadEmbeddingStatus()
  })

  watch(modelDownloadCompletedAt, (value, oldValue) => {
    if (value && value !== oldValue)
      void loadEmbeddingStatus()
  })

  watch(() => props.refreshToken, () => {
    void loadEmbeddingStatus()
  }, { immediate: true })

  scrollInstallOutputToBottom()

  return {
    embeddingState,
    embeddingProgress,
    embeddingBusy,
    providerSwitching,
    runtimeUninstalling,
    modelDeleting,
    installOutputEl,
    runtimeInstalling,
    runtimeInstallOutput,
    modelDownloading,
    downloadFileList,
    startRuntimeInstall,
    startModelDownload,
    activeProvider,
    activeLocalFamily,
    LOCAL_FAMILY_OPTIONS,
    indexedWithLabel,
    hasMismatchedIndex,
    embeddingStatusLabel,
    formatFileSize,
    switchProvider,
    switchLocalFamily,
    handleDeleteModel,
    handleUninstallRuntime,
    onReindex,
    onDismissError,
  }
}
