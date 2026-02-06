import { ref } from 'vue'

export type ToastType = 'info' | 'success' | 'warning' | 'error'

export interface Toast {
  id: string
  type: ToastType
  message: string
  duration?: number
}

export interface ConfirmOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  type?: ToastType
}

const toasts = ref<Toast[]>([])
const confirmState = ref<{
  visible: boolean
  options: ConfirmOptions
  resolve: ((value: boolean) => void) | null
}>({
  visible: false,
  options: { message: '' },
  resolve: null,
})

export function useToast() {
  function show(message: string, type: ToastType = 'info', duration = 3000) {
    const id = crypto.randomUUID()
    const toast: Toast = { id, type, message, duration }
    toasts.value.push(toast)

    if (duration > 0) {
      setTimeout(() => {
        remove(id)
      }, duration)
    }

    return id
  }

  function remove(id: string) {
    const index = toasts.value.findIndex(t => t.id === id)
    if (index > -1) {
      toasts.value.splice(index, 1)
    }
  }

  function removeAll() {
    toasts.value = []
  }

  function success(message: string, duration?: number) {
    return show(message, 'success', duration)
  }

  function error(message: string, duration?: number) {
    return show(message, 'error', duration)
  }

  function warning(message: string, duration?: number) {
    return show(message, 'warning', duration)
  }

  function info(message: string, duration?: number) {
    return show(message, 'info', duration)
  }

  function confirm(options: ConfirmOptions | string): Promise<boolean> {
    const opts: ConfirmOptions = typeof options === 'string'
      ? { message: options }
      : options

    return new Promise((resolve) => {
      confirmState.value = {
        visible: true,
        options: {
          title: opts.title ?? '确认',
          message: opts.message,
          confirmText: opts.confirmText ?? '确定',
          cancelText: opts.cancelText ?? '取消',
          type: opts.type ?? 'warning',
        },
        resolve,
      }
    })
  }

  function resolveConfirm(value: boolean) {
    if (confirmState.value.resolve) {
      confirmState.value.resolve(value)
    }
    confirmState.value = {
      visible: false,
      options: { message: '' },
      resolve: null,
    }
  }

  return {
    toasts,
    confirmState,
    show,
    remove,
    removeAll,
    success,
    error,
    warning,
    info,
    confirm,
    resolveConfirm,
  }
}
