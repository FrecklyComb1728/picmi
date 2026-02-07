import fs from 'node:fs/promises'
import path from 'node:path'
import { rootDir } from '../../config.js'
import { buildNodeAuthHeaders, fail, fetchNodePayload, joinNodePath, normalizeHttpBase, ok, pickEnabledPicmiNode, requireAuth, toRelativePath, usePicmi } from '../../utils/nitro'

const computeUsage = async (root: string) => {
  let bytes = 0
  let count = 0
  const stack = [root]
  while (stack.length) {
    const current = stack.pop() as string
    let entries: any[] = []
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(full)
        continue
      }
      if (!entry.isFile()) continue
      try {
        const stat = await fs.stat(full)
        bytes += stat.size
        count += 1
      } catch {}
    }
  }
  return { bytes, count }
}

const computeNodeUsage = async (node: any, rootPath: string) => {
  const base = normalizeHttpBase(node?.address)
  if (!base) throw new Error('invalid node')
  const headers = buildNodeAuthHeaders(node)
  let bytes = 0
  let count = 0
  const visited = new Set<string>()
  const stack = ['/']
  while (stack.length) {
    const rel = stack.pop() as string
    if (visited.has(rel)) continue
    visited.add(rel)
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
      } else if (item?.type === 'image') {
        bytes += Number(item?.size ?? 0) || 0
        count += 1
      }
    }
  }
  return { bytes, count }
}

export default defineEventHandler(async (event) => {
  try {
    const picmi = await usePicmi(event)
    const auth = await requireAuth(event)
    if (auth) return auth

    const config = await picmi.store.getConfig()
    const enableLocalStorage = config?.enableLocalStorage === true
    const nodes = Array.isArray(config?.nodes) ? config.nodes : []
    const hasEnabledNode = nodes.some((n: any) => n && n.enabled !== false)

    if (!enableLocalStorage && hasEnabledNode) {
      const node = pickEnabledPicmiNode(nodes)
      if (!node) return fail(event, 400, 40002, '未配置可用存储节点')
      const data = await computeNodeUsage(node, String(node?.rootDir || '/'))
      return ok(data)
    }

    const root = path.resolve(rootDir, picmi.config.storageRoot)
    const data = await computeUsage(root)
    return ok(data)
  } catch {
    return fail(event, 500, 1, '服务异常')
  }
})
