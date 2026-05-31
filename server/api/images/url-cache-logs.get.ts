import { getQuery } from 'h3'
import { fail, ok, requireAdmin, usePicmi } from '../../utils/nitro'

export default defineEventHandler(async (event) => {
  const auth = await requireAdmin(event)
  if (auth) return auth

  try {
    const picmi = await usePicmi(event)
    const query = getQuery(event) as { limit?: string; offset?: string }
    const limitRaw = Number(query?.limit)
    const offsetRaw = Number(query?.offset)
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 50
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0

    const logs = await picmi.store.getCacheLogs(limit, offset)
    return ok({ items: logs, limit, offset })
  } catch {
    return fail(event, 500, 1, '服务异常')
  }
})