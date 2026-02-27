import { useStorage } from '@vueuse/core'

const STORAGE_KEY = 'memories-sidebar-collapsed'

/**
 * Persisted sidebar collapse state for Memories view.
 */
export function useMemoriesSidebar() {
  const sidebarCollapsed = useStorage(STORAGE_KEY, false)

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  return {
    sidebarCollapsed,
    toggleSidebar,
  }
}
