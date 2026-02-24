import { onMounted, onUnmounted, ref } from 'vue'

export interface ResizePanelOptions {
  /** 初始宽度 */
  initialWidth: number
  /** 最小宽度 */
  minWidth?: number
  /** 最大宽度 */
  maxWidth?: number
  /** 宽度变更回调（用于持久化） */
  onWidthChange?: (width: number) => void
}

/**
 * 可拖拽调整宽度的面板 composable
 * 复用 Sidebar 的 resize 逻辑，抽取为通用模式
 */
export function useResizePanel(options: ResizePanelOptions) {
  const {
    initialWidth,
    minWidth = 180,
    maxWidth = 500,
    onWidthChange,
  } = options

  const width = ref(initialWidth)
  const panelRef = ref<HTMLElement | null>(null)
  const isResizing = ref(false)
  const startX = ref(0)
  const startWidth = ref(0)
  let rafId: number | null = null

  function handleMouseDown(e: MouseEvent) {
    isResizing.value = true
    startX.value = e.clientX
    startWidth.value = width.value
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.body.style.pointerEvents = 'none'
    e.preventDefault()
    e.stopPropagation()
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isResizing.value)
      return

    if (rafId !== null)
      cancelAnimationFrame(rafId)

    rafId = requestAnimationFrame(() => {
      const deltaX = e.clientX - startX.value
      const newWidth = startWidth.value + deltaX
      const clamped = Math.max(minWidth, Math.min(maxWidth, newWidth))

      width.value = clamped
      if (panelRef.value) {
        panelRef.value.style.width = `${clamped}px`
      }
      onWidthChange?.(clamped)
      rafId = null
    })
  }

  function handleMouseUp() {
    if (isResizing.value) {
      isResizing.value = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.body.style.pointerEvents = ''
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
    }
  }

  onMounted(() => {
    document.addEventListener('mousemove', handleMouseMove, { passive: false })
    document.addEventListener('mouseup', handleMouseUp)
  })

  onUnmounted(() => {
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
    handleMouseUp()
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
    }
  })

  return {
    width,
    panelRef,
    isResizing,
    handleMouseDown,
  }
}
