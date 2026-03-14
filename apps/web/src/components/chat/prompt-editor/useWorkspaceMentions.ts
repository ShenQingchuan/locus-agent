import type { WorkspaceTreeNode } from '@univedge/locus-agent-sdk'
import type { MaybeRef } from 'vue'
import type { WorkspaceMentionItem } from './types'
import { onMounted, ref, toValue, watch } from 'vue'
import { fetchWorkspaceRoots, openWorkspace } from '@/api/workspace'

function normalizeSearchPath(path: string): string {
  return path.replaceAll('\\', '/')
}

const RE_TRIM_TRAILING_SLASHES = /[\\/]+$/g
function buildAbsolutePath(rootPath: string, relativePath: string): string {
  const trimmedRoot = rootPath.replace(RE_TRIM_TRAILING_SLASHES, '')
  if (!relativePath)
    return trimmedRoot
  return normalizeSearchPath(`${trimmedRoot}/${relativePath}`)
}

function basenameOfPath(path: string, isDir: boolean): string {
  const lastSlash = path.lastIndexOf('/')
  const name = lastSlash >= 0 ? path.slice(lastSlash + 1) : path
  return isDir ? `${name}/` : name
}

function flattenWorkspaceTree(rootPath: string, nodes: WorkspaceTreeNode[], items: WorkspaceMentionItem[] = []): WorkspaceMentionItem[] {
  for (const node of nodes) {
    const absolutePath = buildAbsolutePath(rootPath, node.id)
    const isDir = node.type === 'directory'
    items.push({
      id: node.id,
      label: node.id,
      basename: basenameOfPath(node.id, isDir),
      absolutePath,
      searchText: `${node.id} ${absolutePath}`,
      kind: isDir ? 'dir-mention' : 'file-mention',
      icon: isDir ? 'i-carbon-folder' : 'i-carbon-document',
      displayPath: isDir ? `${node.id}/` : node.id,
    })

    if (node.children?.length)
      flattenWorkspaceTree(rootPath, node.children, items)
  }

  return items
}

export function useWorkspaceMentions(workspaceRoot?: MaybeRef<string | undefined>) {
  const items = ref<WorkspaceMentionItem[]>([])
  const isLoading = ref(false)
  const isTruncated = ref(false)
  const rootPath = ref('')

  async function reload() {
    isLoading.value = true
    try {
      let root = toValue(workspaceRoot)?.trim()
      if (!root) {
        const roots = await fetchWorkspaceRoots()
        root = roots.defaultPath || roots.roots[0]?.path || ''
      }

      if (!root) {
        items.value = []
        isTruncated.value = false
        rootPath.value = ''
        return
      }

      const result = await openWorkspace(root)
      rootPath.value = result.rootPath
      items.value = flattenWorkspaceTree(result.rootPath, result.tree)
      isTruncated.value = result.truncated
    }
    catch {
      items.value = []
      isTruncated.value = false
      rootPath.value = ''
    }
    finally {
      isLoading.value = false
    }
  }

  onMounted(reload)
  watch(() => toValue(workspaceRoot), reload)

  return {
    items,
    isLoading,
    isTruncated,
    rootPath,
    reload,
  }
}
