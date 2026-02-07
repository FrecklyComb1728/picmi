import path from 'node:path'
import fs from 'node:fs/promises'
import { rootDir } from '../../config.js'
import { ensureDir } from '../../utils/images-fs'
import { normalizePath, resolvePath } from '../../utils/paths.js'
import { buildNodeAuthHeaders, fail, fetchNodePayload, joinNodePath, normalizeHttpBase, ok, pickEnabledPicmiNode, readBodySafe, requireAuth, usePicmi } from '../../utils/nitro'

type MoveItem = { path: string }

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event)
  if (auth) return auth

  try {
    const picmi = await usePicmi(event)

    const body = await readBodySafe<{ toPath?: string; items?: MoveItem[] }>(event)
    const items = body?.items
    if (!Array.isArray(items)) return fail(event, 400, 40001, '参数错误')
    const dest = normalizePath(body?.toPath ?? '/')

    const config = await picmi.store.getConfig()
    const enableLocalStorage = config?.enableLocalStorage === true
    const nodes = Array.isArray(config?.nodes) ? config.nodes : []
    const hasEnabledNode = nodes.some((node: any) => node && node.enabled !== false)
    if (!enableLocalStorage && hasEnabledNode) {
      const node = pickEnabledPicmiNode(nodes)
      if (!node) return fail(event, 400, 40002, '未配置可用存储节点')
      const base = normalizeHttpBase(node?.address)
      if (!base) return fail(event, 400, 40002, '节点地址无效')
      const url = new URL('/api/images/move', base)
      const rootPath = node?.rootDir || '/'
      const bodyOut = {
        toPath: joinNodePath(rootPath, dest),
        items: items.map((it) => ({ path: joinNodePath(rootPath, it.path) }))
      }
      const { res, payload } = await fetchNodePayload(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...buildNodeAuthHeaders(node) },
        body: JSON.stringify(bodyOut)
      })
      if (!res) return fail(event, 502, 50201, '节点不可达')
      if (!payload || typeof payload !== 'object') return fail(event, 502, 50201, '节点响应异常')
      if (!res.ok) return fail(event, res.status, Number((payload as any).code) || 1, String((payload as any).message || `http ${res.status}`))
      return payload as any
    }

    const root = path.resolve(rootDir, picmi.config.storageRoot)
    for (const item of items) {
      const from = resolvePath(root, item.path).target
      const target = resolvePath(root, path.posix.join(dest, path.basename(from))).target
      await ensureDir(path.dirname(target))
      await fs.rename(from, target)
    }

    return ok(null)
  } catch {
    return fail(event, 500, 1, '服务异常')
  }
})
