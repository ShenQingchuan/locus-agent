import type { EmitFn } from 'vue'
import type { ToolCallItemEmits, UseToolCallItemProps } from './types'
import { toRefs } from 'vue'
import { useToolCallItemDisplay } from './useToolCallItemDisplay'
import { useToolCallItemShell } from './useToolCallItemShell'

export type { ToolCallItemEmits, UseToolCallItemProps } from './types'

export function useToolCallItem(
  props: UseToolCallItemProps,
  _emit: EmitFn<ToolCallItemEmits>,
) {
  const display = useToolCallItemDisplay(props)
  const shell = useToolCallItemShell(display.terminalOutput)

  return {
    ...toRefs(props),
    ...shell,
    ...display,
  }
}
