import type { DropdownItem } from '@univedge/locus-ui'
import { getCodingProviderForParent } from '@univedge/locus-agent-sdk'
import { useToast } from '@univedge/locus-ui'
import { computed, ref } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useModelSettingsStore } from '@/stores/modelSettings'

export function useChatInputMenus(
  showCodingMode: boolean | undefined,
) {
  const chatStore = useChatStore()
  const modelSettings = useModelSettingsStore()
  const toast = useToast()
  const whitelistOpen = ref(false)

  const modeItems = computed<DropdownItem[]>(() => {
    const items: DropdownItem[] = [
      {
        key: 'think',
        label: '思考模式',
        icon: 'i-ri:brain-line',
        active: modelSettings.thinkMode,
      },
      {
        key: 'yolo',
        label: '自由执行',
        icon: 'i-ic:sharp-cruelty-free',
        active: chatStore.yoloMode,
      },
    ]

    const codingMeta = showCodingMode ? getCodingProviderForParent(modelSettings.provider) : undefined
    if (codingMeta) {
      items.push({
        key: `coding-executor:${codingMeta.value}`,
        label: `${codingMeta.label} 编码`,
        icon: codingMeta.parentProvider === 'openai' ? 'i-simple-icons:openai' : 'i-custom:moonshot',
        active: modelSettings.codingExecutor === codingMeta.value,
        separator: true,
      })
    }

    items.push({
      key: 'whitelist',
      label: '工具白名单',
      icon: 'i-carbon-tool-box',
      separator: !codingMeta,
    })

    return items
  })

  const currentPlanItems = computed<DropdownItem[]>(() => {
    if (!chatStore.activeBoundPlanFilename) {
      return [{ key: 'plan:empty', label: '当前暂无计划', disabled: true }]
    }
    return [
      { key: 'plan:open', label: '打开当前计划', icon: 'i-lucide:notebook-pen' },
      { key: 'plan:unbind', label: '解绑计划', icon: 'i-carbon:unlink', separator: true },
    ]
  })

  const codingModeItems = computed<DropdownItem[]>(() => [
    {
      key: 'coding:build',
      label: 'Build',
      icon: 'i-streamline-sharp:loop-1-solid',
    },
    {
      key: 'coding:plan',
      label: 'Plan',
      icon: 'i-icon-park-solid:guide-board',
    },
    {
      key: 'coding:hint',
      label: 'Shift + Tab 切换模式',
      icon: 'i-carbon-keyboard',
      separator: true,
      disabled: true,
    },
  ])

  const codingModeButtonClass = computed(() => {
    if (chatStore.codingMode === 'build') {
      return 'border border-blue-300/70 bg-blue-500/10 text-blue-700 hover:bg-blue-500/15 dark:text-blue-300 dark:border-blue-400/35'
    }
    return 'border border-amber-300/70 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300 dark:border-amber-400/35'
  })

  const currentCodingModeItem = computed(() => {
    const key = chatStore.codingMode === 'build' ? 'coding:build' : 'coding:plan'
    return codingModeItems.value.find(item => item.key === key)
  })

  const codingModeButtonIcon = computed(() => currentCodingModeItem.value?.icon ?? 'i-carbon:code')
  const codingModeButtonLabel = computed(() => currentCodingModeItem.value?.label ?? (chatStore.codingMode === 'build' ? 'Build' : 'Plan'))

  function handleModeSelect(key: string) {
    if (key === 'think') {
      chatStore.toggleThinkMode()
    }
    else if (key === 'yolo') {
      chatStore.toggleYoloMode()
    }
    else if (key === 'whitelist') {
      whitelistOpen.value = !whitelistOpen.value
    }
    else if (key.startsWith('coding-executor:')) {
      const provider = key.replace('coding-executor:', '')
      modelSettings.codingExecutor = modelSettings.codingExecutor === provider ? null : provider as typeof modelSettings.codingExecutor
    }
  }

  function handleCurrentPlanSelect(key: string) {
    if (key === 'plan:empty')
      return
    if (key === 'plan:unbind') {
      chatStore.unbindPlan()
      return
    }
    if (key === 'plan:open') {
      const opened = chatStore.openCurrentPlan()
      if (!opened) {
        toast.info('当前会话暂无可打开的计划')
      }
    }
  }

  function handleCodingModeSelect(key: string) {
    if (key === 'coding:build')
      chatStore.setCodingMode('build')
    else if (key === 'coding:plan')
      chatStore.setCodingMode('plan')
  }

  return {
    whitelistOpen,
    modeItems,
    currentPlanItems,
    codingModeItems,
    codingModeButtonClass,
    codingModeButtonIcon,
    codingModeButtonLabel,
    handleModeSelect,
    handleCurrentPlanSelect,
    handleCodingModeSelect,
  }
}
