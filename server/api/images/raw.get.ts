import path from 'node:path'
import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import { getQuery, setResponseHeader, setResponseStatus } from 'h3'
import { rootDir } from '../../config.js'
import { normalizePath } from '../../utils/paths.js'
import { buildNodeAuthHeaders, fail, joinNodePath, listEnabledPicmiNodes, normalizeHttpBase, readResponseBufferWithLimit, requireAuth, usePicmi } from '../../utils/nitro'

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
    const enableLocalStorage = config?.enableLocalStorage === true
    const nodes = Array.isArray(config?.nodes) ? config.nodes : []
    const name = path.posix.basename(relPath)
    const asciiName = name.replace(/[\r\n]/g, '').replace(/"/g, '').replace(/[\\/]/g, '').replace(/[^\x20-\x7E]/g, '_')
    const utf8Name = encodeURIComponent(name).replace(/%20/g, ' ')
    setResponseHeader(event, 'content-disposition', `inline; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`)

    const enabledNodes = listEnabledPicmiNodes(nodes)
    if (!enableLocalStorage && enabledNodes.length > 0) {
      let sawReachable = false
      for (const node of enabledNodes) {
        const base = normalizeHttpBase(node?.address)
        if (!base) continue
        const nodePath = joinNodePath(node?.rootDir || '/', relPath)
        const url = new URL(`/uploads${nodePath}`, base).toString()
        const signal =
          typeof (AbortSignal as any)?.timeout === 'function'
            ? (AbortSignal as any).timeout(15_000)
            : (() => {
                const controller = new AbortController()
                const t = setTimeout(() => controller.abort(), 15_000)
                controller.signal.addEventListener('abort', () => clearTimeout(t), { once: true })
                return controller.signal
              })()
        let res: Response
        try {
          res = await fetch(url, { redirect: 'error', headers: { ...buildNodeAuthHeaders(node) }, signal })
        } catch {
          continue
        }
        sawReachable = true
        if (!res.ok) {
          if (res.status === 404) continue
          continue
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
        return await readResponseBufferWithLimit(res, 1024 * 1024 * 1024)
      }
      if (sawReachable) return fail(event, 404, 40401, '文件不存在')
      return fail(event, 502, 50201, '节点不可达')
    }

    const root = path.resolve(rootDir, picmi.config.storageRoot)
    const target = path.resolve(root, `.${relPath}`)
    const safeRoot = path.resolve(root)
    const safePrefix = safeRoot.endsWith(path.sep) ? safeRoot : `${safeRoot}${path.sep}`
    if (target !== safeRoot && !target.startsWith(safePrefix)) return fail(event, 400, 40001, '参数错误')
    if (!fsSync.existsSync(target)) return fail(event, 404, 40401, '文件不存在')
    const stat = fsSync.statSync(target)
    if (!stat.isFile()) return fail(event, 404, 40401, '文件不存在')
    setResponseStatus(event, 200)
    return await fs.readFile(target)
  } catch {
    return fail(event, 500, 1, '服务异常')
  }
})
