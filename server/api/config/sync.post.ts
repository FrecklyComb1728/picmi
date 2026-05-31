import { fail, ok, readBodySafe, requireAdmin, usePicmi } from '../../utils/nitro'
import { syncPicmiNode } from '../../utils/node-sync'

export default defineEventHandler(async (event) => {
  const auth = await requireAdmin(event)
  if (auth) return auth

  try {
    const picmi = await usePicmi(event)
    const body = await readBodySafe<{ fromId?: unknown; toId?: unknown }>(event)
    const fromId = String(body?.fromId ?? '').trim()
    const toId = String(body?.toId ?? '').trim()
    if (!fromId || !toId || fromId === toId) return fail(event, 400, 40001, '参数错误')

    const config = await picmi.store.getConfig()
    const nodes = Array.isArray(config?.nodes) ? config.nodes : []
    const sourceNode = nodes.find((n: any) => String(n?.id ?? '') === fromId) ?? null
    const targetNode = nodes.find((n: any) => String(n?.id ?? '') === toId) ?? null
    if (!sourceNode || !targetNode) return fail(event, 400, 40001, '参数错误')
    if (sourceNode.enabled === false || targetNode.enabled === false) return fail(event, 400, 40002, '节点未启用')
    if (String(sourceNode?.type ?? 'picmi-node') !== 'picmi-node' || String(targetNode?.type ?? 'picmi-node') !== 'picmi-node') {
      return fail(event, 400, 40002, '节点类型不支持')
    }
    if (String(sourceNode?.address ?? '').trim() === String(targetNode?.address ?? '').trim()) return fail(event, 400, 40002, '节点地址重复')

    await syncPicmiNode(sourceNode, targetNode)
    return ok(null)
  } catch {
    return fail(event, 500, 1, '服务异常')
  }
})