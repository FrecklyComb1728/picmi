import { fail, ok, readBodySafe, requireAdmin, usePicmi } from '../utils/nitro'
import { syncNewNodes } from '../utils/node-sync'

export default defineEventHandler(async (event) => {
  const auth = await requireAdmin(event)
  if (auth) return auth

  try {
    const picmi = await usePicmi(event)

    const body = await readBodySafe<{
      listApi?: string
      nodes?: unknown
      enableLocalStorage?: boolean
      mediaRequireAuth?: unknown
      maxUploadBytes?: unknown
      thumbnailProcessing?: unknown
      thumbnailMaxBytes?: unknown
      thumbnailMaxWidth?: unknown
      thumbnailSkipBelowBytes?: unknown
      nodeReadStrategy?: unknown
    }>(event)
    const listApi = body?.listApi
    const nodes = body?.nodes
    const enableLocalStorage = body?.enableLocalStorage ?? false
    const mediaRequireAuthRaw = body?.mediaRequireAuth
    const maxUploadBytesRaw = body?.maxUploadBytes
    if (!listApi || !Array.isArray(nodes)) return fail(event, 400, 40001, '参数错误')
    const listApiStr = String(listApi).trim()
    if (!listApiStr.startsWith('/api/')) return fail(event, 400, 40001, '参数错误')
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(listApiStr)) return fail(event, 400, 40001, '参数错误')
    if (mediaRequireAuthRaw !== undefined && typeof mediaRequireAuthRaw !== 'boolean') return fail(event, 400, 40001, '参数错误')
    if (maxUploadBytesRaw !== undefined) {
      const n = Number(maxUploadBytesRaw)
      if (!Number.isFinite(n)) return fail(event, 400, 40001, '参数错误')
    }
    const hasEnabledNode = nodes.some((node: any) => node && node.enabled !== false)
    if (enableLocalStorage && hasEnabledNode) return fail(event, 400, 40003, '本地存储与存储节点不可同时启用')

    const prev = await picmi.store.getConfig()
    const mediaRequireAuth = mediaRequireAuthRaw !== undefined ? mediaRequireAuthRaw === true : prev?.mediaRequireAuth !== false
    const thumbnailProcessingRaw = body?.thumbnailProcessing
    const thumbnailMaxBytesRaw = body?.thumbnailMaxBytes
    const thumbnailMaxWidthRaw = body?.thumbnailMaxWidth
    const thumbnailSkipBelowBytesRaw = body?.thumbnailSkipBelowBytes
    const nodeReadStrategyRaw = body?.nodeReadStrategy
    if (thumbnailMaxBytesRaw !== undefined) {
      const n = Number(thumbnailMaxBytesRaw)
      if (!Number.isFinite(n)) return fail(event, 400, 40001, '参数错误')
    }
    if (thumbnailMaxWidthRaw !== undefined) {
      const n = Number(thumbnailMaxWidthRaw)
      if (!Number.isFinite(n)) return fail(event, 400, 40001, '参数错误')
    }
    if (thumbnailSkipBelowBytesRaw !== undefined) {
      const n = Number(thumbnailSkipBelowBytesRaw)
      if (!Number.isFinite(n)) return fail(event, 400, 40001, '参数错误')
    }
    if (nodeReadStrategyRaw !== undefined) {
      const mode = String(nodeReadStrategyRaw ?? '').trim()
      const allowed = mode === 'round-robin' || mode === 'random' || mode === 'path-hash'
      if (!allowed) return fail(event, 400, 40001, '参数错误')
    }
    const modeStr = String(thumbnailProcessingRaw ?? prev?.thumbnailProcessing ?? 'node').trim()
    const thumbnailProcessing = modeStr === 'backend' ? 'backend' : 'node'
    const thumbnailMaxBytes = thumbnailMaxBytesRaw ?? prev?.thumbnailMaxBytes
    const thumbnailMaxWidth = thumbnailMaxWidthRaw ?? prev?.thumbnailMaxWidth
    const thumbnailSkipBelowBytes = thumbnailSkipBelowBytesRaw ?? prev?.thumbnailSkipBelowBytes
    await picmi.store.saveConfig(listApiStr, nodes, enableLocalStorage, mediaRequireAuth, maxUploadBytesRaw, thumbnailProcessing, thumbnailMaxBytes, thumbnailMaxWidth, thumbnailSkipBelowBytes, nodeReadStrategyRaw)

    if (Array.isArray(prev?.nodes) && Array.isArray(nodes)) {
      await syncNewNodes(prev.nodes, nodes).catch(() => {})
    }

    return ok(null)
  } catch {
    return fail(event, 500, 1, '服务异常')
  }
})