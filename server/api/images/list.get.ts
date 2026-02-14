import path from 'node:path'
import { getQuery } from 'h3'
import { rootDir } from '../../config.js'
import { listEntries } from '../../utils/images-fs'
import { isImageFileName, normalizePath } from '../../utils/paths.js'
import { buildNodeAuthHeaders, fail, fetchNodePayload, isLoggedIn, joinNodePath, listEnabledPicmiNodes, normalizeHttpBase, ok, orderEnabledPicmiNodes, requireAuth, toRelativePath, usePicmi } from '../../utils/nitro'

export default defineEventHandler(async (event) => {
  try {
    const picmi = await usePicmi(event)
    const query = getQuery(event) as { path?: string }
    const currentPath = normalizePath(query?.path ?? '/')

    const encodePathForRaw = (relPath: string) => {
      return String(relPath)
        .replace(/^\/+/, '')
        .split('/')
        .filter(Boolean)
        .map(encodeURIComponent)
        .join('/')
    }
    const buildRawUrl = (relPath: string) => `/raw/${encodePathForRaw(relPath)}`
    const buildThumbUrl = (relPath: string) => `/thumb/${encodePathForRaw(relPath)}`

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

      const merged = new Map<string, { item: any; sources: Set<string> | null }>()
      const sourceByKey = new Map<string, { base: string; rootDir: string }>()
      let okCount = 0
      let errorCount = 0

      for (const node of enabledNodes) {
        const base = normalizeHttpBase(node?.address)
        if (!base) {
          errorCount += 1
          continue
        }
        const sourceKey = String(node?.id ?? base)
        if (sourceKey) sourceByKey.set(sourceKey, { base, rootDir: String(node?.rootDir || '/') })
        const url = new URL('/api/images/list', base)
        url.searchParams.set('path', joinNodePath(node?.rootDir || '/', currentPath))
        const { res, payload } = await fetchNodePayload(url, { headers: { ...buildNodeAuthHeaders(node) } })
        if (!res || !payload || typeof payload !== 'object' || Number((payload as any).code) !== 0 || !res.ok) {
          errorCount += 1
          continue
        }
        const data = (payload && typeof payload === 'object' && 'data' in payload) ? (payload as any).data : null
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
      return ok({ path: currentPath, items, nodeError } as any)
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
    return ok({ ...(data as any), items })
  } catch {
    return fail(event, 500, 1, '服务异常')
  }
})
