import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { setHeader, setResponseStatus } from 'h3'
import { buildNodeAuthHeaders, joinNodePath, listEnabledPicmiNodes, normalizeHttpBase, readResponseBufferWithLimit, requireAuth, usePicmi } from '../../utils/nitro'
import { normalizePath, resolvePath } from '../../utils/paths.js'
import { rootDir } from '../../config.js'

const buildContentDisposition = (name: string) => {
  const safeName = String(name ?? '')
  const asciiName = safeName
    .replace(/[\r\n]/g, '')
    .replace(/"/g, '')
    .replace(/[\\/]/g, '')
    .replace(/[^\x20-\x7E]/g, '_')
  const utf8Name = encodeURIComponent(safeName).replace(/%20/g, ' ')
  return `inline; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`
}

export default defineEventHandler(async (event) => {
  try {
    const picmi = await usePicmi(event)
    const params = (event.context.params || {}) as { path?: string | string[] }
    const rawPath = Array.isArray(params.path) ? params.path.join('/') : String(params.path ?? '')
    const relPath = normalizePath(`/${rawPath}`)
    if (!relPath || relPath === '/') {
      setResponseStatus(event, 400)
      return '参数错误'
    }

    const auth = await requireAuth(event, async () => {
      const config = await picmi.store.getConfig()
      if (config?.mediaRequireAuth === false) return true
      const list = await picmi.store.getPublicPaths()
      const dir = normalizePath(path.posix.dirname(relPath))
      return list.includes(dir)
    })
    if (auth) return auth

    const config = await picmi.store.getConfig()
    const nodes = Array.isArray(config?.nodes) ? config.nodes : []
    const enabledNodes = listEnabledPicmiNodes(nodes)

    if (enabledNodes.length > 0) {
      setHeader(event, 'content-disposition', buildContentDisposition(path.posix.basename(relPath)))
      let sawReachable = false
      for (const node of enabledNodes) {
        const base = normalizeHttpBase(node?.address)
        if (!base) continue
        const nodePath = joinNodePath(node?.rootDir || '/', relPath)
        const url = new URL(`/uploads${nodePath}`, base)
        let nodeRes: Response | null = null
        try {
          nodeRes = await fetch(url, { redirect: 'error', headers: { ...buildNodeAuthHeaders(node) } })
        } catch {
          continue
        }
        sawReachable = true
        if (!nodeRes?.ok) {
          if (nodeRes?.status === 404) continue
          continue
        }

        const contentType = nodeRes.headers.get('content-type')
        if (contentType) setHeader(event, 'content-type', contentType)
        const cacheControl = nodeRes.headers.get('cache-control')
        if (cacheControl) setHeader(event, 'cache-control', cacheControl)
        const lastModified = nodeRes.headers.get('last-modified')
        if (lastModified) setHeader(event, 'last-modified', lastModified)
        const etag = nodeRes.headers.get('etag')
        if (etag) setHeader(event, 'etag', etag)

        return await readResponseBufferWithLimit(nodeRes, 60 * 1024 * 1024)
      }

      if (sawReachable) {
        setResponseStatus(event, 404)
        return '文件不存在'
      }
      setResponseStatus(event, 502)
      return '节点不可达'
    }

    const root = path.resolve(rootDir, picmi.config.storageRoot)
    const target = resolvePath(root, relPath).target
    if (!fsSync.existsSync(target)) {
      setResponseStatus(event, 404)
      return '文件不存在'
    }
    const stat = fsSync.statSync(target)
    if (!stat.isFile()) {
      setResponseStatus(event, 404)
      return '文件不存在'
    }

    setHeader(event, 'content-disposition', buildContentDisposition(path.basename(target)))
    return await fs.readFile(target)
  } catch {
    setResponseStatus(event, 500)
    return '服务异常'
  }
})
