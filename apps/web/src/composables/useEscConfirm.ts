import { computed, onUnmounted, ref } from 'vue'

const ESC_CONFIRM_WINDOW_MS = 3000

export function useEscConfirm() {
  const escConfirmActive = ref(false)
  const escRemainingMs = ref(0)
  const escIntervalId = ref<number | null>(null)

  const escProgressWidth = computed(() => {
    if (!escConfirmActive.value)
      return '0%'
    const ratio = Math.max(0, Math.min(1, escRemainingMs.value / ESC_CONFIRM_WINDOW_MS))
    return `${Math.round(ratio * 100)}%`
  })

  function clearEscConfirm() {
    escConfirmActive.value = false
    escRemainingMs.value = 0
    if (escIntervalId.value !== null) {
      window.clearInterval(escIntervalId.value)
      escIntervalId.value = null
    }
  }

  function startEscConfirm() {
    clearEscConfirm()
    escConfirmActive.value = true
    const deadline = Date.now() + ESC_CONFIRM_WINDOW_MS
    escRemainingMs.value = ESC_CONFIRM_WINDOW_MS
    escIntervalId.value = window.setInterval(() => {
      const remaining = deadline - Date.now()
      if (remaining <= 0) {
        clearEscConfirm()
        return
      }
      escRemainingMs.value = remaining
    }, 50)
  }

  onUnmounted(() => {
    clearEscConfirm()
  })

  return {
    escConfirmActive,
    escRemainingMs,
    escProgressWidth,
    startEscConfirm,
    clearEscConfirm,
  }
}
