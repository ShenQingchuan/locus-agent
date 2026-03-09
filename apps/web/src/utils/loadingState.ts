import type { Ref } from 'vue'

/**
 * Run an async task with a delayed loading indicator.
 *
 * The loading flag (`target.value`) is set to `true` only after `delay` ms,
 * and once shown it stays visible for at least `minVisible` ms to avoid flicker.
 */
export async function runWithLoadingState(
  target: Ref<boolean>,
  task: () => Promise<void>,
  options: { delay?: number, minVisible?: number } = {},
): Promise<void> {
  const delay = options.delay ?? 140
  const minVisible = options.minVisible ?? 160

  let shownAt = 0
  const timer = setTimeout(() => {
    target.value = true
    shownAt = Date.now()
  }, delay)

  try {
    await task()
  }
  finally {
    clearTimeout(timer)
    if (shownAt > 0) {
      const visibleFor = Date.now() - shownAt
      if (visibleFor < minVisible) {
        await new Promise(resolve => setTimeout(resolve, minVisible - visibleFor))
      }
      target.value = false
    }
  }
}
