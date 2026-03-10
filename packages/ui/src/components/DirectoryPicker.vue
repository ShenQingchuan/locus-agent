<script setup lang="ts">
import { computed, ref } from 'vue'

export interface DirectoryPickerEntry {
  /** Full relative path including root directory, e.g. workspace/src/main.ts */
  path: string
}

export interface DirectorySelection {
  /** Picked root directory name */
  name: string
  /** Flattened file entries under the picked directory */
  entries: DirectoryPickerEntry[]
  /** Which capability produced the selection */
  source: 'native' | 'fallback'
}

const props = withDefaults(defineProps<{
  preferNative?: boolean
  fallbackToInput?: boolean
}>(), {
  preferNative: true,
  fallbackToInput: true,
})

const emit = defineEmits<{
  select: [selection: DirectorySelection]
  error: [error: unknown]
  loadingChange: [loading: boolean]
}>()

defineSlots<{
  default: (props: { open: () => Promise<void>, supportsNative: boolean, isLoading: boolean }) => any
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const isLoading = ref(false)

function setLoading(loading: boolean) {
  if (isLoading.value === loading) {
    return
  }
  isLoading.value = loading
  emit('loadingChange', loading)
}

const supportsNative = computed(() =>
  typeof window !== 'undefined'
  && typeof (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function',
)

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

async function collectEntries(
  directoryHandle: FileSystemDirectoryHandle,
  rootName: string,
  relativePath = '',
): Promise<DirectoryPickerEntry[]> {
  const result: DirectoryPickerEntry[] = []

  for await (const [entryName, handle] of (directoryHandle as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
    const nextRelativePath = relativePath ? `${relativePath}/${entryName}` : entryName

    if (handle.kind === 'file') {
      result.push({
        path: `${rootName}/${nextRelativePath}`,
      })
      continue
    }

    result.push(...await collectEntries(handle as FileSystemDirectoryHandle, rootName, nextRelativePath))
  }

  return result
}

async function openNativePicker() {
  const picker = (window as Window & {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>
  }).showDirectoryPicker

  if (!picker) {
    throw new Error('showDirectoryPicker is not available')
  }

  const directoryHandle = await picker()

  setLoading(true)
  try {
    const entries = await collectEntries(directoryHandle, directoryHandle.name)

    emit('select', {
      name: directoryHandle.name,
      entries,
      source: 'native',
    })
  }
  finally {
    setLoading(false)
  }
}

function openFallbackInput() {
  inputRef.value?.click()
}

async function open() {
  if (props.preferNative && supportsNative.value) {
    try {
      await openNativePicker()
      return
    }
    catch (error) {
      if (isAbortError(error)) {
        return
      }
      if (!props.fallbackToInput) {
        emit('error', error)
        return
      }
    }
  }

  if (props.fallbackToInput) {
    openFallbackInput()
    return
  }

  emit('error', new Error('No directory picker is available'))
}

function handleInputChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = input.files ? [...input.files] : []

  if (!files.length) {
    return
  }

  setLoading(true)
  try {
    const firstFile = files[0]!
    const firstPath = (firstFile as File & { webkitRelativePath?: string }).webkitRelativePath || firstFile.name
    const rootName = firstPath.split('/')[0] || firstFile.name

    emit('select', {
      name: rootName,
      entries: files.map((file) => {
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
        return {
          path: relativePath,
        }
      }),
      source: 'fallback',
    })

    input.value = ''
  }
  finally {
    setLoading(false)
  }
}
</script>

<template>
  <slot :open="open" :supports-native="supportsNative" :is-loading="isLoading" />
  <input
    ref="inputRef"
    type="file"
    webkitdirectory
    directory
    class="hidden"
    @change="handleInputChange"
  >
</template>
