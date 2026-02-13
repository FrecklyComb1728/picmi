import path from 'node:path'
import { normalizePath } from '../utils/paths.js'
import { fail, ok, readBodySafe, readResponseBufferWithLimit, requireAdmin, usePicmi } from '../utils/nitro'

export default defineEventHandler(async (event) => {
  const auth = await requireAdmin(event)
  if (auth) return auth

  try {
    const picmi = await usePicmi(event)

    const body = await readBodySafe<{
      listApi?: string
      nodes?: unknown
      enableLocalStorage?: boolean
      mediaRequireAuth?: unknown
      maxUploadBytes?: unknown
      thumbnailProcessing?: unknown
      thumbnailMaxBytes?: unknown
      thumbnailMaxWidth?: unknown
      thumbnailSkipBelowBytes?: unknown
    }>(event)
    const listApi = body?.listApi
    const nodes = body?.nodes
    const enableLocalStorage = body?.enableLocalStorage ?? false
    const mediaRequireAuthRaw = body?.mediaRequireAuth
    const maxUploadBytesRaw = body?.maxUploadBytes
    if (!listApi || !Array.isArray(nodes)) return fail(event, 400, 40001, '参数错误')
    const listApiStr = String(listApi).trim()
    if (!listApiStr.startsWith('/api/')) return fail(event, 400, 40001, '参数错误')
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(listApiStr)) return fail(event, 400, 40001, '参数错误')
    if (mediaRequireAuthRaw !== undefined && typeof mediaRequireAuthRaw !== 'boolean') return fail(event, 400, 40001, '参数错误')
    if (maxUploadBytesRaw !== undefined) {
      const n = Number(maxUploadBytesRaw)
      if (!Number.isFinite(n)) return fail(event, 400, 40001, '参数错误')
    }
    const hasEnabledNode = nodes.some((node: any) => node && node.enabled !== false)
    if (enableLocalStorage && hasEnabledNode) return fail(event, 400, 40003, '本地存储与存储节点不可同时启用')

    const prev = await picmi.store.getConfig()
    const prevNodes = Array.isArray(prev?.nodes) ? prev.nodes : []
    await syncNewNodes(prevNodes, nodes as any[])
    const mediaRequireAuth = mediaRequireAuthRaw !== undefined ? mediaRequireAuthRaw === true : prev?.mediaRequireAuth !== false
    const thumbnailProcessingRaw = body?.thumbnailProcessing
    const thumbnailMaxBytesRaw = body?.thumbnailMaxBytes
    const thumbnailMaxWidthRaw = body?.thumbnailMaxWidth
    const thumbnailSkipBelowBytesRaw = body?.thumbnailSkipBelowBytes
    if (thumbnailMaxBytesRaw !== undefined) {
      const n = Number(thumbnailMaxBytesRaw)
      if (!Number.isFinite(n)) return fail(event, 400, 40001, '参数错误')
    }
    if (thumbnailMaxWidthRaw !== undefined) {
      const n = Number(thumbnailMaxWidthRaw)
      if (!Number.isFinite(n)) return fail(event, 400, 40001, '参数错误')
    }
    if (thumbnailSkipBelowBytesRaw !== undefined) {
      const n = Number(thumbnailSkipBelowBytesRaw)
      if (!Number.isFinite(n)) return fail(event, 400, 40001, '参数错误')
    }
    const modeStr = String(thumbnailProcessingRaw ?? prev?.thumbnailProcessing ?? 'node').trim()
    const thumbnailProcessing = modeStr === 'backend' ? 'backend' : 'node'
    const thumbnailMaxBytes = thumbnailMaxBytesRaw ?? prev?.thumbnailMaxBytes
    const thumbnailMaxWidth = thumbnailMaxWidthRaw ?? prev?.thumbnailMaxWidth
    const thumbnailSkipBelowBytes = thumbnailSkipBelowBytesRaw ?? prev?.thumbnailSkipBelowBytes
    const hasNonPicmiNode = (nodes as any[]).some((node) => node && node.enabled !== false && String(node?.type ?? 'picmi-node') !== 'picmi-node')
    if (thumbnailProcessing === 'backend' && hasNonPicmiNode) return fail(event, 400, 40004, '存在非PicMi-Node节点时不可更改缩略图处理位置')
    await picmi.store.saveConfig(listApiStr, nodes, enableLocalStorage, mediaRequireAuth, maxUploadBytesRaw, thumbnailProcessing, thumbnailMaxBytes, thumbnailMaxWidth, thumbnailSkipBelowBytes)
    return ok(null)
  } catch {
    return fail(event, 500, 1, '服务异常')
  }
})

const normalizeHttpBase = (address: any) => {
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

const buildAuthHeaders = (node: any): Record<string, string> => {
  const token = String(node?.password ?? '').trim()
  const headers: Record<string, string> = {}
  if (token) headers.authorization = `Bearer ${token}`
  return headers
}

const joinNodePath = (root: any, rel: any) => {
  const rootNorm = normalizePath(root || '/')
  const relNorm = normalizePath(rel || '/')
  if (rootNorm === '/') return relNorm
  if (relNorm === '/') return rootNorm
  return normalizePath(`${rootNorm}/${relNorm}`)
}

const toRelativePath = (fullPath: any, rootPath: any) => {
  const fullNorm = normalizePath(fullPath || '/')
  const rootNorm = normalizePath(rootPath || '/')
  if (rootNorm === '/') return fullNorm
  if (fullNorm === rootNorm) return '/'
  if (fullNorm.startsWith(`${rootNorm}/`)) return normalizePath(fullNorm.slice(rootNorm.length))
  return fullNorm
}

const fetchJsonData = async (url: URL, options?: RequestInit) => {
  const ms = 15_000
  const signal =
    (options as any)?.signal ??
    (typeof (AbortSignal as any)?.timeout === 'function'
      ? (AbortSignal as any).timeout(ms)
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

const listNodeTree = async (node: any) => {
  const base = normalizeHttpBase(node?.address)
  if (!base) throw new Error('节点地址无效')
  const rootPath = normalizePath(node?.rootDir || '/')
  const headers = buildAuthHeaders(node)
  const files = new Map<string, { size: any; url: any }>()
  const dirs = new Set<string>(['/'])

  const walk = async (relPath: string) => {
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

const createDirOnNode = async (nodeInfo: any, relDir: string) => {
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
  } catch (error: any) {
    if (!/已存在|exists/i.test(String(error?.message ?? ''))) throw error
  }
}

const uploadFileToNode = async (sourceInfo: any, targetInfo: any, relPath: string, sourceMeta: any) => {
  const fileUrl = new URL(`/uploads${joinNodePath(sourceInfo.rootPath, relPath)}`, sourceInfo.base).toString()
  const signal =
    typeof (AbortSignal as any)?.timeout === 'function'
      ? (AbortSignal as any).timeout(15_000)
      : (() => {
          const controller = new AbortController()
          const t = setTimeout(() => controller.abort(), 15_000)
          controller.signal.addEventListener('abort', () => clearTimeout(t), { once: true })
          return controller.signal
        })()
  const res = await fetch(fileUrl, { redirect: 'error', headers: sourceInfo.headers, signal })
  if (!res.ok) throw new Error(`http ${res.status}`)
  const buf = await readResponseBufferWithLimit(res, 1024 * 1024 * 1024)

  const relDir = normalizePath(path.posix.dirname(relPath))
  const fileName = path.posix.basename(relPath)
  const form = new FormData()
  form.set('path', joinNodePath(targetInfo.rootPath, relDir))
  form.set('override', '1')
  form.set('file', new Blob([buf]), fileName)

  const url = new URL('/api/images/upload', targetInfo.base)
  await fetchJsonData(url, { method: 'POST', headers: { ...targetInfo.headers }, body: form })
}

const deletePathsOnNode = async (nodeInfo: any, relPaths: string[]) => {
  if (relPaths.length === 0) return
  const url = new URL('/api/images/delete', nodeInfo.base)
  const body = { paths: relPaths.map((p) => joinNodePath(nodeInfo.rootPath, p)) }
  await fetchJsonData(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...nodeInfo.headers },
    body: JSON.stringify(body)
  })
}

const syncPicmiNode = async (sourceNode: any, targetNode: any) => {
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

const syncNewNodes = async (prevNodes: any[], nextNodes: any[]) => {
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
