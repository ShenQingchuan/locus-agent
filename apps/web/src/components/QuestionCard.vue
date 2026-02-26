<script setup lang="ts">
import type { QuestionAnswer } from '@/api/chat'
import { computed, ref } from 'vue'

const props = defineProps<{
  toolCallId: string
  questions: Array<{
    question: string
    options: string[]
  }>
}>()

const emit = defineEmits<{
  submit: [toolCallId: string, answers: QuestionAnswer[]]
}>()

// Track selected answers: index → selected option or custom text
const selectedAnswers = ref<Map<number, string>>(new Map())
// Track whether custom input is active for each question
const customActive = ref<Map<number, boolean>>(new Map())
// Custom input text for each question
const customTexts = ref<Map<number, string>>(new Map())

function selectOption(questionIndex: number, option: string) {
  selectedAnswers.value.set(questionIndex, option)
  customActive.value.set(questionIndex, false)
  // Trigger reactivity
  selectedAnswers.value = new Map(selectedAnswers.value)
  customActive.value = new Map(customActive.value)
}

function activateCustom(questionIndex: number) {
  customActive.value.set(questionIndex, true)
  customActive.value = new Map(customActive.value)
  // Clear option selection, use custom text as answer
  const customText = customTexts.value.get(questionIndex) || ''
  if (customText) {
    selectedAnswers.value.set(questionIndex, customText)
  }
  else {
    selectedAnswers.value.delete(questionIndex)
  }
  selectedAnswers.value = new Map(selectedAnswers.value)
}

function updateCustomText(questionIndex: number, text: string) {
  customTexts.value.set(questionIndex, text)
  customTexts.value = new Map(customTexts.value)
  if (customActive.value.get(questionIndex)) {
    if (text.trim()) {
      selectedAnswers.value.set(questionIndex, text.trim())
    }
    else {
      selectedAnswers.value.delete(questionIndex)
    }
    selectedAnswers.value = new Map(selectedAnswers.value)
  }
}

const allAnswered = computed(() => {
  return props.questions.every((_, i) => {
    const answer = selectedAnswers.value.get(i)
    return answer && answer.trim().length > 0
  })
})

const isSubmitted = ref(false)

function handleSubmit() {
  if (!allAnswered.value || isSubmitted.value)
    return

  isSubmitted.value = true

  const answers: QuestionAnswer[] = props.questions.map((q, i) => ({
    question: q.question,
    answer: selectedAnswers.value.get(i) || '',
  }))

  emit('submit', props.toolCallId, answers)
}

function getSelectedAnswer(questionIndex: number): string | undefined {
  return selectedAnswers.value.get(questionIndex)
}

function isOptionSelected(questionIndex: number, option: string): boolean {
  return !customActive.value.get(questionIndex) && selectedAnswers.value.get(questionIndex) === option
}

function isCustomActive(questionIndex: number): boolean {
  return customActive.value.get(questionIndex) || false
}
</script>

<template>
  <div class="rounded-lg border border-border bg-muted/30 overflow-hidden">
    <!-- Questions -->
    <div class="divide-y divide-border/50">
      <div
        v-for="(q, qIdx) in questions"
        :key="qIdx"
        class="px-4 py-3"
      >
        <!-- Question text -->
        <div class="flex items-start gap-2 mb-2.5">
          <div class="i-carbon-help h-4 w-4 flex-shrink-0 text-muted-foreground mt-0.5" />
          <span class="text-sm font-medium text-foreground">{{ q.question }}</span>
        </div>

        <!-- Options -->
        <div class="ml-6 space-y-1.5">
          <button
            v-for="(option, oIdx) in q.options"
            :key="oIdx"
            class="flex items-center gap-2 w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors duration-150"
            :class="[
              isOptionSelected(qIdx, option)
                ? 'bg-foreground/10 text-foreground border border-foreground/20'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground border border-transparent',
            ]"
            :disabled="isSubmitted"
            @click="selectOption(qIdx, option)"
          >
            <div
              class="h-3.5 w-3.5 flex-shrink-0 rounded-full border-2 transition-colors duration-150"
              :class="[
                isOptionSelected(qIdx, option)
                  ? 'border-foreground bg-foreground'
                  : 'border-muted-foreground/40',
              ]"
            >
              <div
                v-if="isOptionSelected(qIdx, option)"
                class="h-full w-full rounded-full flex items-center justify-center"
              >
                <div class="h-1.5 w-1.5 rounded-full bg-background" />
              </div>
            </div>
            <span>{{ option }}</span>
          </button>

          <!-- Custom input option -->
          <div
            class="flex items-start gap-2 w-full px-3 py-1.5 rounded-md text-sm transition-colors duration-150"
            :class="[
              isCustomActive(qIdx)
                ? 'bg-foreground/10 border border-foreground/20'
                : 'border border-transparent',
            ]"
          >
            <button
              class="flex items-center gap-2 flex-shrink-0 mt-0.5"
              :disabled="isSubmitted"
              @click="activateCustom(qIdx)"
            >
              <div
                class="h-3.5 w-3.5 rounded-full border-2 transition-colors duration-150"
                :class="[
                  isCustomActive(qIdx)
                    ? 'border-foreground bg-foreground'
                    : 'border-muted-foreground/40',
                ]"
              >
                <div
                  v-if="isCustomActive(qIdx)"
                  class="h-full w-full rounded-full flex items-center justify-center"
                >
                  <div class="h-1.5 w-1.5 rounded-full bg-background" />
                </div>
              </div>
              <span class="text-muted-foreground">自定义回答</span>
            </button>
            <input
              v-if="isCustomActive(qIdx)"
              type="text"
              class="flex-1 bg-transparent border-b border-border/60 text-sm text-foreground placeholder-muted-foreground/50 outline-none py-0.5 px-1 focus:border-foreground/40 transition-colors"
              placeholder="输入你的回答..."
              :value="customTexts.get(qIdx) || ''"
              :disabled="isSubmitted"
              @input="updateCustomText(qIdx, ($event.target as HTMLInputElement).value)"
              @keydown.enter="handleSubmit"
            >
          </div>
        </div>
      </div>
    </div>

    <!-- Submit button -->
    <div class="flex items-center gap-2 px-4 py-2.5 border-t border-border">
      <button
        class="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-md transition-colors duration-150"
        :class="[
          allAnswered && !isSubmitted
            ? 'bg-neutral-600 hover:bg-neutral-500 dark:bg-neutral-300 dark:hover:bg-neutral-400 text-background cursor-pointer'
            : 'bg-muted text-muted-foreground cursor-not-allowed',
        ]"
        :disabled="!allAnswered || isSubmitted"
        @click="handleSubmit"
      >
        <div class="i-carbon-send h-3 w-3" />
        提交回答
      </button>
      <span v-if="!allAnswered && !isSubmitted" class="text-xs text-muted-foreground">
        请回答所有问题
      </span>
      <span v-if="isSubmitted" class="text-xs text-muted-foreground">
        已提交
      </span>
    </div>

    <!-- Submitted answers preview -->
    <div
      v-if="isSubmitted"
      class="px-4 py-2.5 border-t border-border bg-muted/20"
    >
      <div class="text-xs text-muted-foreground space-y-1">
        <div v-for="(q, qIdx) in questions" :key="qIdx">
          <span class="font-medium">{{ q.question }}</span>
          <span class="mx-1">→</span>
          <span class="text-foreground">{{ getSelectedAnswer(qIdx) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
