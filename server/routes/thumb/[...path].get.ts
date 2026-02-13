import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { getQuery, setHeader, setResponseStatus } from 'h3'
import { rootDir } from '../../config.js'
import { buildNodeAuthHeaders, joinNodePath, listEnabledPicmiNodes, normalizeHttpBase, readResponseBufferWithLimit, requireAuth, usePicmi } from '../../utils/nitro.js'
import { normalizePath, resolvePath } from '../../utils/paths.js'

const mimeByExt = (ext: string) => {
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.avif':
      return 'image/avif'
    case '.bmp':
      return 'image/bmp'
    default:
      return 'application/octet-stream'
  }
}

const buildThumbRelPath = (relPath: string) => {
  const ext = path.posix.extname(relPath).toLowerCase()
  if (ext === '.svg') return normalizePath(`/.cache/thumbnail${relPath}`)
  return normalizePath(`/.cache/thumbnail${relPath}.avif`)
}

const ensureDir = async (dir: string) => {
  await fs.mkdir(dir, { recursive: true })
}

const ensureThumbLocal = async (root: string, relPath: string, maxWidth: number) => {
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
    const enableLocalStorage = config?.enableLocalStorage === true
    const nodes = Array.isArray(config?.nodes) ? config.nodes : []
    const enabledNodes = listEnabledPicmiNodes(nodes)
    const thumbnailProcessing = String(config?.thumbnailProcessing ?? 'node').trim() === 'backend' ? 'backend' : 'node'
    const defaultMaxBytes = Math.max(64 * 1024, Math.min(10 * 1024 * 1024, Math.floor(Number(config?.thumbnailMaxBytes ?? 1 * 1024 * 1024) || 1 * 1024 * 1024)))
    const defaultMaxWidth = Math.max(1024, Math.min(2048, Math.floor(Number(config?.thumbnailMaxWidth ?? 1600) || 1600)))
    const thumbSkipBelowBytes = Math.max(0, Math.min(50 * 1024 * 1024, Math.floor(Number(config?.thumbnailSkipBelowBytes ?? 0) || 0)))
    const query = getQuery(event) as { maxBytes?: string; maxWidth?: string }
    const maxBytesRaw = Number(query?.maxBytes)
    const maxBytes = Number.isFinite(maxBytesRaw) ? Math.max(64 * 1024, Math.min(10 * 1024 * 1024, Math.floor(maxBytesRaw))) : defaultMaxBytes
    const maxWidthRaw = Number(query?.maxWidth)
    const maxWidth = Number.isFinite(maxWidthRaw) ? Math.max(1024, Math.min(2048, Math.floor(maxWidthRaw))) : defaultMaxWidth

    if (!enableLocalStorage && enabledNodes.length > 0) {
      let sawReachable = false
      for (const node of enabledNodes) {
        const base = normalizeHttpBase(node?.address)
        if (!base) continue
        const nodePath = joinNodePath(node?.rootDir || '/', relPath)

        if (thumbnailProcessing === 'node' && thumbSkipBelowBytes > 0) {
          const rawUrl = new URL(`/uploads${nodePath}`, base)
          let headRes: Response | null = null
          try {
            headRes = await fetch(rawUrl, { method: 'HEAD', redirect: 'error', headers: { ...buildNodeAuthHeaders(node) } })
          } catch {}
          if (headRes?.ok) {
            const len = Number(headRes.headers.get('content-length') || 0)
            if (Number.isFinite(len) && len > 0 && len <= thumbSkipBelowBytes) {
              let rawRes: Response | null = null
              try {
                rawRes = await fetch(rawUrl, { redirect: 'error', headers: { ...buildNodeAuthHeaders(node) } })
              } catch {
                rawRes = null
              }
              if (rawRes?.ok) {
                const contentType = rawRes.headers.get('content-type')
                if (contentType) setHeader(event, 'content-type', contentType)
                const cacheControl = rawRes.headers.get('cache-control')
                if (cacheControl) setHeader(event, 'cache-control', cacheControl)
                const lastModified = rawRes.headers.get('last-modified')
                if (lastModified) setHeader(event, 'last-modified', lastModified)
                const etag = rawRes.headers.get('etag')
                if (etag) setHeader(event, 'etag', etag)
                return await readResponseBufferWithLimit(rawRes, 60 * 1024 * 1024)
              }
            }
          }
        }

        const url = new URL('/api/images/thumb', base)
        url.searchParams.set('path', nodePath)
        url.searchParams.set('maxBytes', String(maxBytes))
        url.searchParams.set('maxWidth', String(maxWidth))
        if (thumbnailProcessing === 'backend') url.searchParams.set('noGenerate', '1')
        let nodeRes: Response | null = null
        try {
          nodeRes = await fetch(url, { redirect: 'error', headers: { ...buildNodeAuthHeaders(node) } })
        } catch {
          continue
        }
        sawReachable = true
        if (!nodeRes?.ok) {
          if (thumbnailProcessing === 'backend' && nodeRes?.status === 404) {
            const rawUrl = new URL(`/uploads${nodePath}`, base)
            let rawRes: Response | null = null
            try {
              rawRes = await fetch(rawUrl, { redirect: 'error', headers: { ...buildNodeAuthHeaders(node) } })
            } catch {
              continue
            }
            if (!rawRes?.ok) continue
            const contentType = rawRes.headers.get('content-type')
            if (contentType) setHeader(event, 'content-type', contentType)
            const cacheControl = rawRes.headers.get('cache-control')
            if (cacheControl) setHeader(event, 'cache-control', cacheControl)
            const lastModified = rawRes.headers.get('last-modified')
            if (lastModified) setHeader(event, 'last-modified', lastModified)
            const etag = rawRes.headers.get('etag')
            if (etag) setHeader(event, 'etag', etag)
            return await readResponseBufferWithLimit(rawRes, 60 * 1024 * 1024)
          }
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
        const buf = await readResponseBufferWithLimit(nodeRes, Math.max(1024 * 1024, maxBytes * 3))
        return buf
      }
      if (sawReachable) {
        setResponseStatus(event, 404)
        return '文件不存在'
      }
      setResponseStatus(event, 502)
      return '节点不可达'
    }

    const root = path.resolve(rootDir, picmi.config.storageRoot)
    if (thumbSkipBelowBytes > 0) {
      const src = resolvePath(root, relPath).target
      if (fsSync.existsSync(src)) {
        const stat = fsSync.statSync(src)
        if (stat.isFile() && stat.size <= thumbSkipBelowBytes) {
          setHeader(event, 'content-type', mimeByExt(path.posix.extname(relPath).toLowerCase()))
          setHeader(event, 'cache-control', 'no-store')
          return await fs.readFile(src)
        }
      }
    }
    const thumbAbs = await ensureThumbLocal(root, relPath, maxWidth)
    if (!thumbAbs) {
      setResponseStatus(event, 404)
      return '文件不存在'
    }

    const ext = path.posix.extname(relPath).toLowerCase()
    if (ext === '.svg') setHeader(event, 'content-type', 'image/svg+xml')
    else setHeader(event, 'content-type', 'image/avif')
    setHeader(event, 'cache-control', 'no-store')
    return await fs.readFile(thumbAbs)
  } catch {
    setResponseStatus(event, 500)
    return '服务异常'
  }
})
