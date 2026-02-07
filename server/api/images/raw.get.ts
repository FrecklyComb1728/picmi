import path from 'node:path'
import { getQuery, setResponseHeader, setResponseStatus } from 'h3'
import { normalizePath } from '../../utils/paths.js'
import { buildNodeAuthHeaders, fail, joinNodePath, normalizeHttpBase, pickEnabledPicmiNode, requireAuth, usePicmi } from '../../utils/nitro'

export default defineEventHandler(async (event) => {
  try {
    const picmi = await usePicmi(event)
    const query = getQuery(event) as { path?: string }
    const relPath = normalizePath(query?.path ?? '')
    if (!relPath || relPath === '/') return fail(event, 400, 40001, '参数错误')

    const auth = await requireAuth(event, async () => {
      const list = await picmi.store.getPublicPaths()
      const dir = normalizePath(path.posix.dirname(relPath))
      return list.includes(dir)
    })
    if (auth) return auth

    const config = await picmi.store.getConfig()
    const nodes = Array.isArray(config?.nodes) ? config.nodes : []
    const node = pickEnabledPicmiNode(nodes)
    if (!node) return fail(event, 400, 40002, '未配置可用存储节点')
    const base = normalizeHttpBase(node?.address)
    if (!base) return fail(event, 400, 40002, '节点地址无效')

    const nodePath = joinNodePath(node?.rootDir || '/', relPath)
    const url = new URL(`/uploads${nodePath}`, base).toString()
    const res = await fetch(url, { headers: { ...buildNodeAuthHeaders(node) } })
    if (!res.ok) {
      if (res.status === 404) return fail(event, 404, 40401, '文件不存在')
      return fail(event, 502, 50201, `节点访问失败(${res.status})`)
    }

    const contentType = res.headers.get('content-type')
    if (contentType) setResponseHeader(event, 'content-type', contentType)
    const cacheControl = res.headers.get('cache-control')
    if (cacheControl) setResponseHeader(event, 'cache-control', cacheControl)
    const lastModified = res.headers.get('last-modified')
    if (lastModified) setResponseHeader(event, 'last-modified', lastModified)
    const etag = res.headers.get('etag')
    if (etag) setResponseHeader(event, 'etag', etag)
    setResponseStatus(event, 200)
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return fail(event, 500, 1, '服务异常')
  }
})
