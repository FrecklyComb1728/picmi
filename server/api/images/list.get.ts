import path from 'node:path'
import { getQuery } from 'h3'
import { rootDir } from '../../config.js'
import { listEntries } from '../../utils/images-fs'
import { normalizePath } from '../../utils/paths.js'
import { buildNodeAuthHeaders, fail, fetchNodePayload, joinNodePath, normalizeHttpBase, ok, pickEnabledPicmiNode, requireAuth, toRelativePath, usePicmi } from '../../utils/nitro'

export default defineEventHandler(async (event) => {
  try {
    const picmi = await usePicmi(event)
    const query = getQuery(event) as { path?: string }
    const currentPath = normalizePath(query?.path ?? '/')

    const auth = await requireAuth(event, async () => {
      const list = await picmi.store.getPublicPaths()
      return list.includes(currentPath)
    })
    if (auth) return auth

    const config = await picmi.store.getConfig()
    const enableLocalStorage = config?.enableLocalStorage === true
    const nodes = Array.isArray(config?.nodes) ? config.nodes : []
    const hasEnabledNode = nodes.some((node: any) => node && node.enabled !== false)
    if (!enableLocalStorage && hasEnabledNode) {
      const node = pickEnabledPicmiNode(nodes)
      if (!node) return ok({ path: currentPath, items: [], nodeError: '未配置可用存储节点' } as any)
      const base = normalizeHttpBase(node?.address)
      if (!base) return ok({ path: currentPath, items: [], nodeError: '节点地址无效' } as any)

      const url = new URL('/api/images/list', base)
      url.searchParams.set('path', joinNodePath(node?.rootDir || '/', currentPath))
      const { res, payload } = await fetchNodePayload(url, { headers: { ...buildNodeAuthHeaders(node) } })
      if (!res) return ok({ path: currentPath, items: [], nodeError: '节点不可达' } as any)
      if (!payload || typeof payload !== 'object') return ok({ path: currentPath, items: [], nodeError: '节点响应异常' } as any)
      if (Number((payload as any).code) !== 0) {
        return ok({ path: currentPath, items: [], nodeError: String((payload as any).message || '节点响应异常') } as any)
      }
      const data = (payload && typeof payload === 'object' && 'data' in payload) ? (payload as any).data : null
      if (!res.ok) return ok({ path: currentPath, items: [], nodeError: String((payload as any)?.message || `http ${res.status}`) } as any)
      if (!data) return ok({ path: currentPath, items: [], nodeError: '节点响应异常' } as any)

      const rootPath = normalizePath(node?.rootDir || '/')
      const items = Array.isArray(data.items) ? data.items : []
      const mapped = items.map((it: any) => {
        const rel = toRelativePath(it?.path, rootPath)
        if (it?.type === 'image') {
          return {
            ...it,
            path: rel,
            url: `/api/images/raw?path=${encodeURIComponent(rel)}`
          }
        }
        return { ...it, path: rel }
      })
      return ok({ path: toRelativePath(data.path, rootPath), items: mapped })
    }

    const root = path.resolve(rootDir, picmi.config.storageRoot)
    const data = await listEntries(root, currentPath)
    return ok(data)
  } catch {
    return fail(event, 500, 1, '服务异常')
  }
})
