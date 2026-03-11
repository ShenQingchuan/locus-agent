import type { MessageImageAttachment } from '@univedge/locus-agent-sdk'
import type { ImageAttachmentStripItem } from '@univedge/locus-ui'
import { useToast } from '@univedge/locus-ui'
import { computed, ref } from 'vue'

export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024
export const MAX_IMAGE_COUNT = 6

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image file'))
    reader.readAsDataURL(file)
  })
}

function loadImageDimensions(dataUrl: string): Promise<{ width: number, height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => reject(new Error('Failed to decode image dimensions'))
    image.src = dataUrl
  })
}

async function toImageAttachment(file: File): Promise<MessageImageAttachment> {
  const dataUrl = await readFileAsDataUrl(file)
  const dimensions = await loadImageDimensions(dataUrl)

  return {
    id: crypto.randomUUID(),
    kind: 'image',
    name: file.name,
    mimeType: file.type,
    dataUrl,
    sizeBytes: file.size,
    width: dimensions.width,
    height: dimensions.height,
  }
}

export function useImageAttachments() {
  const toast = useToast()
  const fileInput = ref<HTMLInputElement | null>(null)
  const selectedAttachments = ref<MessageImageAttachment[]>([])

  const attachmentStripItems = computed<ImageAttachmentStripItem[]>(() =>
    selectedAttachments.value.map(attachment => ({
      id: attachment.id,
      src: attachment.dataUrl,
      name: attachment.name,
      alt: attachment.name,
    })),
  )

  function resetComposerAttachments() {
    selectedAttachments.value = []
    if (fileInput.value)
      fileInput.value.value = ''
  }

  function removeAttachment(id: string) {
    selectedAttachments.value = selectedAttachments.value.filter(a => a.id !== id)
  }

  async function handleImageFilesSelected(event: Event) {
    const target = event.target as HTMLInputElement | null
    const files = [...target?.files ?? []]
    if (files.length === 0)
      return

    const availableSlots = MAX_IMAGE_COUNT - selectedAttachments.value.length
    if (availableSlots <= 0) {
      toast.info(`最多可附带 ${MAX_IMAGE_COUNT} 张图片`)
      if (target)
        target.value = ''
      return
    }

    const nextFiles = files.slice(0, availableSlots)

    if (files.length > nextFiles.length)
      toast.info(`最多可附带 ${MAX_IMAGE_COUNT} 张图片，已忽略多余图片`)

    const validFiles = nextFiles.filter((file) => {
      if (!file.type.startsWith('image/')) {
        toast.error(`仅支持图片文件：${file.name}`)
        return false
      }
      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        toast.error(`图片过大（>${Math.round(MAX_IMAGE_SIZE_BYTES / 1024 / 1024)}MB）：${file.name}`)
        return false
      }
      return true
    })

    try {
      const attachments = await Promise.all(validFiles.map(toImageAttachment))
      selectedAttachments.value = [...selectedAttachments.value, ...attachments]
    }
    catch (error) {
      toast.error(error instanceof Error ? error.message : '读取图片失败')
    }
    finally {
      if (target)
        target.value = ''
    }
  }

  function openFilePicker() {
    fileInput.value?.click()
  }

  return {
    fileInput,
    selectedAttachments,
    attachmentStripItems,
    resetComposerAttachments,
    removeAttachment,
    handleImageFilesSelected,
    openFilePicker,
  }
}
