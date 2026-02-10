import path from 'node:path'
import { normalizePath } from '../../utils/paths.js'
import { fail, ok, readBodySafe, readResponseBufferWithLimit, requireAdmin, usePicmi } from '../../utils/nitro'

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

const uploadFileToNode = async (sourceInfo: any, targetInfo: any, relPath: string) => {
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
      await uploadFileToNode(sourceInfo, targetInfo, relPath)
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

export default defineEventHandler(async (event) => {
  const auth = await requireAdmin(event)
  if (auth) return auth

  try {
    const picmi = await usePicmi(event)
    const body = await readBodySafe<{ fromId?: unknown; toId?: unknown }>(event)
    const fromId = String(body?.fromId ?? '').trim()
    const toId = String(body?.toId ?? '').trim()
    if (!fromId || !toId || fromId === toId) return fail(event, 400, 40001, '参数错误')

    const config = await picmi.store.getConfig()
    const nodes = Array.isArray(config?.nodes) ? config.nodes : []
    const sourceNode = nodes.find((n: any) => String(n?.id ?? '') === fromId) ?? null
    const targetNode = nodes.find((n: any) => String(n?.id ?? '') === toId) ?? null
    if (!sourceNode || !targetNode) return fail(event, 400, 40001, '参数错误')
    if (sourceNode.enabled === false || targetNode.enabled === false) return fail(event, 400, 40002, '节点未启用')
    if (String(sourceNode?.type ?? 'picmi-node') !== 'picmi-node' || String(targetNode?.type ?? 'picmi-node') !== 'picmi-node') {
      return fail(event, 400, 40002, '节点类型不支持')
    }
    if (String(sourceNode?.address ?? '').trim() === String(targetNode?.address ?? '').trim()) return fail(event, 400, 40002, '节点地址重复')

    await syncPicmiNode(sourceNode, targetNode)
    return ok(null)
  } catch {
    return fail(event, 500, 1, '服务异常')
  }
})

