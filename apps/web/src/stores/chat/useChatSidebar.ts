import { ref } from 'vue'

const STORAGE_KEY_SIDEBAR_WIDTH = 'locus-agent:sidebar-width'

function getStoredSidebarWidth(): number {
  if (typeof window === 'undefined')
    return 220

  try {
    const stored = localStorage.getItem(STORAGE_KEY_SIDEBAR_WIDTH)
    if (stored) {
      const width = Number.parseInt(stored, 10)
      if (!Number.isNaN(width) && width >= 180 && width <= 400)
        return width
    }
  }
  catch (error) {
    console.warn('[chat store] Failed to load sidebar width from localStorage:', error)
  }
  return 220
}

export function useChatSidebar() {
  const isSidebarCollapsed = ref(false)
  const sidebarWidth = ref(getStoredSidebarWidth())

  function toggleSidebar() {
    isSidebarCollapsed.value = !isSidebarCollapsed.value
  }

  function setSidebarWidth(width: number) {
    const minWidth = 180
    const maxWidth = 400
    const clampedWidth = Math.max(minWidth, Math.min(maxWidth, width))
    sidebarWidth.value = clampedWidth

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY_SIDEBAR_WIDTH, String(clampedWidth))
      }
      catch (error) {
        console.warn('[chat store] Failed to save sidebar width to localStorage:', error)
      }
    }
  }

  return {
    isSidebarCollapsed,
    sidebarWidth,
    toggleSidebar,
    setSidebarWidth,
  }
}
