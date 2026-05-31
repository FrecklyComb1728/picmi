import path from 'node:path'
import { getQuery, setResponseHeader } from 'h3'
import { rootDir } from '../../config.js'
import { listEntries } from '../../utils/images-fs'
import { isImageFileName, normalizePath } from '../../utils/paths.js'
import { buildNodeAuthHeaders, fail, fetchNodePayload, isLoggedIn, joinNodePath, listEnabledPicmiNodes, normalizeHttpBase, ok, orderEnabledPicmiNodes, requireAuth, toRelativePath, usePicmi } from '../../utils/nitro'
import { buildRawUrl, buildThumbUrl } from '../../utils/images-url'

const DEFAULT_CACHE_TTL_MS = 300_000

const nodesFromCache = async (picmi: any, enabledNodes: any[], currentPath: string, ttlMs: number) => {
  const now = Date.now()
  const nodeDataMap = new Map()
  const cacheStatus: Record<string, 'HIT' | 'MISS' | 'EXPIRED'> = {}

  for (const node of enabledNodes) {
    const nodeId = String(node?.id ?? '')
    const cached = await picmi.store.getImageUrlCache(nodeId, currentPath)
    const updatedAt = cached.length > 0 ? new Date(cached[0].updatedAt).getTime() : 0
    const isFresh = cached.length > 0 && now - updatedAt <= ttlMs

    if (cached.length === 0) {
      cacheStatus[nodeId] = 'MISS'
    } else if (isFresh) {
      cacheStatus[nodeId] = 'HIT'
    } else {
      cacheStatus[nodeId] = 'EXPIRED'
    }

    if (isFresh) {
      nodeDataMap.set(nodeId, {
        items: cached.map((c: any) => ({
          type: isImageFileName(c.fileName) ? 'image' : 'file',
          name: c.fileName ?? path.posix.basename(c.url),
          path: c.url,
          size: c.fileSize,
          uploadedAt: c.uploadedAt
        }))
      })
    }
  }

  return { nodeDataMap, cacheStatus }
}

const fetchAndCacheNode = async (picmi: any, node: any, currentPath: string) => {
  const nodeId = String(node?.id ?? '')
  const base = normalizeHttpBase(node?.address)
  if (!base) return null

  const url = new URL('/api/images/list', base)
  url.searchParams.set('path', joinNodePath(node?.rootDir || '/', currentPath))
  const { res, payload } = await fetchNodePayload(url, { headers: { ...buildNodeAuthHeaders(node) } })

  if (!res || !payload || typeof payload !== 'object' || Number((payload as any).code) !== 0 || !res.ok) return null

  const data = (payload && typeof payload === 'object' && 'data' in payload) ? (payload as any).data : null
  if (!data) return null

  const rootPath = normalizePath(node?.rootDir || '/')
  const items = Array.isArray(data.items) ? data.items : []
  const nowIso = new Date().toISOString()

  const urlEntries = items
    .filter((it: any) => it?.type !== 'folder')
    .map((it: any) => {
      const rel = toRelativePath(it?.path, rootPath)
      return {
        url: rel,
        fileName: it?.name ?? null,
        fileSize: it?.size ?? null,
        uploadedAt: it?.uploadedAt ?? null,
        updatedAt: nowIso
      }
    })

  if (urlEntries.length > 0) {
    picmi.store.setImageUrlCache(nodeId, currentPath, urlEntries).catch(() => {})
  }

  return { node, items: data.items, rootPath }
}

export default defineEventHandler(async (event) => {
  try {
    const picmi = await usePicmi(event)
    const query = getQuery(event) as { path?: string }
    const currentPath = normalizePath(query?.path ?? '/')

    const publicPaths = await picmi.store.getPublicPaths()
    const isPublicPath = publicPaths.includes(currentPath)
    const loggedIn = isLoggedIn(event)
    const auth = await requireAuth(event, async () => isPublicPath)
    if (auth) return auth

    const config = await picmi.store.getConfig()
    const nodes = Array.isArray(config?.nodes) ? config.nodes : []
    if (nodes.length > 0) {
      const enabledNodes = listEnabledPicmiNodes(nodes)
      if (enabledNodes.length === 0) return ok({ path: currentPath, items: [], nodeError: '未配置可用存储节点' } as any)

      const ttlMs = Number(config?.urlCacheTtlMs) || DEFAULT_CACHE_TTL_MS
      const { nodeDataMap, cacheStatus } = await nodesFromCache(picmi, enabledNodes, currentPath, ttlMs)

      const merged = new Map<string, { item: any; sources: Set<string> | null }>()
      const sourceByKey = new Map<string, { base: string; rootDir: string }>()
      let okCount = 0
      let errorCount = 0
      let actualCacheHits = 0

      for (const node of enabledNodes) {
        const base = normalizeHttpBase(node?.address)
        if (!base) {
          errorCount += 1
          continue
        }
        const sourceKey = String(node?.id ?? base)
        sourceByKey.set(sourceKey, { base, rootDir: String(node?.rootDir || '/') })
        const nodeId = String(node?.id ?? '')

        if (nodeDataMap.has(nodeId)) {
          const cachedData = nodeDataMap.get(nodeId)
          okCount += 1
          actualCacheHits += 1
          const rootPath = normalizePath(node?.rootDir || '/')
          const items = cachedData.items
          for (const it of items) {
            const rel = toRelativePath(it?.path, rootPath)
            if (!rel) continue
            const kind = isImageFileName(it?.name) ? 'image' : 'file'
            const next = { ...it, type: kind, path: rel, url: buildRawUrl(rel), thumbUrl: kind === 'image' ? buildThumbUrl(rel) : undefined }
            const prev = merged.get(rel)
            if (!prev) {
              merged.set(rel, { item: next, sources: sourceKey ? new Set([sourceKey]) : new Set() })
              continue
            }
            if (prev.sources && sourceKey) prev.sources.add(sourceKey)
            const prevAt = String(prev.item?.uploadedAt ?? '')
            const nextAt = String(next?.uploadedAt ?? '')
            if (nextAt && (!prevAt || nextAt.localeCompare(prevAt) > 0)) prev.item = next
          }
          continue
        }

        const result = await fetchAndCacheNode(picmi, node, currentPath)
        if (!result) {
          errorCount += 1
          continue
        }
        okCount += 1
        const rootPath = normalizePath(result.rootPath || node?.rootDir || '/')
        const items = Array.isArray(result.items) ? result.items : []
        for (const it of items) {
          const rel = toRelativePath(it?.path, rootPath)
          if (!rel) continue
          if (it?.type === 'folder') {
            if (!merged.has(rel)) merged.set(rel, { item: { ...it, path: rel }, sources: null })
            continue
          }
          const kind = isImageFileName(it?.name) ? 'image' : 'file'
          const next = { ...it, type: kind, path: rel, url: buildRawUrl(rel), thumbUrl: kind === 'image' ? buildThumbUrl(rel) : undefined }
          const prev = merged.get(rel)
          if (!prev) {
            merged.set(rel, { item: next, sources: sourceKey ? new Set([sourceKey]) : new Set() })
            continue
          }
          if (prev.sources && sourceKey) prev.sources.add(sourceKey)
          const prevAt = String(prev.item?.uploadedAt ?? '')
          const nextAt = String(next?.uploadedAt ?? '')
          if (nextAt && (!prevAt || nextAt.localeCompare(prevAt) > 0)) prev.item = next
        }
      }

      const items = [...merged.values()].map((entry) => {
        if (!entry?.sources || entry.item?.type === 'folder' || (isPublicPath && !loggedIn)) return entry.item
        const orderedNodes = orderEnabledPicmiNodes(enabledNodes, config?.nodeReadStrategy, entry.item?.path)
        let source = null as any
        for (const node of orderedNodes) {
          const base = normalizeHttpBase(node?.address)
          if (!base) continue
          const key = String(node?.id ?? base)
          if (entry.sources.has(key)) {
            source = { base, rootDir: String(node?.rootDir || '/') }
            break
          }
        }
        if (!source && entry.sources.size > 0) {
          const firstKey = entry.sources.values().next().value
          if (firstKey) source = sourceByKey.get(firstKey) ?? null
        }
        if (source?.base) {
          const nodePath = joinNodePath(source.rootDir || '/', entry.item?.path)
          entry.item.blobUrl = new URL(`/blob${nodePath}`, source.base).toString()
        }
        return entry.item
      })
      const nodeError = okCount === 0 ? '节点不可达' : (errorCount > 0 ? '部分节点不可达' : undefined)

      const consolidatedCache = actualCacheHits === enabledNodes.length ? 'HIT' : (actualCacheHits > 0 ? 'PARTIAL' : 'MISS')

      picmi.logger.info({
        type: 'list',
        action: 'nodes-merged',
        path: currentPath,
        nodeTotal: enabledNodes.length,
        nodeOk: okCount,
        nodeError: errorCount,
        itemTotal: items.length,
        cacheStatus: consolidatedCache,
        nodeCache: cacheStatus,
        nodeErrorStatus: nodeError ?? null
      })

      setResponseHeader(event, 'X-Cache', consolidatedCache)

      return ok({
        path: currentPath,
        items,
        nodeError,
        cacheStatus: consolidatedCache,
        nodeCache: cacheStatus,
        cacheHitCount: actualCacheHits,
        fromCache: consolidatedCache === 'HIT'
      })
    }

    const root = path.resolve(rootDir, picmi.config.storageRoot)
    const data = await listEntries(root, currentPath)
    const items = Array.isArray((data as any)?.items)
      ? (data as any).items.map((it: any) =>
          it?.type === 'folder'
            ? it
            : { ...it, url: buildRawUrl(it?.path), thumbUrl: it?.type === 'image' ? buildThumbUrl(it?.path) : undefined }
        )
      : []

    picmi.logger.info({
      type: 'list',
      action: 'local-fs',
      path: currentPath,
      itemTotal: items.length
    })

    return ok({ ...(data as any), items })
  } catch {
    return fail(event, 500, 1, '服务异常')
  }
})