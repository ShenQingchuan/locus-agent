<script setup lang="ts">
import type { QuestionAnswer } from '@/api/chat'
import { computed, ref } from 'vue'

const props = defineProps<{
  toolCallId: string
  questions: Array<{
    question: string
    options: string[]
    multiple?: boolean
  }>
}>()

const emit = defineEmits<{
  submit: [toolCallId: string, answers: QuestionAnswer[]]
}>()

// 单选：index → 选中的选项文本
const singleAnswers = ref<Map<number, string>>(new Map())
// 多选：index → 选中的选项集合
const multiAnswers = ref<Map<number, Set<string>>>(new Map())
// 自定义输入是否激活
const customActive = ref<Map<number, boolean>>(new Map())
// 自定义输入文本
const customTexts = ref<Map<number, string>>(new Map())
// IME composition state (avoid updating during Chinese/Japanese/Korean input)
const isComposing = ref(false)

function triggerReactivity() {
  singleAnswers.value = new Map(singleAnswers.value)
  multiAnswers.value = new Map(multiAnswers.value)
  customActive.value = new Map(customActive.value)
  customTexts.value = new Map(customTexts.value)
}

// ── 单选 ──
function selectSingle(qIdx: number, option: string) {
  singleAnswers.value.set(qIdx, option)
  customActive.value.set(qIdx, false)
  triggerReactivity()
}

// ── 多选 ──
function toggleMulti(qIdx: number, option: string) {
  let selected = multiAnswers.value.get(qIdx)
  if (!selected) {
    selected = new Set()
    multiAnswers.value.set(qIdx, selected)
  }
  if (selected.has(option))
    selected.delete(option)
  else
    selected.add(option)
  triggerReactivity()
}

function isMultiSelected(qIdx: number, option: string): boolean {
  return multiAnswers.value.get(qIdx)?.has(option) ?? false
}

// ── 自定义输入 ──
function activateCustom(qIdx: number) {
  customActive.value.set(qIdx, true)
  // 单选模式下清除选项选择
  if (!props.questions[qIdx]?.multiple) {
    singleAnswers.value.delete(qIdx)
  }
  triggerReactivity()
}

function updateCustomText(qIdx: number, text: string) {
  customTexts.value.set(qIdx, text)
  triggerReactivity()
}

function handleCompositionStart() {
  isComposing.value = true
}

function handleCustomInput(qIdx: number, value: string) {
  if (!isComposing.value)
    updateCustomText(qIdx, value)
}

function handleCompositionEnd(qIdx: number, event: CompositionEvent) {
  isComposing.value = false
  const target = event.target as HTMLTextAreaElement | null
  if (target)
    updateCustomText(qIdx, target.value)
}

function handleCustomKeydown(event: KeyboardEvent) {
  if (event.isComposing)
    return
  // Ctrl/Cmd + Enter to submit (textarea uses Enter for newline)
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    handleSubmit()
  }
}

function isCustomActive(qIdx: number): boolean {
  return customActive.value.get(qIdx) ?? false
}

// ── 组装当前问题的回答文本 ──
function getAnswer(qIdx: number): string {
  const q = props.questions[qIdx]!
  const parts: string[] = []

  if (q.multiple) {
    // 多选：收集所有勾选的选项
    const selected = multiAnswers.value.get(qIdx)
    if (selected && selected.size > 0) {
      parts.push(...selected)
    }
  }
  else {
    // 单选
    const single = singleAnswers.value.get(qIdx)
    if (single && !isCustomActive(qIdx)) {
      parts.push(single)
    }
  }

  // 自定义文本
  if (isCustomActive(qIdx)) {
    const custom = customTexts.value.get(qIdx)?.trim()
    if (custom)
      parts.push(custom)
  }

  return parts.join('、')
}

const allAnswered = computed(() => {
  return props.questions.every((_, i) => getAnswer(i).length > 0)
})

const isSubmitted = ref(false)

function handleSubmit() {
  if (!allAnswered.value || isSubmitted.value)
    return

  isSubmitted.value = true

  const answers: QuestionAnswer[] = props.questions.map((q, i) => ({
    question: q.question,
    answer: getAnswer(i),
  }))

  emit('submit', props.toolCallId, answers)
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
          <span class="text-[10px] text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded-full leading-normal flex-shrink-0 mt-0.5">{{ q.multiple ? '多选' : '单选' }}</span>
        </div>

        <!-- Options -->
        <div class="ml-6 space-y-1.5">
          <button
            v-for="(option, oIdx) in q.options"
            :key="oIdx"
            class="flex items-center gap-2 w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors duration-150"
            :class="[
              (q.multiple ? isMultiSelected(qIdx, option) : (!isCustomActive(qIdx) && singleAnswers.get(qIdx) === option))
                ? 'bg-foreground/10 text-foreground border border-foreground/20'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground border border-transparent',
            ]"
            :disabled="isSubmitted"
            @click="q.multiple ? toggleMulti(qIdx, option) : selectSingle(qIdx, option)"
          >
            <!-- 多选: checkbox 样式 -->
            <template v-if="q.multiple">
              <div
                class="h-3.5 w-3.5 flex-shrink-0 rounded border-2 transition-colors duration-150 flex items-center justify-center"
                :class="[
                  isMultiSelected(qIdx, option)
                    ? 'border-foreground bg-foreground'
                    : 'border-muted-foreground/40',
                ]"
              >
                <div
                  v-if="isMultiSelected(qIdx, option)"
                  class="i-carbon-checkmark h-2.5 w-2.5 text-background"
                />
              </div>
            </template>
            <!-- 单选: radio 样式 -->
            <template v-else>
              <div
                class="h-3.5 w-3.5 flex-shrink-0 rounded-full border-2 transition-colors duration-150"
                :class="[
                  (!isCustomActive(qIdx) && singleAnswers.get(qIdx) === option)
                    ? 'border-foreground bg-foreground'
                    : 'border-muted-foreground/40',
                ]"
              >
                <div
                  v-if="!isCustomActive(qIdx) && singleAnswers.get(qIdx) === option"
                  class="h-full w-full rounded-full flex items-center justify-center"
                >
                  <div class="h-1.5 w-1.5 rounded-full bg-background" />
                </div>
              </div>
            </template>
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
              <!-- 多选模式下自定义也是 checkbox -->
              <template v-if="q.multiple">
                <div
                  class="h-3.5 w-3.5 rounded border-2 transition-colors duration-150 flex items-center justify-center"
                  :class="[
                    isCustomActive(qIdx)
                      ? 'border-foreground bg-foreground'
                      : 'border-muted-foreground/40',
                  ]"
                >
                  <div
                    v-if="isCustomActive(qIdx)"
                    class="i-carbon-checkmark h-2.5 w-2.5 text-background"
                  />
                </div>
              </template>
              <template v-else>
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
              </template>
              <span class="text-muted-foreground">自定义回答</span>
            </button>
            <textarea
              v-if="isCustomActive(qIdx)"
              rows="3"
              class="flex-1 min-w-0 w-full textarea-field resize-y min-h-[60px] mt-0.25 pt-0"
              placeholder="输入你的回答..."
              :value="customTexts.get(qIdx) || ''"
              :disabled="isSubmitted"
              @input="handleCustomInput(qIdx, ($event.target as HTMLTextAreaElement).value)"
              @compositionstart="handleCompositionStart"
              @compositionend="handleCompositionEnd(qIdx, $event)"
              @keydown="handleCustomKeydown"
            />
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
  </div>
</template>
