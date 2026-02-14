import { Router } from 'express'
import path from 'node:path'
import { normalizePath } from '../server/utils/paths.js'
import { requireAdmin } from '../middleware/auth.js'
import { expressOk, expressFail } from '../server/utils/http.js'

const router = Router()

router.get('/config', requireAdmin(), async (req, res, next) => {
  try {
    const store = req.app.locals.store
    const config = await store.getConfig()
    return expressOk(res, config)
  } catch (error) {
    next(error)
  }
})

router.post('/config', requireAdmin(), async (req, res, next) => {
  try {
    const { listApi, nodes, enableLocalStorage, mediaRequireAuth, maxUploadBytes, thumbnailProcessing, thumbnailMaxBytes, thumbnailMaxWidth, thumbnailSkipBelowBytes, nodeReadStrategy } = req.body ?? {}
    if (!listApi || !Array.isArray(nodes)) return expressFail(res, 400, 40001, '参数错误')
    const listApiStr = String(listApi).trim()
    if (!listApiStr.startsWith('/api/')) return expressFail(res, 400, 40001, '参数错误')
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(listApiStr)) return expressFail(res, 400, 40001, '参数错误')
    if (mediaRequireAuth !== undefined && typeof mediaRequireAuth !== 'boolean') return expressFail(res, 400, 40001, '参数错误')
    if (maxUploadBytes !== undefined) {
      const n = Number(maxUploadBytes)
      if (!Number.isFinite(n)) return expressFail(res, 400, 40001, '参数错误')
    }
    if (thumbnailMaxBytes !== undefined) {
      const n = Number(thumbnailMaxBytes)
      if (!Number.isFinite(n)) return expressFail(res, 400, 40001, '参数错误')
    }
    if (thumbnailMaxWidth !== undefined) {
      const n = Number(thumbnailMaxWidth)
      if (!Number.isFinite(n)) return expressFail(res, 400, 40001, '参数错误')
    }
    if (thumbnailSkipBelowBytes !== undefined) {
      const n = Number(thumbnailSkipBelowBytes)
      if (!Number.isFinite(n)) return expressFail(res, 400, 40001, '参数错误')
    }
    if (nodeReadStrategy !== undefined) {
      const mode = String(nodeReadStrategy ?? '').trim()
      const allowed = mode === 'round-robin' || mode === 'random' || mode === 'path-hash'
      if (!allowed) return expressFail(res, 400, 40001, '参数错误')
    }
    const hasEnabledNode = nodes.some((node) => node && node.enabled !== false)
    if (enableLocalStorage === true && hasEnabledNode) {
      return expressFail(res, 400, 40003, '本地存储与存储节点不可同时启用')
    }
    const store = req.app.locals.store
    const prev = await store.getConfig()
    const prevNodes = Array.isArray(prev?.nodes) ? prev.nodes : []
    await syncNewNodes(prevNodes, nodes)
    const modeStr = String(thumbnailProcessing ?? prev?.thumbnailProcessing ?? 'node').trim()
    const nextMode = modeStr === 'backend' ? 'backend' : 'node'
    const nextMaxBytes = thumbnailMaxBytes !== undefined ? thumbnailMaxBytes : prev?.thumbnailMaxBytes
    const nextMaxWidth = thumbnailMaxWidth !== undefined ? thumbnailMaxWidth : prev?.thumbnailMaxWidth
    const nextMediaRequireAuth = mediaRequireAuth !== undefined ? mediaRequireAuth === true : prev?.mediaRequireAuth !== false
    const nextSkipBelow = thumbnailSkipBelowBytes !== undefined ? thumbnailSkipBelowBytes : prev?.thumbnailSkipBelowBytes
    const hasNonPicmiNode = nodes.some((node) => node && node.enabled !== false && String(node?.type ?? 'picmi-node') !== 'picmi-node')
    if (nextMode === 'backend' && hasNonPicmiNode) {
      return expressFail(res, 400, 40004, '存在非PicMi-Node节点时不可更改缩略图处理位置')
    }
    await store.saveConfig(listApiStr, nodes, enableLocalStorage === true, nextMediaRequireAuth, maxUploadBytes, nextMode, nextMaxBytes, nextMaxWidth, nextSkipBelow, nodeReadStrategy)
    return expressOk(res, null)
  } catch (error) {
    next(error)
  }
})

router.post('/config/sync', requireAdmin(), async (req, res, next) => {
  try {
    const { fromId, toId } = req.body ?? {}
    const from = String(fromId ?? '').trim()
    const to = String(toId ?? '').trim()
    if (!from || !to || from === to) return expressFail(res, 400, 40001, '参数错误')
    const store = req.app.locals.store
    const config = await store.getConfig()
    const nodes = Array.isArray(config?.nodes) ? config.nodes : []
    const sourceNode = nodes.find((n) => String(n?.id ?? '') === from) ?? null
    const targetNode = nodes.find((n) => String(n?.id ?? '') === to) ?? null
    if (!sourceNode || !targetNode) return expressFail(res, 400, 40001, '参数错误')
    if (sourceNode.enabled === false || targetNode.enabled === false) return expressFail(res, 400, 40002, '节点未启用')
    if (String(sourceNode?.type ?? 'picmi-node') !== 'picmi-node' || String(targetNode?.type ?? 'picmi-node') !== 'picmi-node') {
      return expressFail(res, 400, 40002, '节点类型不支持')
    }
    if (String(sourceNode?.address ?? '').trim() === String(targetNode?.address ?? '').trim()) return expressFail(res, 400, 40002, '节点地址重复')
    await syncPicmiNode(sourceNode, targetNode)
    return expressOk(res, null)
  } catch (error) {
    next(error)
  }
})

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

const buildAuthHeaders = (node) => {
  const token = String(node?.password ?? '').trim()
  return token ? { authorization: `Bearer ${token}` } : {}
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

const fetchJsonData = async (url, options) => {
  const ms = 15_000
  const signal =
    options?.signal ??
    (typeof AbortSignal?.timeout === 'function'
      ? AbortSignal.timeout(ms)
      : (() => {
          const controller = new AbortController()
          const t = setTimeout(() => controller.abort(), ms)
          controller.signal.addEventListener('abort', () => clearTimeout(t), { once: true })
          return controller.signal
        })())
  const res = await fetch(url, { redirect: 'error', ...options, signal })
  const payload = await res.json().catch(() => null)
  if (!res.ok || !payload || payload.code !== 0) {
    throw new Error(payload?.message || `http ${res.status}`)
  }
  return payload.data
}

const listNodeTree = async (node) => {
  const base = normalizeHttpBase(node?.address)
  if (!base) throw new Error('节点地址无效')
  const rootPath = normalizePath(node?.rootDir || '/')
  const headers = buildAuthHeaders(node)
  const files = new Map()
  const dirs = new Set(['/'])

  const walk = async (relPath) => {
    const nodePath = joinNodePath(rootPath, relPath)
    const url = new URL('/api/images/list', base)
    url.searchParams.set('path', nodePath)
    const data = await fetchJsonData(url, { headers })
    const items = Array.isArray(data?.items) ? data.items : []
    for (const item of items) {
      const itemRel = toRelativePath(item?.path, rootPath)
      if (item?.type === 'folder') {
        if (!dirs.has(itemRel)) {
          dirs.add(itemRel)
          await walk(itemRel)
        }
      } else {
        files.set(itemRel, { size: item?.size ?? null, url: item?.url ?? null })
      }
    }
  }

  await walk('/')
  return { base, rootPath, headers, files, dirs }
}

const createDirOnNode = async (nodeInfo, relDir) => {
  if (!relDir || relDir === '/') return
  const parentRel = normalizePath(path.posix.dirname(relDir))
  const name = path.posix.basename(relDir)
  const url = new URL('/api/images/mkdir', nodeInfo.base)
  const body = { path: joinNodePath(nodeInfo.rootPath, parentRel), name }
  try {
    await fetchJsonData(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...nodeInfo.headers },
      body: JSON.stringify(body)
    })
  } catch (error) {
    if (!/已存在|exists/i.test(String(error?.message ?? ''))) throw error
  }
}

const uploadFileToNode = async (sourceInfo, targetInfo, relPath, sourceMeta) => {
  const fileUrl = new URL(`/uploads${joinNodePath(sourceInfo.rootPath, relPath)}`, sourceInfo.base).toString()
  const res = await fetch(fileUrl, { headers: sourceInfo.headers })
  if (!res.ok) throw new Error(`http ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())

  const relDir = normalizePath(path.posix.dirname(relPath))
  const fileName = path.posix.basename(relPath)
  const form = new FormData()
  form.set('path', joinNodePath(targetInfo.rootPath, relDir))
  form.set('override', '1')
  form.set('file', new Blob([buf]), fileName)

  const url = new URL('/api/images/upload', targetInfo.base)
  await fetchJsonData(url, { method: 'POST', headers: { ...targetInfo.headers }, body: form })
}

const deletePathsOnNode = async (nodeInfo, relPaths) => {
  if (relPaths.length === 0) return
  const url = new URL('/api/images/delete', nodeInfo.base)
  const body = { paths: relPaths.map((p) => joinNodePath(nodeInfo.rootPath, p)) }
  await fetchJsonData(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...nodeInfo.headers },
    body: JSON.stringify(body)
  })
}

const syncPicmiNode = async (sourceNode, targetNode) => {
  const sourceInfo = await listNodeTree(sourceNode)
  const targetInfo = await listNodeTree(targetNode)

  const missingDirs = [...sourceInfo.dirs].filter((d) => !targetInfo.dirs.has(d)).sort((a, b) => a.length - b.length)
  for (const dir of missingDirs) await createDirOnNode(targetInfo, dir)

  for (const [relPath, meta] of sourceInfo.files.entries()) {
    const targetMeta = targetInfo.files.get(relPath)
    if (!targetMeta || Number(targetMeta.size) !== Number(meta?.size)) {
      await uploadFileToNode(sourceInfo, targetInfo, relPath, meta)
    }
  }

  const extraFiles = [...targetInfo.files.keys()].filter((p) => !sourceInfo.files.has(p))
  const extraDirs = [...targetInfo.dirs].filter((p) => p !== '/' && !sourceInfo.dirs.has(p)).sort((a, b) => b.length - a.length)

  for (let i = 0; i < extraFiles.length; i += 200) {
    await deletePathsOnNode(targetInfo, extraFiles.slice(i, i + 200))
  }
  for (let i = 0; i < extraDirs.length; i += 200) {
    await deletePathsOnNode(targetInfo, extraDirs.slice(i, i + 200))
  }
}

const syncNewNodes = async (prevNodes, nextNodes) => {
  const prevIds = new Set(prevNodes.map((node) => String(node?.id ?? '')).filter(Boolean))
  const newNodes = nextNodes.filter((node) => !prevIds.has(String(node?.id ?? '')))
  if (newNodes.length === 0) return

  const sourceNode = prevNodes.find((node) => node && node.enabled !== false)
  if (!sourceNode) return
  const sourceType = String(sourceNode?.type ?? 'picmi-node')
  if (sourceType !== 'picmi-node') return

  for (const node of newNodes) {
    if (!node || node.enabled === false) continue
    const type = String(node?.type ?? 'picmi-node')
    if (type !== 'picmi-node') continue
    if (String(node?.address ?? '').trim() === String(sourceNode?.address ?? '').trim()) continue
    await syncPicmiNode(sourceNode, node)
  }
}

export const basePath = '/api'
export { router }
