import { Router } from 'express'
import multer from 'multer'
import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import { requireAuth } from '../middleware/auth.js'
import { expressOk, expressFail } from '../server/utils/http.js'
import { isImageFileName, normalizeMaxUploadBytesBasic as normalizeMaxUploadBytes, normalizePath, normalizeUploadFileName, resolvePath, sanitizeSingleNameBasic as sanitizeSingleName, validateImageUpload } from '../server/utils/paths.js'
import { rootDir } from '../server/config.js'

const router = Router()

const formatNumber = (n, digits = 1) => {
  const s = Number(n).toFixed(digits)
  return s.endsWith('.0') ? s.slice(0, -2) : s
}

const formatBytes = (bytes) => {
  const kb = Number(bytes) / 1024
  if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${formatNumber(mb)} MB`
  const gb = mb / 1024
  return `${formatNumber(gb)} GB`
}

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

const toRelativePath = (fullPath, rootPath) => {
  const fullNorm = normalizePath(fullPath || '/')
  const rootNorm = normalizePath(rootPath || '/')
  if (rootNorm === '/') return fullNorm
  if (fullNorm === rootNorm) return '/'
  if (fullNorm.startsWith(`${rootNorm}/`)) return normalizePath(fullNorm.slice(rootNorm.length))
  return fullNorm
}

const pickEnabledPicmiNode = (nodes) => {
  const list = Array.isArray(nodes) ? nodes : []
  const enabled = list.filter((n) => n && n.enabled !== false)
  return enabled.find((n) => String(n?.type ?? 'picmi-node') === 'picmi-node') ?? null
}

const listEnabledPicmiNodes = (nodes) => {
  const list = Array.isArray(nodes) ? nodes : []
  return list.filter((n) => n && n.enabled !== false && String(n?.type ?? 'picmi-node') === 'picmi-node')
}

const encodePathForRaw = (relPath) => {
  return String(relPath)
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/')
}

const buildRawUrl = (relPath) => `/raw/${encodePathForRaw(relPath)}`
const buildThumbUrl = (relPath) => `/thumb/${encodePathForRaw(relPath)}`

const fetchNodePayload = async (url, options, timeoutMs = 15_000) => {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { redirect: 'error', ...options, signal: controller.signal })
    const payload = await res.json().catch(() => null)
    return { res, payload, error: null }
  } catch (error) {
    return { res: null, payload: null, error }
  } finally {
    clearTimeout(t)
  }
}

const uploadSingle = async (req, res, next) => {
  try {
    const store = req.app.locals.store
    const config = await store.getConfig()
    const maxUploadBytes = normalizeMaxUploadBytes(config?.maxUploadBytes)
    const handler = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxUploadBytes } }).single('file')
    return handler(req, res, (error) => {
      if (error?.code === 'LIMIT_FILE_SIZE') return expressFail(res, 413, 41301, `文件过大（最大 ${formatBytes(maxUploadBytes)}）`)
      if (error) return next(error)
      return next()
    })
  } catch (error) {
    next(error)
  }
}

const listEntries = async (root, currentPath) => {
  const { target, normalized } = resolvePath(root, currentPath)
  if (!fsSync.existsSync(target)) return { path: normalized, items: [] }
  const stat = await fs.stat(target)
  if (!stat.isDirectory()) return { path: normalized, items: [] }

  const entries = await fs.readdir(target, { withFileTypes: true })
  const items = []

  for (const entry of entries) {
    const entryPath = path.join(target, entry.name)
    const relative = normalized.replace(/^\/+/, '')
    if (entry.isDirectory()) {
      items.push({ type: 'folder', name: entry.name, path: normalizePath(path.posix.join(normalized, entry.name)) })
    } else if (entry.isFile()) {
      const info = await fs.stat(entryPath)
      const type = isImageFileName(entry.name) ? 'image' : 'file'
      const relPath = normalizePath(path.posix.join(normalized, entry.name))
      items.push({
        type,
        name: entry.name,
        path: relPath,
        url: buildRawUrl(relPath),
        thumbUrl: type === 'image' ? buildThumbUrl(relPath) : undefined,
        size: info.size,
        uploadedAt: info.mtime.toISOString()
      })
    }
  }

  return { path: normalized, items }
}

const ensureDir = async (dir) => {
  await fs.mkdir(dir, { recursive: true })
}

const copyRecursive = async (from, to) => {
  const stat = await fs.stat(from)
  if (stat.isDirectory()) {
    await ensureDir(to)
    const items = await fs.readdir(from)
    for (const item of items) await copyRecursive(path.join(from, item), path.join(to, item))
    return
  }
  await ensureDir(path.dirname(to))
  await fs.copyFile(from, to)
}

const removeRecursive = async (target) => {
  if (!fsSync.existsSync(target)) return
  const stat = await fs.stat(target)
  if (stat.isDirectory()) {
    const items = await fs.readdir(target)
    for (const item of items) await removeRecursive(path.join(target, item))
    await fs.rmdir(target)
    return
  }
  await fs.unlink(target)
}

const hasStorageAvailable = async (store) => {
  const config = await store.getConfig()
  const enableLocalStorage = config?.enableLocalStorage === true
  const nodes = Array.isArray(config?.nodes) ? config.nodes : []
  const hasEnabledPicmiNode = nodes.some((node) => node && node.enabled !== false && String(node?.type ?? 'picmi-node') === 'picmi-node')
  return enableLocalStorage || hasEnabledPicmiNode
}

const pushTop = (arr, item, limit) => {
  arr.push(item)
  arr.sort((a, b) => String(b?.uploadedAt ?? '').localeCompare(String(a?.uploadedAt ?? '')))
  if (arr.length > limit) arr.length = limit
}

const scanRecentLocal = async (root, limit) => {
  const top = []
  const stack = [{ dir: root, rel: '/' }]
  let scannedFiles = 0
  let scannedDirs = 0
  const maxFiles = 20000
  const maxDirs = 4000

  while (stack.length && scannedFiles < maxFiles && scannedDirs < maxDirs) {
    const current = stack.pop()
    scannedDirs += 1
    let entries = []
    try {
      entries = await fs.readdir(current.dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = path.join(current.dir, entry.name)
      if (entry.isDirectory()) {
        stack.push({ dir: full, rel: normalizePath(path.posix.join(current.rel, entry.name)) })
        continue
      }
      if (!entry.isFile()) continue
      scannedFiles += 1
      if (scannedFiles > maxFiles) break
      try {
        const info = await fs.stat(full)
        const relPath = normalizePath(path.posix.join(current.rel, entry.name))
        pushTop(top, {
          type: 'image',
          name: entry.name,
          path: relPath,
          url: buildRawUrl(relPath),
          thumbUrl: buildThumbUrl(relPath),
          size: info.size,
          uploadedAt: info.mtime.toISOString()
        }, limit)
      } catch {}
    }
  }

  return { items: top, truncated: scannedFiles >= maxFiles || scannedDirs >= maxDirs }
}

const scanRecentNode = async (node, rootPath, limit) => {
  const top = []
  const base = normalizeHttpBase(node?.address)
  if (!base) throw new Error('invalid node')
  const headers = buildNodeAuthHeaders(node)
  const visited = new Set()
  const stack = ['/']
  const maxDirs = 2000
  const maxItems = 50000
  let scannedDirs = 0
  let scannedItems = 0

  while (stack.length && scannedDirs < maxDirs && scannedItems < maxItems) {
    const rel = stack.pop()
    if (visited.has(rel)) continue
    visited.add(rel)
    scannedDirs += 1
    const url = new URL('/api/images/list', base)
    url.searchParams.set('path', joinNodePath(rootPath, rel))
    const { res, payload } = await fetchNodePayload(url, { headers })
    if (!res || !res.ok) continue
    const data = payload && typeof payload === 'object' && 'data' in payload ? payload.data : null
    const items = Array.isArray(data?.items) ? data.items : []
    for (const item of items) {
      if (item?.type === 'folder') {
        const nextRel = toRelativePath(item?.path, rootPath)
        stack.push(nextRel)
        continue
      }
      if (item?.type !== 'image') continue
      scannedItems += 1
      if (scannedItems > maxItems) break
      const relPath = toRelativePath(item?.path, rootPath)
      const type = isImageFileName(item?.name) ? 'image' : 'file'
      const nodePath = joinNodePath(rootPath, relPath)
      const blobUrl = new URL(`/blob${nodePath}`, base).toString()
      pushTop(top, { ...item, type, path: relPath, url: buildRawUrl(relPath), thumbUrl: type === 'image' ? buildThumbUrl(relPath) : undefined, blobUrl }, limit)
    }
  }

  return { items: top, truncated: scannedDirs >= maxDirs || scannedItems >= maxItems }
}

router.get('/images/recent', requireAuth(), async (req, res, next) => {
  try {
    const store = req.app.locals.store
    if (!(await hasStorageAvailable(store))) return expressOk(res, { items: [] })
    const config = await store.getConfig()
    const nodes = Array.isArray(config?.nodes) ? config.nodes : []
    const enabledNodes = listEnabledPicmiNodes(nodes)
    if (enabledNodes.length > 0) {
      const limitRaw = Number(req.query?.limit)
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(60, Math.floor(limitRaw))) : 6
      const merged = new Map()
      let truncated = false
      let okCount = 0
      let errorCount = 0
      for (const node of enabledNodes) {
        const rootPath = normalizePath(node?.rootDir || '/')
        try {
          const data = await scanRecentNode(node, rootPath, limit)
          okCount += 1
          truncated = truncated || Boolean(data?.truncated)
          const items = Array.isArray(data?.items) ? data.items : []
          for (const it of items) {
            const rel = String(it?.path ?? '')
            if (!rel) continue
            const prev = merged.get(rel)
            if (!prev) merged.set(rel, it)
            else {
              const prevAt = String(prev?.uploadedAt ?? '')
              const nextAt = String(it?.uploadedAt ?? '')
              if (nextAt && (!prevAt || nextAt.localeCompare(prevAt) > 0)) merged.set(rel, it)
            }
          }
        } catch {
          errorCount += 1
        }
      }
      const top = []
      for (const it of merged.values()) pushTop(top, it, limit)
      const nodeError = okCount === 0 ? '节点不可达' : (errorCount > 0 ? '部分节点不可达' : undefined)
      return expressOk(res, { items: top, truncated, nodeError })
    }
    const root = path.resolve(rootDir, req.app.locals.config.storageRoot)
    const limitRaw = Number(req.query?.limit)
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(60, Math.floor(limitRaw))) : 6
    const data = await scanRecentLocal(root, limit)
    return expressOk(res, data)
  } catch (error) {
    next(error)
  }
})

router.get('/images/list', requireAuth({
  allow: async (req) => {
    const store = req.app.locals.store
    const list = await store.getPublicPaths()
    const current = normalizePath(req.query?.path ?? '/')
    return list.includes(current)
  }
}), async (req, res, next) => {
  try {
    const store = req.app.locals.store
    const config = await store.getConfig()
    const nodes = Array.isArray(config?.nodes) ? config.nodes : []
    const currentPath = normalizePath(req.query?.path ?? '/')
    const enabledNodes = listEnabledPicmiNodes(nodes)
    if (enabledNodes.length > 0) {
      const merged = new Map()
      let okCount = 0
      let errorCount = 0
      for (const node of enabledNodes) {
        const base = normalizeHttpBase(node?.address)
        if (!base) {
          errorCount += 1
          continue
        }
        const url = new URL('/api/images/list', base)
        url.searchParams.set('path', joinNodePath(node?.rootDir || '/', currentPath))
        const { res: nodeRes, payload } = await fetchNodePayload(url, { headers: { ...buildNodeAuthHeaders(node) } })
        if (!nodeRes || !payload || typeof payload !== 'object' || Number(payload?.code) !== 0 || !nodeRes.ok) {
          errorCount += 1
          continue
        }
        const data = payload && typeof payload === 'object' && 'data' in payload ? payload.data : null
        if (!data) {
          errorCount += 1
          continue
        }
        okCount += 1
        const rootPath = normalizePath(node?.rootDir || '/')
        const items = Array.isArray(data.items) ? data.items : []
        for (const it of items) {
          const rel = toRelativePath(it?.path, rootPath)
          if (!rel) continue
          if (it?.type === 'folder') {
            if (!merged.has(rel)) merged.set(rel, { ...it, path: rel })
            continue
          }
          const kind = isImageFileName(it?.name) ? 'image' : 'file'
          const nodePath = joinNodePath(node?.rootDir || '/', rel)
          const blobUrl = new URL(`/blob${nodePath}`, base).toString()
          const next = { ...it, type: kind, path: rel, url: buildRawUrl(rel), thumbUrl: kind === 'image' ? buildThumbUrl(rel) : undefined, blobUrl }
          const prev = merged.get(rel)
          if (!prev) {
            merged.set(rel, next)
            continue
          }
          const prevAt = String(prev?.uploadedAt ?? '')
          const nextAt = String(next?.uploadedAt ?? '')
          if (nextAt && (!prevAt || nextAt.localeCompare(prevAt) > 0)) merged.set(rel, next)
        }
      }
      const items = [...merged.values()]
      const nodeError = okCount === 0 ? '节点不可达' : (errorCount > 0 ? '部分节点不可达' : undefined)
      return expressOk(res, { path: currentPath, items, nodeError })
    }
    const root = path.resolve(rootDir, req.app.locals.config.storageRoot)
    const data = await listEntries(root, currentPath)
    return expressOk(res, data)
  } catch (error) {
    next(error)
  }
})

router.get('/images/raw', requireAuth({
  allow: async (req) => {
    const store = req.app.locals.store
    const list = await store.getPublicPaths()
    const rel = normalizePath(req.query?.path ?? '')
    if (!rel || rel === '/') return false
    const dir = normalizePath(path.posix.dirname(rel))
    return list.includes(dir)
  }
}), async (req, res, next) => {
  try {
    const store = req.app.locals.store
    const relPath = normalizePath(req.query?.path ?? '')
    if (!relPath || relPath === '/') return expressFail(res, 400, 40001, '参数错误')
    const config = await store.getConfig()
    const nodes = Array.isArray(config?.nodes) ? config.nodes : []
    const enabledNodes = listEnabledPicmiNodes(nodes)
    if (enabledNodes.length > 0) {
      const name = path.posix.basename(relPath)
      const asciiName = name.replace(/[\r\n]/g, '').replace(/"/g, '').replace(/[\\/]/g, '').replace(/[^\x20-\x7E]/g, '_')
      const utf8Name = encodeURIComponent(name).replace(/%20/g, ' ')
      res.setHeader('content-disposition', `inline; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`)
      let sawReachable = false
      for (const node of enabledNodes) {
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

router.get('/images/exists', requireAuth(), async (req, res, next) => {
  try {
    const store = req.app.locals.store
    const config = await store.getConfig()
    const enableLocalStorage = config?.enableLocalStorage === true
    const nodes = Array.isArray(config?.nodes) ? config.nodes : []
    const enabledNodes = listEnabledPicmiNodes(nodes)
    const root = path.resolve(rootDir, req.app.locals.config.storageRoot)
    const currentPath = normalizePath(req.query?.path ?? '/')
    const filename = String(req.query?.filename ?? '')
    if (!filename) return expressFail(res, 400, 40001, '参数错误')

    if (!enableLocalStorage && enabledNodes.length > 0) {
      let okCount = 0
      for (const node of enabledNodes) {
        const base = normalizeHttpBase(node?.address)
        if (!base) continue
        const url = new URL('/api/images/exists', base)
        url.searchParams.set('path', joinNodePath(node?.rootDir || '/', currentPath))
        url.searchParams.set('filename', filename)
        const { res: nodeRes, payload } = await fetchNodePayload(url, { headers: { ...buildNodeAuthHeaders(node) } })
        if (!nodeRes || !payload || typeof payload !== 'object' || !nodeRes.ok) continue
        okCount += 1
        const data = payload && typeof payload === 'object' && 'data' in payload ? payload.data : null
        if (data?.exists) return expressOk(res, { exists: true })
      }
      if (okCount > 0) return expressOk(res, { exists: false })
      return expressFail(res, 502, 50201, '节点不可达')
    }

    const { target } = resolvePath(root, path.posix.join(currentPath, filename))
    const exists = fsSync.existsSync(target)
    return expressOk(res, { exists })
  } catch (error) {
    next(error)
  }
})

router.post('/images/mkdir', requireAuth(), async (req, res, next) => {
  try {
    const store = req.app.locals.store
    const config = await store.getConfig()
    const enableLocalStorage = config?.enableLocalStorage === true
    const nodes = Array.isArray(config?.nodes) ? config.nodes : []
    const root = path.resolve(rootDir, req.app.locals.config.storageRoot)
    const { path: currentPath, name } = req.body ?? {}
    const safeName = sanitizeSingleName(name)
    if (!safeName) return expressFail(res, 400, 40001, '参数错误')

    if (!enableLocalStorage) {
      const enabledNodes = listEnabledPicmiNodes(nodes)
      if (enabledNodes.length === 0) return expressFail(res, 400, 40002, '未配置可用存储节点')
      let firstPayload = null
      for (const node of enabledNodes) {
        const base = normalizeHttpBase(node?.address)
        if (!base) return expressFail(res, 400, 40002, '节点地址无效')
        const url = new URL('/api/images/mkdir', base)
        const bodyOut = { path: joinNodePath(node?.rootDir || '/', normalizePath(currentPath ?? '/')), name: safeName }
        const { res: nodeRes, payload } = await fetchNodePayload(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...buildNodeAuthHeaders(node) },
          body: JSON.stringify(bodyOut)
        })
        if (!nodeRes) return expressFail(res, 502, 50201, '节点不可达')
        if (!payload || typeof payload !== 'object') return expressFail(res, 502, 50201, '节点响应异常')
        if (!nodeRes.ok || Number(payload?.code) !== 0) {
          return expressFail(res, nodeRes.status, Number(payload?.code) || 1, String(payload?.message || `http ${nodeRes.status}`))
        }
        if (!firstPayload) firstPayload = payload
      }
      return res.status(200).json(firstPayload ?? { code: 0, message: 'ok', data: null })
    }
    
    const { target } = resolvePath(root, path.posix.join(normalizePath(currentPath ?? '/'), safeName))
    if (fsSync.existsSync(target)) return expressFail(res, 409, 40901, '文件夹已存在')
    
    await ensureDir(target)
    return expressOk(res, null)
  } catch (error) {
    next(error)
  }
})

router.post('/images/upload', requireAuth(), uploadSingle, async (req, res, next) => {
  try {
    const store = req.app.locals.store
    if (!(await hasStorageAvailable(store))) return expressFail(res, 400, 40002, '请先配置存储节点或启用本地存储')
    const config = await store.getConfig()
    const maxUploadBytes = normalizeMaxUploadBytes(config?.maxUploadBytes)
    const enableLocalStorage = config?.enableLocalStorage === true
    const nodes = Array.isArray(config?.nodes) ? config.nodes : []
    const currentPath = normalizePath(req.body?.path ?? '/')
    const override = String(req.body?.override ?? '0') === '1'
    const file = req.file
    if (!file) return expressFail(res, 400, 40001, '文件为空')
    const safeName = sanitizeSingleName(normalizeUploadFileName(file.originalname))
    if (!safeName) return expressFail(res, 400, 40001, '文件名不合法')
    if (Number(file.size) > maxUploadBytes) return expressFail(res, 413, 41301, `文件过大（最大 ${formatBytes(maxUploadBytes)}）`)
    const check = validateImageUpload(safeName, file.buffer)
    if (!check.ok) return expressFail(res, 415, 41501, check.message)

    if (!enableLocalStorage) {
      const enabledNodes = listEnabledPicmiNodes(nodes)
      if (enabledNodes.length === 0) return expressFail(res, 400, 40002, '未配置可用存储节点')
      let firstPayload = null
      for (const node of enabledNodes) {
        const base = normalizeHttpBase(node?.address)
        if (!base) return expressFail(res, 400, 40002, '节点地址无效')
        const nodeDir = joinNodePath(node?.rootDir || '/', currentPath)
        const formOut = new FormData()
        formOut.set('path', nodeDir)
        formOut.set('override', override ? '1' : '0')
        formOut.set('file', new Blob([file.buffer]), safeName)
        const url = new URL('/api/images/upload', base)
        const { res: nodeRes, payload } = await fetchNodePayload(url, { method: 'POST', headers: { ...buildNodeAuthHeaders(node) }, body: formOut })
        if (!nodeRes) return expressFail(res, 502, 50201, '节点不可达')
        if (!payload || typeof payload !== 'object') return expressFail(res, 502, 50201, '节点响应异常')
        if (!nodeRes.ok || Number(payload?.code) !== 0) {
          return expressFail(res, nodeRes.status, Number(payload?.code) || 1, String(payload?.message || `http ${nodeRes.status}`))
        }
        if (!firstPayload) firstPayload = payload
      }
      return res.status(200).json(firstPayload ?? { code: 0, message: 'ok', data: null })
    }

    const root = path.resolve(rootDir, req.app.locals.config.storageRoot)
    const { target } = resolvePath(root, path.posix.join(currentPath, safeName))
    if (!override && fsSync.existsSync(target)) return expressFail(res, 409, 40901, '文件已存在')
    await ensureDir(path.dirname(target))
    await fs.writeFile(target, file.buffer)
    return expressOk(res, null)
  } catch (error) {
    next(error)
  }
})

router.post('/images/upload-base64', requireAuth(), async (req, res, next) => {
  try {
    const store = req.app.locals.store
    if (!(await hasStorageAvailable(store))) return expressFail(res, 400, 40002, '请先配置存储节点或启用本地存储')
    const config = await store.getConfig()
    const maxUploadBytes = normalizeMaxUploadBytes(config?.maxUploadBytes)
    const enableLocalStorage = config?.enableLocalStorage === true
    const nodes = Array.isArray(config?.nodes) ? config.nodes : []
    const { path: currentPath, filename, base64 } = req.body ?? {}
    if (!filename || !base64) return expressFail(res, 400, 40001, '参数错误')
    const safeName = sanitizeSingleName(filename)
    if (!safeName) return expressFail(res, 400, 40001, '文件名不合法')
    const normalizedCurrentPath = normalizePath(currentPath ?? '/')
    const rawBase64 = String(base64)
    const data = rawBase64.includes(',') ? rawBase64.split(',')[1] : rawBase64
    const approx = Math.floor((data.length * 3) / 4)
    if (approx > maxUploadBytes) return expressFail(res, 413, 41301, `文件过大（最大 ${formatBytes(maxUploadBytes)}）`)
    const buf = Buffer.from(data, 'base64')
    const check = validateImageUpload(safeName, buf)
    if (!check.ok) return expressFail(res, 415, 41501, check.message)

    if (!enableLocalStorage) {
      const enabledNodes = listEnabledPicmiNodes(nodes)
      if (enabledNodes.length === 0) return expressFail(res, 400, 40002, '未配置可用存储节点')
      let firstPayload = null
      for (const node of enabledNodes) {
        const base = normalizeHttpBase(node?.address)
        if (!base) return expressFail(res, 400, 40002, '节点地址无效')
        const nodeDir = joinNodePath(node?.rootDir || '/', normalizedCurrentPath)
        const url = new URL('/api/images/upload-base64', base)
        const bodyOut = { path: nodeDir, filename: safeName, base64: rawBase64 }
        const { res: nodeRes, payload } = await fetchNodePayload(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...buildNodeAuthHeaders(node) },
          body: JSON.stringify(bodyOut)
        })
        if (!nodeRes) return expressFail(res, 502, 50201, '节点不可达')
        if (!payload || typeof payload !== 'object') return expressFail(res, 502, 50201, '节点响应异常')
        if (!nodeRes.ok || Number(payload?.code) !== 0) {
          return expressFail(res, nodeRes.status, Number(payload?.code) || 1, String(payload?.message || `http ${nodeRes.status}`))
        }
        if (!firstPayload) firstPayload = payload
      }
      return res.status(200).json(firstPayload ?? { code: 0, message: 'ok', data: null })
    }

    const root = path.resolve(rootDir, req.app.locals.config.storageRoot)
    const { target } = resolvePath(root, path.posix.join(normalizedCurrentPath, safeName))
    await ensureDir(path.dirname(target))
    await fs.writeFile(target, buf)
    return expressOk(res, null)
  } catch (error) {
    next(error)
  }
})

router.post('/images/delete', requireAuth(), async (req, res, next) => {
  try {
    const store = req.app.locals.store
    const config = await store.getConfig()
    const enableLocalStorage = config?.enableLocalStorage === true
    const nodes = Array.isArray(config?.nodes) ? config.nodes : []
    const root = path.resolve(rootDir, req.app.locals.config.storageRoot)
    const { paths } = req.body ?? {}
    if (!Array.isArray(paths)) return expressFail(res, 400, 40001, '参数错误')

    if (!enableLocalStorage) {
      const enabledNodes = listEnabledPicmiNodes(nodes)
      if (enabledNodes.length === 0) return expressFail(res, 400, 40002, '未配置可用存储节点')
      let firstPayload = null
      for (const node of enabledNodes) {
        const base = normalizeHttpBase(node?.address)
        if (!base) return expressFail(res, 400, 40002, '节点地址无效')
        const url = new URL('/api/images/delete', base)
        const bodyOut = { paths: paths.map((p) => joinNodePath(node?.rootDir || '/', p)) }
        const { res: nodeRes, payload } = await fetchNodePayload(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...buildNodeAuthHeaders(node) },
          body: JSON.stringify(bodyOut)
        })
        if (!nodeRes) return expressFail(res, 502, 50201, '节点不可达')
        if (!payload || typeof payload !== 'object') return expressFail(res, 502, 50201, '节点响应异常')
        if (!nodeRes.ok || Number(payload?.code) !== 0) {
          return expressFail(res, nodeRes.status, Number(payload?.code) || 1, String(payload?.message || `http ${nodeRes.status}`))
        }
        if (!firstPayload) firstPayload = payload
      }
      return res.status(200).json(firstPayload ?? { code: 0, message: 'ok', data: null })
    }

    for (const p of paths) {
      const { target } = resolvePath(root, p)
      await removeRecursive(target)
    }
    return expressOk(res, null)
  } catch (error) {
    next(error)
  }
})

router.post('/images/rename', requireAuth(), async (req, res, next) => {
  try {
    const store = req.app.locals.store
    const config = await store.getConfig()
    const enableLocalStorage = config?.enableLocalStorage === true
    const nodes = Array.isArray(config?.nodes) ? config.nodes : []
    const root = path.resolve(rootDir, req.app.locals.config.storageRoot)
    const { path: current, newName } = req.body ?? {}
    const safeName = sanitizeSingleName(newName)
    if (!current || !safeName) return expressFail(res, 400, 40001, '参数错误')

    if (!enableLocalStorage) {
      const enabledNodes = listEnabledPicmiNodes(nodes)
      if (enabledNodes.length === 0) return expressFail(res, 400, 40002, '未配置可用存储节点')
      let firstPayload = null
      for (const node of enabledNodes) {
        const base = normalizeHttpBase(node?.address)
        if (!base) return expressFail(res, 400, 40002, '节点地址无效')
        const url = new URL('/api/images/rename', base)
        const bodyOut = { path: joinNodePath(node?.rootDir || '/', current), newName: safeName }
        const { res: nodeRes, payload } = await fetchNodePayload(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...buildNodeAuthHeaders(node) },
          body: JSON.stringify(bodyOut)
        })
        if (!nodeRes) return expressFail(res, 502, 50201, '节点不可达')
        if (!payload || typeof payload !== 'object') return expressFail(res, 502, 50201, '节点响应异常')
        if (!nodeRes.ok || Number(payload?.code) !== 0) {
          return expressFail(res, nodeRes.status, Number(payload?.code) || 1, String(payload?.message || `http ${nodeRes.status}`))
        }
        if (!firstPayload) firstPayload = payload
      }
      return res.status(200).json(firstPayload ?? { code: 0, message: 'ok', data: null })
    }

    const { target, normalized } = resolvePath(root, current)
    const nextNormalized = path.posix.join(path.posix.dirname(normalized), safeName)
    const next = resolvePath(root, nextNormalized).target
    await fs.rename(target, next)
    return expressOk(res, null)
  } catch (error) {
    next(error)
  }
})

router.post('/images/move', requireAuth(), async (req, res, next) => {
  try {
    const store = req.app.locals.store
    const config = await store.getConfig()
    const enableLocalStorage = config?.enableLocalStorage === true
    const nodes = Array.isArray(config?.nodes) ? config.nodes : []
    const root = path.resolve(rootDir, req.app.locals.config.storageRoot)
    const { toPath, items } = req.body ?? {}
    if (!Array.isArray(items)) return expressFail(res, 400, 40001, '参数错误')
    const dest = normalizePath(toPath ?? '/')

    if (!enableLocalStorage) {
      const enabledNodes = listEnabledPicmiNodes(nodes)
      if (enabledNodes.length === 0) return expressFail(res, 400, 40002, '未配置可用存储节点')
      let firstPayload = null
      for (const node of enabledNodes) {
        const base = normalizeHttpBase(node?.address)
        if (!base) return expressFail(res, 400, 40002, '节点地址无效')
        const url = new URL('/api/images/move', base)
        const bodyOut = {
          toPath: joinNodePath(node?.rootDir || '/', dest),
          items: items.map((it) => ({ path: joinNodePath(node?.rootDir || '/', it.path) }))
        }
        const { res: nodeRes, payload } = await fetchNodePayload(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...buildNodeAuthHeaders(node) },
          body: JSON.stringify(bodyOut)
        })
        if (!nodeRes) return expressFail(res, 502, 50201, '节点不可达')
        if (!payload || typeof payload !== 'object') return expressFail(res, 502, 50201, '节点响应异常')
        if (!nodeRes.ok || Number(payload?.code) !== 0) {
          return expressFail(res, nodeRes.status, Number(payload?.code) || 1, String(payload?.message || `http ${nodeRes.status}`))
        }
        if (!firstPayload) firstPayload = payload
      }
      return res.status(200).json(firstPayload ?? { code: 0, message: 'ok', data: null })
    }

    for (const item of items) {
      const from = resolvePath(root, item.path).target
      const target = resolvePath(root, path.posix.join(dest, path.basename(from))).target
      await ensureDir(path.dirname(target))
      await fs.rename(from, target)
    }
    return expressOk(res, null)
  } catch (error) {
    next(error)
  }
})

router.post('/images/copy', requireAuth(), async (req, res, next) => {
  try {
    const store = req.app.locals.store
    const config = await store.getConfig()
    const enableLocalStorage = config?.enableLocalStorage === true
    const nodes = Array.isArray(config?.nodes) ? config.nodes : []
    const root = path.resolve(rootDir, req.app.locals.config.storageRoot)
    const { toPath, items } = req.body ?? {}
    if (!Array.isArray(items)) return expressFail(res, 400, 40001, '参数错误')
    const dest = normalizePath(toPath ?? '/')

    if (!enableLocalStorage) {
      const enabledNodes = listEnabledPicmiNodes(nodes)
      if (enabledNodes.length === 0) return expressFail(res, 400, 40002, '未配置可用存储节点')
      let firstPayload = null
      for (const node of enabledNodes) {
        const base = normalizeHttpBase(node?.address)
        if (!base) return expressFail(res, 400, 40002, '节点地址无效')
        const url = new URL('/api/images/copy', base)
        const bodyOut = {
          toPath: joinNodePath(node?.rootDir || '/', dest),
          items: items.map((it) => ({ path: joinNodePath(node?.rootDir || '/', it.path) }))
        }
        const { res: nodeRes, payload } = await fetchNodePayload(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...buildNodeAuthHeaders(node) },
          body: JSON.stringify(bodyOut)
        })
        if (!nodeRes) return expressFail(res, 502, 50201, '节点不可达')
        if (!payload || typeof payload !== 'object') return expressFail(res, 502, 50201, '节点响应异常')
        if (!nodeRes.ok || Number(payload?.code) !== 0) {
          return expressFail(res, nodeRes.status, Number(payload?.code) || 1, String(payload?.message || `http ${nodeRes.status}`))
        }
        if (!firstPayload) firstPayload = payload
      }
      return res.status(200).json(firstPayload ?? { code: 0, message: 'ok', data: null })
    }

    for (const item of items) {
      const from = resolvePath(root, item.path).target
      const target = resolvePath(root, path.posix.join(dest, path.basename(from))).target
      await copyRecursive(from, target)
    }
    return expressOk(res, null)
  } catch (error) {
    next(error)
  }
})

router.post('/images/public', requireAuth(), async (req, res, next) => {
  try {
    const store = req.app.locals.store
    const current = normalizePath(req.body?.path ?? '/')
    const list = await store.getPublicPaths()
    const enabled = !list.includes(current)
    await store.setPublicPath(current, enabled)
    return expressOk(res, { enabled })
  } catch (error) {
    next(error)
  }
})

router.get('/images/public-status', requireAuth(), async (req, res, next) => {
  try {
    const store = req.app.locals.store
    const current = normalizePath(req.query?.path ?? '/')
    const list = await store.getPublicPaths()
    return expressOk(res, { enabled: list.includes(current) })
  } catch (error) {
    next(error)
  }
})

export const basePath = '/api'
export { router }
