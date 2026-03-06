<script setup lang="ts">
import { computed, ref } from 'vue'
import Modal from './Modal.vue'

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

  <Modal
    :open="!!activeImage"
    max-width="max-w-none"
    panel-class="h-full max-h-none overflow-hidden border-0 rounded-none bg-black/72 p-0 shadow-none"
    @close="closePreview"
  >
    <div
      v-if="activeImage"
      class="relative flex h-full flex-col overflow-hidden bg-transparent"
    >
      <div class="absolute right-4 top-4 z-10">
        <button
          class="h-10 w-10 inline-flex items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/16 hover:text-white"
          type="button"
          title="关闭预览"
          @click="closePreview"
        >
          <span class="i-carbon-close h-4 w-4" />
        </button>
      </div>

      <div class="flex flex-1 items-center justify-center overflow-auto px-8 py-8">
        <img
          :src="activeImage.src"
          :alt="activeImage.alt || activeImage.name || 'image attachment'"
          class="max-h-full max-w-full object-contain"
        >
      </div>

      <div class="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex justify-center px-6">
        <div class="max-w-full truncate rounded-full bg-white/12 px-4 py-1.5 text-sm text-white/90">
          {{ activeImage.name || '图片预览' }}
        </div>
      </div>
    </div>
  </Modal>
</template>
