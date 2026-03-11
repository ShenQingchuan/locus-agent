import type { ModelFileProgress } from '@/api/embedding'
import { useToast } from '@univedge/locus-ui'
import { computed, reactive, ref } from 'vue'

interface DownloadFileState {
  status: 'initiate' | 'download' | 'progress' | 'done'
  progress: number
  loaded: number
  total: number
}

const runtimeInstalling = ref(false)
const runtimeInstallOutput = ref('')
const modelDownloading = ref(false)
const downloadFiles = reactive<Record<string, DownloadFileState>>({})
const runtimeInstallCompletedAt = ref<number | null>(null)
const modelDownloadCompletedAt = ref<number | null>(null)

function resetDownloadFiles() {
  Object.keys(downloadFiles).forEach(key => delete downloadFiles[key])
}

function updateDownloadFile(data: ModelFileProgress) {
  const existing = downloadFiles[data.file]
  if (data.status === 'initiate') {
    downloadFiles[data.file] = {
      status: 'initiate',
      progress: 0,
      loaded: 0,
      total: 0,
    }
    return
  }

  if (!existing)
    return

  existing.status = data.status
  if (data.progress != null)
    existing.progress = data.progress
  if (data.loaded != null)
    existing.loaded = data.loaded
  if (data.total != null)
    existing.total = data.total
}

export function useEmbeddingTasks() {
  const toast = useToast()

  async function startRuntimeInstall() {
    if (runtimeInstalling.value)
      return

    runtimeInstalling.value = true
    runtimeInstallOutput.value = ''

    const { startRuntimeInstall: runRuntimeInstall } = await import('@/api/embedding')
    runRuntimeInstall(
      (output) => {
        runtimeInstallOutput.value += output
      },
      () => {
        runtimeInstalling.value = false
        runtimeInstallOutput.value = ''
        runtimeInstallCompletedAt.value = Date.now()
        toast.success('ONNX 运行时安装完成')
      },
      (msg) => {
        runtimeInstalling.value = false
        toast.error(`安装失败: ${msg}`)
      },
    )
  }

  async function startModelDownload() {
    if (modelDownloading.value)
      return

    modelDownloading.value = true
    resetDownloadFiles()

    const { startModelDownload: runModelDownload } = await import('@/api/embedding')
    runModelDownload(
      (data) => {
        updateDownloadFile(data)
      },
      () => {
        modelDownloading.value = false
        modelDownloadCompletedAt.value = Date.now()
        toast.success('模型下载完成')
      },
      (msg) => {
        modelDownloading.value = false
        toast.error(`下载失败: ${msg}`)
      },
    )
  }

  return {
    runtimeInstalling,
    runtimeInstallOutput,
    modelDownloading,
    downloadFiles,
    downloadFileList: computed(() => Object.entries(downloadFiles).map(([name, info]) => ({
      name,
      ...info,
    }))),
    runtimeInstallCompletedAt,
    modelDownloadCompletedAt,
    startRuntimeInstall,
    startModelDownload,
  }
}
