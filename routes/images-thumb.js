import { Router } from 'express'
import fsSync from 'fs'
import fs from 'fs/promises'
import path from 'path'
import sharp from 'sharp'
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

const listEnabledPicmiNodes = (nodes) => {
  const list = Array.isArray(nodes) ? nodes : []
  return list.filter((n) => n && n.enabled !== false && String(n?.type ?? 'picmi-node') === 'picmi-node')
}

const buildThumbRelPath = (relPath) => {
  const ext = path.posix.extname(relPath).toLowerCase()
  if (ext === '.svg') return normalizePath(`/.cache/thumbnail${relPath}`)
  return normalizePath(`/.cache/thumbnail${relPath}.avif`)
}

const ensureDir = async (dir) => {
  await fs.mkdir(dir, { recursive: true })
}

const ensureThumbLocal = async (root, relPath, maxWidth) => {
  const src = resolvePath(root, relPath).target
  if (!fsSync.existsSync(src)) return null
  const stat = fsSync.statSync(src)
  if (!stat.isFile()) return null

  const thumbRelPath = buildThumbRelPath(relPath)
  const thumb = resolvePath(root, thumbRelPath).target
  if (fsSync.existsSync(thumb)) return thumb

  await ensureDir(path.dirname(thumb))
  const ext = path.posix.extname(relPath).toLowerCase()
  if (ext === '.svg') {
    const tmp = `${thumb}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`
    await fs.copyFile(src, tmp)
    await fs.rename(tmp, thumb).catch(async () => {
      await fs.unlink(tmp).catch(() => {})
    })
    return thumb
  }

  const targetWidth = Math.max(1024, Math.floor(Number(maxWidth) || 1600))
  const targetHeight = targetWidth
  const quality = 85
  const effort = 2
  const meta = await sharp(src, { failOnError: false }).metadata()
  const metaWidth = Number(meta.width)
  const metaHeight = Number(meta.height)
  const baseWidth = Number.isFinite(metaWidth) && metaWidth > 0 ? metaWidth : targetWidth
  const baseHeight = Number.isFinite(metaHeight) && metaHeight > 0 ? metaHeight : targetHeight
  let scale = 1
  if (baseWidth > targetWidth) scale = targetWidth / baseWidth
  else if (baseHeight > targetHeight) scale = targetHeight / baseHeight
  const newWidth = Math.floor(baseWidth * scale)
  const newHeight = Math.floor(baseHeight * scale)
  const out = await sharp(src, { failOnError: false })
    .resize({ width: newWidth, height: newHeight, fit: 'inside', withoutEnlargement: true })
    .avif({ quality, effort })
    .toBuffer()
  const tmp = `${thumb}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`
  await fs.writeFile(tmp, out)
  await fs.rename(tmp, thumb).catch(async () => {
    await fs.unlink(tmp).catch(() => {})
  })
  return thumb
}

router.get('/thumb/:path(*)', requireAuth({
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
    const enableLocalStorage = config?.enableLocalStorage === true
    const nodes = Array.isArray(config?.nodes) ? config.nodes : []
    const enabledNodes = listEnabledPicmiNodes(nodes)
    const thumbnailProcessing = String(config?.thumbnailProcessing ?? 'node').trim() === 'backend' ? 'backend' : 'node'
    const defaultMaxBytes = Math.max(64 * 1024, Math.min(10 * 1024 * 1024, Math.floor(Number(config?.thumbnailMaxBytes ?? 1 * 1024 * 1024) || 1 * 1024 * 1024)))
    const defaultMaxWidth = Math.max(1024, Math.min(2048, Math.floor(Number(config?.thumbnailMaxWidth ?? 1600) || 1600)))
    const thumbSkipBelowBytes = Math.max(0, Math.min(50 * 1024 * 1024, Math.floor(Number(config?.thumbnailSkipBelowBytes ?? 0) || 0)))
    const maxBytesRaw = Number(req.query?.maxBytes)
    const maxBytes = Number.isFinite(maxBytesRaw) ? Math.max(64 * 1024, Math.min(10 * 1024 * 1024, Math.floor(maxBytesRaw))) : defaultMaxBytes
    const maxWidthRaw = Number(req.query?.maxWidth)
    const maxWidth = Number.isFinite(maxWidthRaw) ? Math.max(1024, Math.min(2048, Math.floor(maxWidthRaw))) : defaultMaxWidth

    if (!enableLocalStorage && enabledNodes.length > 0) {
      let sawReachable = false
      for (const node of enabledNodes) {
        const base = normalizeHttpBase(node?.address)
        if (!base) continue
        const nodePath = joinNodePath(node?.rootDir || '/', relPath)

        if (thumbnailProcessing === 'node' && thumbSkipBelowBytes > 0) {
          const rawUrl = new URL(`/uploads${nodePath}`, base)
          const controller0 = new AbortController()
          const t0 = setTimeout(() => controller0.abort(), 10_000)
          let headRes
          try {
            headRes = await fetch(rawUrl, { method: 'HEAD', redirect: 'error', headers: { ...buildNodeAuthHeaders(node) }, signal: controller0.signal })
          } catch {
            headRes = null
          } finally {
            clearTimeout(t0)
          }
          if (headRes?.ok) {
            const len = Number(headRes.headers.get('content-length') || 0)
            if (Number.isFinite(len) && len > 0 && len <= thumbSkipBelowBytes) {
              const controller1 = new AbortController()
              const t1 = setTimeout(() => controller1.abort(), 15_000)
              let rawRes
              try {
                rawRes = await fetch(rawUrl, { redirect: 'error', headers: { ...buildNodeAuthHeaders(node) }, signal: controller1.signal })
              } catch {
                rawRes = null
              } finally {
                clearTimeout(t1)
              }
              if (rawRes?.ok) {
                const contentType = rawRes.headers.get('content-type')
                if (contentType) res.setHeader('content-type', contentType)
                const cacheControl = rawRes.headers.get('cache-control')
                if (cacheControl) res.setHeader('cache-control', cacheControl)
                const lastModified = rawRes.headers.get('last-modified')
                if (lastModified) res.setHeader('last-modified', lastModified)
                const etag = rawRes.headers.get('etag')
                if (etag) res.setHeader('etag', etag)
                const buf = Buffer.from(await rawRes.arrayBuffer())
                return res.status(200).send(buf)
              }
            }
          }
        }

        const url = new URL('/api/images/thumb', base)
        url.searchParams.set('path', nodePath)
        url.searchParams.set('maxBytes', String(maxBytes))
        url.searchParams.set('maxWidth', String(maxWidth))
        if (thumbnailProcessing === 'backend') url.searchParams.set('noGenerate', '1')
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
          if (thumbnailProcessing === 'backend' && nodeRes?.status === 404) {
            const rawUrl = new URL(`/uploads${nodePath}`, base)
            const controller2 = new AbortController()
            const t2 = setTimeout(() => controller2.abort(), 15_000)
            let rawRes
            try {
              rawRes = await fetch(rawUrl, { redirect: 'error', headers: { ...buildNodeAuthHeaders(node) }, signal: controller2.signal })
            } catch {
              continue
            } finally {
              clearTimeout(t2)
            }
            if (!rawRes?.ok) continue
            const contentType = rawRes.headers.get('content-type')
            if (contentType) res.setHeader('content-type', contentType)
            const cacheControl = rawRes.headers.get('cache-control')
            if (cacheControl) res.setHeader('cache-control', cacheControl)
            const lastModified = rawRes.headers.get('last-modified')
            if (lastModified) res.setHeader('last-modified', lastModified)
            const etag = rawRes.headers.get('etag')
            if (etag) res.setHeader('etag', etag)
            const buf = Buffer.from(await rawRes.arrayBuffer())
            return res.status(200).send(buf)
          }
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
    if (thumbSkipBelowBytes > 0) {
      const src = resolvePath(root, relPath).target
      if (fsSync.existsSync(src)) {
        const stat = fsSync.statSync(src)
        if (stat.isFile() && stat.size <= thumbSkipBelowBytes) {
          res.type(path.posix.extname(relPath))
          return res.sendFile(src)
        }
      }
    }
    const thumbAbs = await ensureThumbLocal(root, relPath, maxWidth, maxBytes)
    if (!thumbAbs) return expressFail(res, 404, 40401, '文件不存在')
    const ext = path.posix.extname(relPath).toLowerCase()
    if (ext === '.svg') res.type('image/svg+xml')
    else res.type('image/avif')
    return res.sendFile(thumbAbs)
  } catch (error) {
    next(error)
  }
})

export const basePath = ''
export { router }
