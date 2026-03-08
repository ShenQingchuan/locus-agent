<script setup lang="ts">
import { onKeyStroke } from '@vueuse/core'
import { computed, onUnmounted, ref, watch } from 'vue'

export interface ImageAttachmentStripItem {
  id: string
  src: string
  name?: string
  alt?: string
}

const props = withDefaults(defineProps<{
  images: ImageAttachmentStripItem[]
  size?: 'sm' | 'md'
  removable?: boolean
  emptyText?: string
}>(), {
  size: 'md',
  removable: false,
  emptyText: '',
})

const emit = defineEmits<{
  remove: [id: string]
}>()

const activeImageId = ref<string | null>(null)

const sizeClasses = computed(() => props.size === 'sm'
  ? 'h-14 w-14 rounded-md'
  : 'h-18 w-18 rounded-lg')

const activeImage = computed(() => props.images.find(image => image.id === activeImageId.value) ?? null)

function openPreview(id: string) {
  activeImageId.value = id
}

function closePreview() {
  activeImageId.value = null
}

function handleRemove(id: string) {
  emit('remove', id)
  if (activeImageId.value === id)
    closePreview()
}

onKeyStroke('Escape', (event) => {
  if (!activeImage.value)
    return
  event.preventDefault()
  closePreview()
})

watch(activeImage, (image) => {
  if (typeof document === 'undefined')
    return
  document.body.style.overflow = image ? 'hidden' : ''
}, { immediate: true })

onUnmounted(() => {
  if (typeof document !== 'undefined')
    document.body.style.overflow = ''
})
</script>

<template>
  <div v-if="images.length > 0" class="flex items-center gap-2 overflow-x-auto pb-1">
    <div
      v-for="image in images"
      :key="image.id"
      class="group relative flex-none"
    >
      <button
        class="relative block overflow-hidden border border-border/70 bg-muted/40 transition-all duration-150 hover:border-border hover:shadow-sm"
        :class="sizeClasses"
        type="button"
        :title="image.name || '预览图片'"
        @click="openPreview(image.id)"
      >
        <img
          :src="image.src"
          :alt="image.alt || image.name || 'image attachment'"
          class="h-full w-full object-cover"
        >
        <div class="absolute inset-0 bg-black/0 transition-colors duration-150 group-hover:bg-black/8" />
      </button>

      <button
        v-if="removable"
        class="absolute -right-1 -top-1 h-5 w-5 inline-flex items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:text-foreground"
        type="button"
        title="移除图片"
        @click.stop="handleRemove(image.id)"
      >
        <span class="i-carbon-close h-3 w-3" />
      </button>
    </div>
  </div>

  <p v-else-if="emptyText" class="text-xs text-muted-foreground">
    {{ emptyText }}
  </p>

  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="activeImage"
        class="fixed inset-0 z-50 flex flex-col bg-black/72 select-none"
        aria-modal="true"
        role="dialog"
        @click="closePreview"
      >
        <div class="flex flex-1 items-center justify-center overflow-auto px-8 py-8">
          <img
            :src="activeImage.src"
            :alt="activeImage.alt || activeImage.name || 'image attachment'"
            class="max-h-full max-w-full object-contain"
            @click.stop
          >
        </div>

        <div class="pb-5 flex justify-center px-6">
          <div
            class="max-w-full truncate rounded-full bg-white/12 px-4 py-1.5 text-sm text-white/90 select-text cursor-text"
            @click.stop
          >
            {{ activeImage.name || '图片预览' }}
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
