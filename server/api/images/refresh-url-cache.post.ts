import { buildNodeAuthHeaders, fail, fetchNodePayload, getAuthUsername, joinNodePath, listEnabledPicmiNodes, normalizeHttpBase, ok, readBodySafe, requireAdmin, toRelativePath, usePicmi } from '../../utils/nitro'
import { normalizePath } from '../../utils/paths.js'

export default defineEventHandler(async (event) => {
  const auth = await requireAdmin(event)
  if (auth) return auth

  try {
    const picmi = await usePicmi(event)
    const body = await readBodySafe<{ path?: string }>(event)
    const folderPath = normalizePath(body?.path ?? '/')

    const config = await picmi.store.getConfig()
    const nodes = Array.isArray(config?.nodes) ? config.nodes : []
    const enabledNodes = listEnabledPicmiNodes(nodes)

    if (enabledNodes.length === 0) {
      return fail(event, 400, 40005, '未配置可用存储节点')
    }

    const operator = getAuthUsername(event) ?? 'unknown'
    let totalCount = 0

    for (const node of enabledNodes) {
      const nodeId = String(node?.id ?? '')
      const base = normalizeHttpBase(node?.address)
      if (!base) continue

      const rootPath = normalizePath(node?.rootDir || '/')
      const nodePath = joinNodePath(rootPath, folderPath)
      const url = new URL('/api/images/list', base)
      url.searchParams.set('path', nodePath)

      const headers = buildNodeAuthHeaders(node)
      const { res, payload } = await fetchNodePayload(url, { headers })

      if (!res || !res.ok || !payload || typeof payload !== 'object' || Number((payload as any).code) !== 0) continue

      const data = (payload && typeof payload === 'object' && 'data' in payload) ? (payload as any).data : null
      if (!data) continue

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
      totalCount += urlEntries.length

      await picmi.store.writeCacheLog(
        operator,
        'refresh',
        nodeId,
        folderPath,
        JSON.stringify({ count: urlEntries.length })
      )
    }

    return ok({ path: folderPath, count: totalCount })
  } catch {
    return fail(event, 500, 1, '服务异常')
  }
})