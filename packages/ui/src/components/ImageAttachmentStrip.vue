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
    max-width="max-w-5xl"
    panel-class="overflow-hidden p-0"
    @close="closePreview"
  >
    <div v-if="activeImage" class="flex max-h-[85vh] flex-col bg-background">
      <div class="flex items-center justify-between border-b border-border px-4 py-3">
        <div class="min-w-0">
          <p class="truncate text-sm font-medium text-foreground">
            {{ activeImage.name || '图片预览' }}
          </p>
        </div>
        <button
          class="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          type="button"
          title="关闭预览"
          @click="closePreview"
        >
          <span class="i-carbon-close h-4 w-4" />
        </button>
      </div>

      <div class="flex flex-1 items-center justify-center overflow-auto bg-muted/20 p-4">
        <img
          :src="activeImage.src"
          :alt="activeImage.alt || activeImage.name || 'image attachment'"
          class="max-h-[75vh] max-w-full rounded-lg object-contain shadow-sm"
        >
      </div>
    </div>
  </Modal>
</template>
