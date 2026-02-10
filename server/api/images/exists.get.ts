import path from 'node:path'
import fsSync from 'node:fs'
import { getQuery } from 'h3'
import { rootDir } from '../../config.js'
import { normalizePath, resolvePath } from '../../utils/paths.js'
import { buildNodeAuthHeaders, fail, fetchNodePayload, joinNodePath, listEnabledPicmiNodes, normalizeHttpBase, ok, requireAuth, usePicmi } from '../../utils/nitro'

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event)
  if (auth) return auth

  try {
    const picmi = await usePicmi(event)
    const query = getQuery(event) as { path?: string; filename?: string }
    const currentPath = normalizePath(query?.path ?? '/')
    const filename = String(query?.filename ?? '')
    if (!filename) return fail(event, 400, 40001, '参数错误')

    const config = await picmi.store.getConfig()
    const enableLocalStorage = config?.enableLocalStorage === true
    const nodes = Array.isArray(config?.nodes) ? config.nodes : []
    const enabledNodes = listEnabledPicmiNodes(nodes)
    if (!enableLocalStorage && enabledNodes.length > 0) {
      let okCount = 0
      for (const node of enabledNodes) {
        const base = normalizeHttpBase(node?.address)
        if (!base) continue
        const url = new URL('/api/images/exists', base)
        url.searchParams.set('path', joinNodePath(node?.rootDir || '/', currentPath))
        url.searchParams.set('filename', filename)
        const { res, payload } = await fetchNodePayload(url, { headers: { ...buildNodeAuthHeaders(node) } })
        if (!res || !payload || typeof payload !== 'object' || !res.ok) continue
        okCount += 1
        const data = (payload && typeof payload === 'object' && 'data' in payload) ? (payload as any).data : null
        const exists = Boolean(data?.exists)
        if (exists) return ok({ exists: true })
      }
      if (okCount > 0) return ok({ exists: false })
      return fail(event, 502, 50201, '节点不可达')
    }

    const root = path.resolve(rootDir, picmi.config.storageRoot)
    const { target } = resolvePath(root, path.posix.join(currentPath, filename))
    const exists = fsSync.existsSync(target)
    return ok({ exists })
  } catch {
    return fail(event, 500, 1, '服务异常')
  }
})
