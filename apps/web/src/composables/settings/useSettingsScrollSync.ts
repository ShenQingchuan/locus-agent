import type { SettingsSectionId } from '@/constants/settings'
import { nextTick, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { SETTINGS_SECTIONS } from '@/constants/settings'

const HASH_PREFIX_RE = /^#/

export function useSettingsScrollSync() {
  const router = useRouter()
  const route = useRoute()

  const contentScrollEl = ref<HTMLElement | null>(null)
  const activeSection = ref<SettingsSectionId>('llm')

  const sectionRefs = new Map<SettingsSectionId, HTMLElement>()
  let scrollSyncRaf: number | null = null

  function isSectionId(value: string): value is SettingsSectionId {
    return SETTINGS_SECTIONS.some(section => section.id === value)
  }

  function getSectionFromHash(hash: string): SettingsSectionId | null {
    const value = hash.replace(HASH_PREFIX_RE, '')
    return isSectionId(value) ? value : null
  }

  function setSectionRef(id: SettingsSectionId, el: Element | null): void {
    if (el instanceof HTMLElement)
      sectionRefs.set(id, el)
    else
      sectionRefs.delete(id)
  }

  function cancelScrollSync(): void {
    if (scrollSyncRaf !== null) {
      cancelAnimationFrame(scrollSyncRaf)
      scrollSyncRaf = null
    }
  }

  function syncActiveSectionFromScroll(): void {
    const container = contentScrollEl.value
    if (!container || sectionRefs.size === 0)
      return

    const marker = container.scrollTop + 96
    let nextActive: SettingsSectionId = SETTINGS_SECTIONS[0]?.id ?? 'llm'

    for (const section of SETTINGS_SECTIONS) {
      const el = sectionRefs.get(section.id)
      if (!el)
        continue

      if (el.offsetTop <= marker)
        nextActive = section.id
      else
        break
    }

    activeSection.value = nextActive
  }

  function handleContentScroll(): void {
    cancelScrollSync()
    scrollSyncRaf = requestAnimationFrame(() => {
      syncActiveSectionFromScroll()
      scrollSyncRaf = null
    })
  }

  function scrollToSection(id: SettingsSectionId, behavior: ScrollBehavior = 'smooth'): void {
    const container = contentScrollEl.value
    const section = sectionRefs.get(id)
    if (!container || !section)
      return

    container.scrollTo({
      top: Math.max(0, section.offsetTop - 20),
      behavior,
    })
  }

  async function navigateToSection(id: SettingsSectionId): Promise<void> {
    if (route.hash !== `#${id}`)
      await router.replace({ name: 'SettingsView', hash: `#${id}` })

    await nextTick()
    scrollToSection(id)
  }

  async function syncSectionFromHash(behavior: ScrollBehavior = 'auto'): Promise<void> {
    const target = getSectionFromHash(route.hash) || 'llm'
    await nextTick()
    scrollToSection(target, behavior)
  }

  return {
    contentScrollEl,
    activeSection,
    setSectionRef,
    cancelScrollSync,
    syncActiveSectionFromScroll,
    handleContentScroll,
    scrollToSection,
    navigateToSection,
    syncSectionFromHash,
    getSectionFromHash,
  }
}
