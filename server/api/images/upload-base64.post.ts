import path from 'node:path'
import fs from 'node:fs/promises'
import { rootDir } from '../../config.js'
import { ensureDir, normalizeMaxUploadBytes, sanitizeSingleName } from '../../utils/images-fs'
import { normalizePath, resolvePath } from '../../utils/paths.js'
import { validateImageUpload } from '../../utils/images-validate.js'
import { buildNodeAuthHeaders, fail, fetchNodePayload, joinNodePath, normalizeHttpBase, ok, pickEnabledPicmiNode, readBodySafe, requireAuth, usePicmi } from '../../utils/nitro'

const formatNumber = (n: number, digits = 1) => {
  const s = n.toFixed(digits)
  return s.endsWith('.0') ? s.slice(0, -2) : s
}

const formatBytes = (bytes: number) => {
  const kb = bytes / 1024
  if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${formatNumber(mb)} MB`
  const gb = mb / 1024
  return `${formatNumber(gb)} GB`
}

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event)
  if (auth) return auth

  try {
    const picmi = await usePicmi(event)

    const config = await picmi.store.getConfig()
    const enableLocalStorage = config?.enableLocalStorage === true
    const nodes = Array.isArray(config?.nodes) ? config.nodes : []
    const hasEnabledNode = nodes.some((node: any) => node && node.enabled !== false)
    const maxUploadBytes = normalizeMaxUploadBytes(config?.maxUploadBytes)

    if (!enableLocalStorage && !hasEnabledNode) {
      return fail(event, 400, 40002, '请先配置存储节点或启用本地存储')
    }

    const body = await readBodySafe<{ path?: string; filename?: string; base64?: string }>(event)
    const currentPath = normalizePath(body?.path ?? '/')
    const filename = body?.filename
    const base64 = body?.base64
    if (!filename || !base64) return fail(event, 400, 40001, '参数错误')
    const safeName = sanitizeSingleName(String(filename))
    if (!safeName) return fail(event, 400, 40001, '文件名不合法')

    const raw = String(base64)
    const parts = raw.split(',')
    const data = parts.length > 1 ? parts.slice(1).join(',') : raw
    const approx = Math.floor((data.length * 3) / 4)
    if (approx > maxUploadBytes) return fail(event, 413, 41301, `文件过大（最大 ${formatBytes(maxUploadBytes)}）`)
    const buf = Buffer.from(data, 'base64')
    const check = validateImageUpload(safeName, buf)
    if (!check.ok) return fail(event, 415, 41501, String(check.message || '文件类型不支持'))

    if (enableLocalStorage) {
      const root = path.resolve(rootDir, picmi.config.storageRoot)
      const { target } = resolvePath(root, path.posix.join(currentPath, safeName))
      await ensureDir(path.dirname(target))
      await fs.writeFile(target, buf)
      return ok(null)
    }

    const node = pickEnabledPicmiNode(nodes)
    if (!node) return fail(event, 400, 40002, '未配置可用存储节点')
    const base = normalizeHttpBase(node?.address)
    if (!base) return fail(event, 400, 40002, '节点地址无效')
    const nodePath = joinNodePath(node?.rootDir || '/', currentPath)
    const url = new URL('/api/images/upload-base64', base)
    const bodyOut = { path: nodePath, filename: safeName, base64: String(base64) }
    const { res, payload } = await fetchNodePayload(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...buildNodeAuthHeaders(node) },
      body: JSON.stringify(bodyOut)
    })
    if (!res) return fail(event, 502, 50201, '节点不可达')
    if (!payload || typeof payload !== 'object') return fail(event, 502, 50201, '节点响应异常')
    if (!res.ok) return fail(event, res.status, Number((payload as any).code) || 1, String((payload as any).message || `http ${res.status}`))
    return payload as any
  } catch {
    return fail(event, 500, 1, '服务异常')
  }
})
