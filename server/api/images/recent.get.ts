import fs from 'node:fs/promises'
import path from 'node:path'
import { getQuery } from 'h3'
import { rootDir } from '../../config.js'
import { isImageFileName, normalizePath, toUrlPath } from '../../utils/paths.js'
import { buildNodeAuthHeaders, fail, fetchNodePayload, joinNodePath, normalizeHttpBase, ok, pickEnabledPicmiNode, requireAuth, toRelativePath, usePicmi } from '../../utils/nitro'

let cache: { key: string; limit: number; ts: number; data: any } | null = null
const cacheTtlMs = 10_000

const pushTop = (arr: any[], item: any, limit: number) => {
  arr.push(item)
  arr.sort((a, b) => String(b?.uploadedAt ?? '').localeCompare(String(a?.uploadedAt ?? '')))
  if (arr.length > limit) arr.length = limit
}

const scanLocalRecent = async (root: string, limit: number) => {
  const top: any[] = []
  const stack: Array<{ dir: string; rel: string }> = [{ dir: root, rel: '/' }]
  let scannedFiles = 0
  const maxFiles = 20000
  const maxDirs = 4000
  let scannedDirs = 0

  while (stack.length && scannedFiles < maxFiles && scannedDirs < maxDirs) {
    const current = stack.pop() as { dir: string; rel: string }
    scannedDirs += 1
    let entries: any[] = []
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
        const relDir = current.rel.replace(/^\/+/, '')
        const entryUrlPath = toUrlPath(path.posix.join('/uploads', relDir, entry.name))
        const type = isImageFileName(entry.name) ? 'image' : 'file'
        pushTop(top, {
          type,
          name: entry.name,
          path: normalizePath(path.posix.join(current.rel, entry.name)),
          url: entryUrlPath,
          size: info.size,
          uploadedAt: info.mtime.toISOString()
        }, limit)
      } catch {}
    }
  }

  return { items: top, truncated: scannedFiles >= maxFiles || scannedDirs >= maxDirs }
}

const scanNodeRecent = async (node: any, rootPath: string, limit: number) => {
  const top: any[] = []
  const base = normalizeHttpBase(node?.address)
  if (!base) throw new Error('invalid node')
  const headers = buildNodeAuthHeaders(node)
  const visited = new Set<string>()
  const stack = ['/']
  const maxDirs = 2000
  const maxItems = 50000
  let scannedDirs = 0
  let scannedItems = 0

  while (stack.length && scannedDirs < maxDirs && scannedItems < maxItems) {
    const rel = stack.pop() as string
    if (visited.has(rel)) continue
    visited.add(rel)
    scannedDirs += 1
    const url = new URL('/api/images/list', base)
    url.searchParams.set('path', joinNodePath(rootPath, rel))
    const { res, payload } = await fetchNodePayload(url, { headers })
    if (!res || !res.ok) continue
    const data = (payload && typeof payload === 'object' && 'data' in payload) ? (payload as any).data : null
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
      pushTop(top, {
        ...item,
        type,
        path: relPath,
        url: `/api/images/raw?path=${encodeURIComponent(relPath)}`
      }, limit)
    }
  }

  return { items: top, truncated: scannedDirs >= maxDirs || scannedItems >= maxItems }
}

export default defineEventHandler(async (event) => {
  try {
    const picmi = await usePicmi(event)
    const query = getQuery(event) as { limit?: string }
    const limitRaw = Number(query?.limit)
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(60, Math.floor(limitRaw))) : 6

    const auth = await requireAuth(event)
    if (auth) return auth

    const config = await picmi.store.getConfig()
    const nodes = Array.isArray(config?.nodes) ? config.nodes : []
    const hasEnabledNode = nodes.some((n: any) => n && n.enabled !== false)

    if (nodes.length > 0) {
      if (!hasEnabledNode) return ok({ items: [], nodeError: '未配置可用存储节点' } as any)
      const node = pickEnabledPicmiNode(nodes)
      if (!node) return ok({ items: [], nodeError: '未配置可用存储节点' } as any)
      const rootPath = normalizePath(node?.rootDir || '/')
      try {
        const key = `node:${String(node?.address ?? '')}|${rootPath}`
        if (cache && cache.key === key && cache.limit === limit && Date.now() - cache.ts < cacheTtlMs) return ok(cache.data)
        const data = await scanNodeRecent(node, rootPath, limit)
        cache = { key, limit, ts: Date.now(), data }
        return ok(data)
      } catch {
        return ok({ items: [], nodeError: '节点不可达' } as any)
      }
    }

    const root = path.resolve(rootDir, picmi.config.storageRoot)
    const key = `local:${root}`
    if (cache && cache.key === key && cache.limit === limit && Date.now() - cache.ts < cacheTtlMs) return ok(cache.data)
    const data = await scanLocalRecent(root, limit)
    cache = { key, limit, ts: Date.now(), data }
    return ok(data)
  } catch {
    return fail(event, 500, 1, '服务异常')
  }
})
