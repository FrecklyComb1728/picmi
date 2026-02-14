import { Router } from 'express'
import fsSync from 'fs'
import path from 'path'
import { requireAuth } from '../middleware/auth.js'
import { expressFail } from '../server/utils/http.js'
import { normalizePath, resolvePath } from '../server/utils/paths.js'
import { rootDir } from '../server/config.js'

const router = Router()

const normalizeHttpBase = (address) => {
  const raw = String(address ?? '').trim()
  if (!raw) return null
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) ? raw : `http://${raw}`
  try {
    const url = new URL(withScheme)
    if (url.username || url.password) return null
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (process.env.NODE_ENV === 'production') {
      const host = url.hostname.toLowerCase()
      if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') return null
    }
    return url.origin
  } catch {
    return null
  }
}

const buildNodeAuthHeaders = (node) => {
  const token = String(node?.password ?? '').trim()
  const headers = {}
  if (token) headers.authorization = `Bearer ${token}`
  return headers
}

const joinNodePath = (root, rel) => {
  const rootNorm = normalizePath(root || '/')
  const relNorm = normalizePath(rel || '/')
  if (rootNorm === '/') return relNorm
  if (relNorm === '/') return rootNorm
  return normalizePath(`${rootNorm}/${relNorm}`)
}

let rrCursor = 0

const normalizeReadStrategy = (value) => {
  const mode = String(value ?? '').trim()
  if (mode === 'random' || mode === 'path-hash' || mode === 'round-robin') return mode
  return 'round-robin'
}

const hashString = (value) => {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash
}

const shuffleNodes = (items) => {
  const list = [...items]
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = list[i]
    list[i] = list[j]
    list[j] = tmp
  }
  return list
}

const listEnabledPicmiNodes = (nodes) => {
  const list = Array.isArray(nodes) ? nodes : []
  return list.filter((n) => n && n.enabled !== false && String(n?.type ?? 'picmi-node') === 'picmi-node')
}

const orderEnabledPicmiNodes = (nodes, strategy, key) => {
  const enabled = listEnabledPicmiNodes(nodes)
  if (enabled.length <= 1) return enabled
  const mode = normalizeReadStrategy(strategy)
  if (mode === 'random') return shuffleNodes(enabled)
  let start = 0
  if (mode === 'path-hash') {
    const raw = String(key ?? '')
    start = raw ? hashString(raw) % enabled.length : 0
  } else {
    start = rrCursor % enabled.length
    rrCursor = (rrCursor + 1) % 2147483647
  }
  return enabled.map((_, index) => enabled[(start + index) % enabled.length])
}

router.get('/raw/:path(*)', requireAuth({
  allow: async (req) => {
    const store = req.app.locals.store
    const config = await store.getConfig()
    if (config?.mediaRequireAuth === false) return true
    const list = await store.getPublicPaths()
    const rel = normalizePath(`/${req.params?.path ?? ''}`)
    if (!rel || rel === '/') return false
    const dir = normalizePath(path.posix.dirname(rel))
    return list.includes(dir)
  }
}), async (req, res, next) => {
  try {
    const store = req.app.locals.store
    const relPath = normalizePath(`/${req.params?.path ?? ''}`)
    if (!relPath || relPath === '/') return expressFail(res, 400, 40001, '参数错误')
    const config = await store.getConfig()
    const nodes = Array.isArray(config?.nodes) ? config.nodes : []
    const enabledNodes = listEnabledPicmiNodes(nodes)
    const orderedNodes = orderEnabledPicmiNodes(enabledNodes, config?.nodeReadStrategy, relPath)
    if (orderedNodes.length > 0) {
      const name = path.posix.basename(relPath)
      const asciiName = name.replace(/[\r\n]/g, '').replace(/"/g, '').replace(/[\\/]/g, '').replace(/[^\x20-\x7E]/g, '_')
      const utf8Name = encodeURIComponent(name).replace(/%20/g, ' ')
      res.setHeader('content-disposition', `inline; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`)
      let sawReachable = false
      for (const node of orderedNodes) {
        const base = normalizeHttpBase(node?.address)
        if (!base) continue
        const nodePath = joinNodePath(node?.rootDir || '/', relPath)
        const url = new URL(`/uploads${nodePath}`, base)
        const controller = new AbortController()
        const t = setTimeout(() => controller.abort(), 15_000)
        let nodeRes
        try {
          nodeRes = await fetch(url, { redirect: 'error', headers: { ...buildNodeAuthHeaders(node) }, signal: controller.signal })
        } catch {
          continue
        } finally {
          clearTimeout(t)
        }
        sawReachable = true
        if (!nodeRes?.ok) {
          if (nodeRes?.status === 404) continue
          continue
        }
        const contentType = nodeRes.headers.get('content-type')
        if (contentType) res.setHeader('content-type', contentType)
        const cacheControl = nodeRes.headers.get('cache-control')
        if (cacheControl) res.setHeader('cache-control', cacheControl)
        const lastModified = nodeRes.headers.get('last-modified')
        if (lastModified) res.setHeader('last-modified', lastModified)
        const etag = nodeRes.headers.get('etag')
        if (etag) res.setHeader('etag', etag)
        const buf = Buffer.from(await nodeRes.arrayBuffer())
        return res.status(200).send(buf)
      }
      if (sawReachable) return expressFail(res, 404, 40401, '文件不存在')
      return expressFail(res, 502, 50201, '节点不可达')
    }

    const root = path.resolve(rootDir, req.app.locals.config.storageRoot)
    const { target } = resolvePath(root, relPath)
    if (!fsSync.existsSync(target)) return expressFail(res, 404, 40401, '文件不存在')
    const stat = fsSync.statSync(target)
    if (!stat.isFile()) return expressFail(res, 404, 40401, '文件不存在')
    const name = path.basename(target)
    const asciiName = name.replace(/[\r\n]/g, '').replace(/"/g, '').replace(/[\\/]/g, '').replace(/[^\x20-\x7E]/g, '_')
    const utf8Name = encodeURIComponent(name).replace(/%20/g, ' ')
    res.setHeader('content-disposition', `inline; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`)
    res.type(path.extname(target))
    return res.sendFile(target)
  } catch (error) {
    next(error)
  }
})

export const basePath = ''
export { router }
