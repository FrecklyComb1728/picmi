import { getQuery } from 'h3'
import { normalizePath } from '../../utils/paths.js'
import { fail, ok, requireAdmin, usePicmi } from '../../utils/nitro'

export default defineEventHandler(async (event) => {
  const auth = await requireAdmin(event)
  if (auth) return auth

  try {
    const picmi = await usePicmi(event)
    const query = getQuery(event) as { path?: string }
    const current = normalizePath(query?.path ?? '/')
    const list = await picmi.store.getPublicPaths()
    return ok({ enabled: list.includes(current) })
  } catch {
    return fail(event, 500, 1, '服务异常')
  }
})
