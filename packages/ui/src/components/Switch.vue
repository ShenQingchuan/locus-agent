<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue?: boolean
  disabled?: boolean
  title?: string
}>(), {
  modelValue: false,
  disabled: false,
  title: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

function handleClick() {
  if (props.disabled)
    return
  emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <div
    role="switch"
    :aria-checked="modelValue"
    :title="title"
    :aria-disabled="disabled"
    class="relative inline-flex h-3.5 w-6 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    :class="[
      disabled && 'cursor-not-allowed opacity-50',
      modelValue ? 'bg-primary' : 'bg-muted-foreground/80',
    ]"
    tabindex="0"
    @click="handleClick"
    @keydown.space.enter.prevent="handleClick"
  >
    <span
      class="pointer-events-none absolute top-0.5 left-0.5 h-2.5 w-2.5 rounded-full bg-background transition-transform duration-150"
      :class="modelValue ? 'translate-x-2.5' : 'translate-x-0'"
    />
  </div>
</template>
