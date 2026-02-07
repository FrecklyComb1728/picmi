import path from 'node:path'
import fsSync from 'node:fs'
import { getQuery } from 'h3'
import { rootDir } from '../../config.js'
import { normalizePath, resolvePath } from '../../utils/paths.js'
import { buildNodeAuthHeaders, fail, fetchNodePayload, joinNodePath, normalizeHttpBase, ok, pickEnabledPicmiNode, requireAuth, usePicmi } from '../../utils/nitro'

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
    const hasEnabledNode = nodes.some((node: any) => node && node.enabled !== false)
    if (!enableLocalStorage && hasEnabledNode) {
      const node = pickEnabledPicmiNode(nodes)
      if (!node) return fail(event, 400, 40002, '未配置可用存储节点')
      const base = normalizeHttpBase(node?.address)
      if (!base) return fail(event, 400, 40002, '节点地址无效')
      const url = new URL('/api/images/exists', base)
      url.searchParams.set('path', joinNodePath(node?.rootDir || '/', currentPath))
      url.searchParams.set('filename', filename)
      const { res, payload } = await fetchNodePayload(url, { headers: { ...buildNodeAuthHeaders(node) } })
      if (!res) return fail(event, 502, 50201, '节点不可达')
      if (!payload || typeof payload !== 'object') return fail(event, 502, 50201, '节点响应异常')
      if (!res.ok) return fail(event, res.status, Number((payload as any).code) || 1, String((payload as any).message || `http ${res.status}`))
      return payload as any
    }

    const root = path.resolve(rootDir, picmi.config.storageRoot)
    const { target } = resolvePath(root, path.posix.join(currentPath, filename))
    const exists = fsSync.existsSync(target)
    return ok({ exists })
  } catch {
    return fail(event, 500, 1, '服务异常')
  }
})
