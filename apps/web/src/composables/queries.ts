import { useQuery } from '@pinia/colada'
import { fetchConversation, fetchConversations } from '@/api/chat'

/**
 * 会话列表查询（带缓存）
 * staleTime: 30s - 列表数据 30 秒内不重复请求
 */
export function useConversationListQuery() {
  return useQuery({
    key: ['conversations'],
    query: fetchConversations,
    staleTime: 30_000,
  })
}

/**
 * 单个会话详情查询（带缓存）
 * staleTime: 5min - 会话消息 5 分钟内不重复请求
 */
export function useConversationQuery(id: () => string | null) {
  return useQuery({
    key: () => ['conversation', id()!],
    query: () => fetchConversation(id()!),
    staleTime: 5 * 60 * 1000,
    enabled: () => !!id(),
  })
}
