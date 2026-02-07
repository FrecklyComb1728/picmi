import path from 'node:path'
import fs from 'node:fs/promises'
import { rootDir } from '../../config.js'
import { sanitizeSingleName } from '../../utils/images-fs'
import { normalizePath, resolvePath } from '../../utils/paths.js'
import { buildNodeAuthHeaders, fail, fetchNodePayload, joinNodePath, normalizeHttpBase, ok, pickEnabledPicmiNode, readBodySafe, requireAuth, usePicmi } from '../../utils/nitro'

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event)
  if (auth) return auth

  try {
    const picmi = await usePicmi(event)

    const body = await readBodySafe<{ path?: string; newName?: string }>(event)
    const current = normalizePath(body?.path ?? '')
    const safeName = sanitizeSingleName(String(body?.newName ?? ''))
    if (!current || current === '/' || !safeName) return fail(event, 400, 40001, '参数错误')

    const config = await picmi.store.getConfig()
    const enableLocalStorage = config?.enableLocalStorage === true
    const nodes = Array.isArray(config?.nodes) ? config.nodes : []
    const hasEnabledNode = nodes.some((node: any) => node && node.enabled !== false)
    if (!enableLocalStorage && hasEnabledNode) {
      const node = pickEnabledPicmiNode(nodes)
      if (!node) return fail(event, 400, 40002, '未配置可用存储节点')
      const base = normalizeHttpBase(node?.address)
      if (!base) return fail(event, 400, 40002, '节点地址无效')
      const url = new URL('/api/images/rename', base)
      const bodyOut = { path: joinNodePath(node?.rootDir || '/', current), newName: safeName }
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
    const { target, normalized } = resolvePath(root, current)
    const nextNormalized = path.posix.join(path.posix.dirname(normalized), safeName)
    const next = resolvePath(root, nextNormalized).target
    await fs.rename(target, next)
    return ok(null)
  } catch {
    return fail(event, 500, 1, '服务异常')
  }
})
