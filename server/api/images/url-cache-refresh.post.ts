import { buildNodeAuthHeaders, fail, fetchNodePayload, getAuthUsername, isLoggedIn, joinNodePath, listEnabledPicmiNodes, normalizeHttpBase, ok, readBodySafe, requireAdmin, toRelativePath, usePicmi } from '../../utils/nitro'
import { normalizePath } from '../../utils/paths.js'

const collectFoldersFromNode = async (node: any) => {
  const base = normalizeHttpBase(node?.address)
  if (!base) return []
  const rootPath = normalizePath(node?.rootDir || '/')
  const headers = buildNodeAuthHeaders(node)
  const folders: string[] = []
  const visited = new Set<string>()
  const stack = ['/']
  const maxDirs = 2000

  while (stack.length && folders.length < maxDirs) {
    const rel = stack.pop() as string
    if (visited.has(rel)) continue
    visited.add(rel)
    const url = new URL('/api/images/list', base)
    url.searchParams.set('path', joinNodePath(rootPath, rel))
    const { res, payload } = await fetchNodePayload(url, { headers })
    if (!res || !res.ok || !payload || typeof payload !== 'object' || Number((payload as any).code) !== 0) continue
    const data = (payload && typeof payload === 'object' && 'data' in payload) ? (payload as any).data : null
    const items = Array.isArray(data?.items) ? data.items : []
    for (const item of items) {
      if (item?.type === 'folder') {
        const nextRel = toRelativePath(item?.path, rootPath)
        if (nextRel && !folders.includes(nextRel)) {
          folders.push(nextRel)
          stack.push(nextRel)
        }
      }
    }
  }
  return folders
}

const refreshFolderForNode = async (picmi: any, node: any, folderPath: string) => {
  const nodeId = String(node?.id ?? '')
  const base = normalizeHttpBase(node?.address)
  if (!base) throw new Error('节点地址无效')

  const rootPath = normalizePath(node?.rootDir || '/')
  const nodePath = joinNodePath(rootPath, folderPath)
  const url = new URL('/api/images/list', base)
  url.searchParams.set('path', nodePath)

  const headers = buildNodeAuthHeaders(node)
  const { res, payload } = await fetchNodePayload(url, { headers })

  if (!res || !res.ok || !payload || typeof payload !== 'object' || Number((payload as any).code) !== 0) {
    throw new Error('节点请求失败')
  }

  const data = (payload && typeof payload === 'object' && 'data' in payload) ? (payload as any).data : null
  if (!data) throw new Error('节点响应数据为空')

  const items = Array.isArray(data.items) ? data.items : []
  const nowIso = new Date().toISOString()
  const urlEntries = items
    .filter((it: any) => it?.type !== 'folder')
    .map((it: any) => {
      const rel = toRelativePath(it?.path, rootPath)
      return {
        url: rel,
        fileName: it?.name ?? null,
        fileSize: it?.size ?? null,
        uploadedAt: it?.uploadedAt ?? null,
        updatedAt: nowIso
      }
    })

  await picmi.store.setImageUrlCache(nodeId, folderPath, urlEntries)
  return urlEntries.length
}

export default defineEventHandler(async (event) => {
  const auth = await requireAdmin(event)
  if (auth) return auth

  try {
    const picmi = await usePicmi(event)
    const body = await readBodySafe<{ folderPaths?: string[] }>(event)
    const requestedFolders = body?.folderPaths ?? null

    const config = await picmi.store.getConfig()
    const nodes = Array.isArray(config?.nodes) ? config.nodes : []
    const enabledNodes = listEnabledPicmiNodes(nodes)

    if (enabledNodes.length === 0) {
      return fail(event, 400, 40005, '未配置可用存储节点')
    }

    const operator = getAuthUsername(event) ?? 'unknown'

    let totalSuccess = 0
    let totalFail = 0
    const errors: string[] = []

    for (const node of enabledNodes) {
      const nodeId = String(node?.id ?? '')
      let foldersToRefresh: string[]

      if (requestedFolders && requestedFolders.length > 0) {
        foldersToRefresh = requestedFolders.map((f) => normalizePath(f))
      } else {
        foldersToRefresh = await collectFoldersFromNode(node)
        if (!foldersToRefresh.includes('/')) foldersToRefresh.push('/')
      }

      for (const folderPath of foldersToRefresh) {
        try {
          const count = await refreshFolderForNode(picmi, node, folderPath)
          totalSuccess += 1
          await picmi.store.writeCacheLog(
            operator,
            'refresh',
            nodeId,
            folderPath,
            JSON.stringify({ count })
          )
        } catch (err: any) {
          totalFail += 1
          errors.push(`${nodeId}:${folderPath} - ${err?.message || '未知错误'}`)
        }
      }
    }

    return ok({
      success: totalSuccess,
      fail: totalFail,
      errors: errors.slice(0, 20)
    })
  } catch {
    return fail(event, 500, 1, '服务异常')
  }
})