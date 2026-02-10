import fsSync from 'node:fs'
import path from 'node:path'
import { rootDir } from '../../config.js'
import { ensureDir, sanitizeSingleName } from '../../utils/images-fs'
import { normalizePath, resolvePath } from '../../utils/paths.js'
import { buildNodeAuthHeaders, fail, fetchNodePayload, joinNodePath, listEnabledPicmiNodes, normalizeHttpBase, ok, readBodySafe, requireAuth, usePicmi } from '../../utils/nitro'

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event)
  if (auth) return auth

  try {
    const picmi = await usePicmi(event)
    const body = await readBodySafe<{ path?: string; name?: string }>(event)
    const safeName = sanitizeSingleName(String(body?.name ?? ''))
    if (!safeName) return fail(event, 400, 40001, '参数错误')

    const config = await picmi.store.getConfig()
    const enableLocalStorage = config?.enableLocalStorage === true
    const nodes = Array.isArray(config?.nodes) ? config.nodes : []
    const enabledNodes = listEnabledPicmiNodes(nodes)
    if (!enableLocalStorage && enabledNodes.length > 0) {
      let firstPayload: any = null
      const currentPath = normalizePath(body?.path ?? '/')
      for (const node of enabledNodes) {
        const base = normalizeHttpBase(node?.address)
        if (!base) return fail(event, 400, 40002, '节点地址无效')
        const url = new URL('/api/images/mkdir', base)
        const bodyOut = { path: joinNodePath(node?.rootDir || '/', currentPath), name: safeName }
        const { res, payload } = await fetchNodePayload(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...buildNodeAuthHeaders(node) },
          body: JSON.stringify(bodyOut)
        })
        if (!res) return fail(event, 502, 50201, '节点不可达')
        if (!payload || typeof payload !== 'object') return fail(event, 502, 50201, '节点响应异常')
        if (!res.ok) return fail(event, res.status, Number((payload as any).code) || 1, String((payload as any).message || `http ${res.status}`))
        if (!firstPayload) firstPayload = payload
      }
      return firstPayload ?? ok(null)
    }

    const root = path.resolve(rootDir, picmi.config.storageRoot)
    const currentPath = normalizePath(body?.path ?? '/')
    const { target } = resolvePath(root, path.posix.join(currentPath, safeName))
    if (fsSync.existsSync(target)) return fail(event, 409, 40901, '文件夹已存在')

    await ensureDir(target)
    return ok(null)
  } catch {
    return fail(event, 500, 1, '服务异常')
  }
})
