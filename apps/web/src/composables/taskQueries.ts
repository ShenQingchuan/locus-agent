import type { MaybeRefOrGetter } from 'vue'
import { useQuery } from '@pinia/colada'
import { toValue } from 'vue'
import * as api from '@/api/tasks'

export function getTasksListQueryKey(projectKey: string) {
  return ['tasks', projectKey] as const
}

/**
 * 任务列表查询（按 projectKey）
 * staleTime: 15s
 */
export function useTasksListQuery(projectKey: MaybeRefOrGetter<string | undefined>) {
  return useQuery({
    key: () => getTasksListQueryKey(toValue(projectKey)!),
    query: () => api.fetchTasks(toValue(projectKey)!),
    staleTime: 15_000,
    enabled: () => !!toValue(projectKey),
  })
}

/**
 * 单个任务详情查询
 * staleTime: 15s
 */
export function useTaskDetailQuery(taskId: MaybeRefOrGetter<string | null>) {
  return useQuery({
    key: () => ['task', toValue(taskId)!],
    query: () => api.fetchTask(toValue(taskId)!),
    staleTime: 15_000,
    enabled: () => !!toValue(taskId),
  })
}
