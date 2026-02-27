<script setup lang="ts">
import { onKeyStroke } from '@vueuse/core'
import { computed, watch } from 'vue'

const props = withDefaults(defineProps<{
  /** Whether the modal is visible */
  open: boolean
  /** Max width of the modal panel (e.g. 'max-w-md', 'max-w-lg') */
  maxWidth?: string
  /** Whether clicking the backdrop should close the modal */
  closeOnBackdrop?: boolean
  /** Whether pressing ESC should close the modal */
  closeOnEsc?: boolean
  /** Additional class for the modal panel */
  panelClass?: string
}>(), {
  maxWidth: 'max-w-md',
  closeOnBackdrop: true,
  closeOnEsc: true,
  panelClass: '',
})

const emit = defineEmits<{
  close: []
}>()

function handleClose() {
  emit('close')
}

function handleBackdropClick() {
  if (props.closeOnBackdrop)
    handleClose()
}

// ESC key to close
onKeyStroke('Escape', (e) => {
  if (props.open && props.closeOnEsc) {
    e.preventDefault()
    handleClose()
  }
})

// Lock body scroll when modal is open
watch(() => props.open, (isOpen) => {
  if (typeof document !== 'undefined') {
    document.body.style.overflow = isOpen ? 'hidden' : ''
  }
}, { immediate: true })

const panelClasses = computed(() => [
  'w-full rounded-lg border border-border bg-background p-4 shadow-lg max-h-[80vh] flex flex-col',
  props.maxWidth,
  props.panelClass,
].filter(Boolean).join(' '))
</script>

<template>
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
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center"
        aria-modal="true"
        role="dialog"
      >
        <!-- Backdrop -->
        <div
          class="absolute inset-0 bg-black/40"
          @click="handleBackdropClick"
        />

        <!-- Panel -->
        <div
          :class="panelClasses"
          @click.stop
        >
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
