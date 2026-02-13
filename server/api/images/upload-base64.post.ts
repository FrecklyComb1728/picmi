import path from 'node:path'
import fs from 'node:fs/promises'
import { rootDir } from '../../config.js'
import { ensureDir, normalizeMaxUploadBytes, sanitizeSingleName } from '../../utils/images-fs'
import { isImageFileName, normalizePath, resolvePath, validateImageUpload } from '../../utils/paths.js'
import { buildNodeAuthHeaders, fail, fetchNodePayload, joinNodePath, listEnabledPicmiNodes, normalizeHttpBase, ok, readBodySafe, requireAuth, usePicmi } from '../../utils/nitro'
import sharp from 'sharp'

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
    const enabledNodes = listEnabledPicmiNodes(nodes)
    const maxUploadBytes = normalizeMaxUploadBytes(config?.maxUploadBytes)

    if (!enableLocalStorage && enabledNodes.length === 0) {
      return fail(event, 400, 40002, '请先配置存储节点或启用本地存储')
    }

    const body = await readBodySafe<{ path?: string; filename?: string; base64?: string; thumbnailProcessing?: unknown }>(event)
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

    const configThumbMode = String((config as any)?.thumbnailProcessing ?? 'node').trim()
    const requestThumbMode = String(body?.thumbnailProcessing ?? '').trim()
    const thumbnailProcessing = requestThumbMode === 'backend' || requestThumbMode === 'node'
      ? requestThumbMode
      : (configThumbMode === 'backend' ? 'backend' : 'node')
    const thumbMaxWidth = Math.max(1024, Math.min(2048, Math.floor(Number((config as any)?.thumbnailMaxWidth ?? 1600) || 1600)))
    const thumbSkipBelowBytes = Math.max(0, Math.min(50 * 1024 * 1024, Math.floor(Number((config as any)?.thumbnailSkipBelowBytes ?? 0) || 0)))

    const buildThumbRelPath = (relPath: string) => {
      const ext = path.posix.extname(relPath).toLowerCase()
      if (ext === '.svg') return normalizePath(`/.cache/thumbnail${relPath}`)
      return normalizePath(`/.cache/thumbnail${relPath}.avif`)
    }

    const buildThumbBuffer = async (name: string, source: Buffer) => {
      const ext = path.posix.extname(name).toLowerCase()
      if (ext === '.svg') return { buf: source, type: 'svg' as const }
      const targetWidth = Math.max(1024, Math.floor(Number(thumbMaxWidth) || 1600))
      const targetHeight = targetWidth
      const quality = 85
      const effort = 2
      const meta = await sharp(source, { failOnError: false }).metadata()
      const metaWidth = Number(meta.width)
      const metaHeight = Number(meta.height)
      const baseWidth = Number.isFinite(metaWidth) && metaWidth > 0 ? metaWidth : targetWidth
      const baseHeight = Number.isFinite(metaHeight) && metaHeight > 0 ? metaHeight : targetHeight
      let scale = 1
      if (baseWidth > targetWidth) scale = targetWidth / baseWidth
      else if (baseHeight > targetHeight) scale = targetHeight / baseHeight
      const newWidth = Math.floor(baseWidth * scale)
      const newHeight = Math.floor(baseHeight * scale)
      const out = await sharp(source, { failOnError: false })
        .resize({ width: newWidth, height: newHeight, fit: 'inside', withoutEnlargement: true })
        .avif({ quality, effort })
        .toBuffer()
      return { buf: out, type: 'avif' as const }
    }

    if (enableLocalStorage) {
      const root = path.resolve(rootDir, picmi.config.storageRoot)
      const { target } = resolvePath(root, path.posix.join(currentPath, safeName))
      await ensureDir(path.dirname(target))
      await fs.writeFile(target, buf)
      if (thumbnailProcessing === 'backend' && isImageFileName(safeName)) {
        if (thumbSkipBelowBytes > 0 && buf.length <= thumbSkipBelowBytes) return ok(null)
        const relPath = normalizePath(path.posix.join(currentPath, safeName))
        const thumbRel = buildThumbRelPath(relPath)
        const thumbTarget = resolvePath(root, thumbRel).target
        await ensureDir(path.dirname(thumbTarget))
        const { buf: outBuf } = await buildThumbBuffer(safeName, buf)
        await fs.writeFile(thumbTarget, outBuf)
      }
      return ok(null)
    }

    let firstPayload: any = null
    for (const node of enabledNodes) {
      const base = normalizeHttpBase(node?.address)
      if (!base) return fail(event, 400, 40002, '节点地址无效')
      const nodePath = joinNodePath(node?.rootDir || '/', currentPath)
      const url = new URL('/api/images/upload-base64', base)
      const bodyOut = { path: nodePath, filename: safeName, base64: String(base64), skipThumb: thumbnailProcessing === 'backend' ? '1' : undefined }
      const { res, payload } = await fetchNodePayload(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...buildNodeAuthHeaders(node) },
        body: JSON.stringify(bodyOut)
      })
      if (!res) return fail(event, 502, 50201, '节点不可达')
      if (!payload || typeof payload !== 'object') return fail(event, 502, 50201, '节点响应异常')
      if (!res.ok) return fail(event, res.status, Number((payload as any).code) || 1, String((payload as any).message || `http ${res.status}`))
      if (!firstPayload) firstPayload = payload

      if (thumbnailProcessing === 'backend' && isImageFileName(safeName)) {
        if (thumbSkipBelowBytes > 0 && buf.length <= thumbSkipBelowBytes) continue
        const baseUrl = normalizeHttpBase(node?.address)
        if (!baseUrl) return fail(event, 400, 40002, '节点地址无效')
        const nodeOriginalPath = joinNodePath(node?.rootDir || '/', normalizePath(path.posix.join(currentPath, safeName)))
        const { buf: outBuf } = await buildThumbBuffer(safeName, buf)
        const formThumb = new FormData()
        formThumb.set('thumb', '1')
        formThumb.set('originPath', nodeOriginalPath)
        formThumb.set('file', new Blob([new Uint8Array(outBuf)]), `${safeName}.avif`)
        const urlThumb = new URL('/api/images/upload', baseUrl)
        const { res: resThumb, payload: payloadThumb } = await fetchNodePayload(urlThumb, { method: 'POST', headers: { ...buildNodeAuthHeaders(node) }, body: formThumb })
        if (!resThumb) return fail(event, 502, 50201, '节点不可达')
        if (!payloadThumb || typeof payloadThumb !== 'object') return fail(event, 502, 50201, '节点响应异常')
        if (!resThumb.ok) return fail(event, resThumb.status, Number((payloadThumb as any).code) || 1, String((payloadThumb as any).message || `http ${resThumb.status}`))
      }
    }
    return firstPayload ?? ok(null)
  } catch {
    return fail(event, 500, 1, '服务异常')
  }
})
