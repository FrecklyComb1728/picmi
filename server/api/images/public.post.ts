import { normalizePath } from '../../utils/paths.js'
import { fail, ok, readBodySafe, requireAdmin, usePicmi } from '../../utils/nitro'

export default defineEventHandler(async (event) => {
  const auth = await requireAdmin(event)
  if (auth) return auth

  try {
    const picmi = await usePicmi(event)

    const body = await readBodySafe<{ path?: string }>(event)
    const current = normalizePath(body?.path ?? '/')
    const list = await picmi.store.getPublicPaths()
    const enabled = !list.includes(current)
    await picmi.store.setPublicPath(current, enabled)
    return ok({ enabled })
  } catch {
    return fail(event, 500, 1, '服务异常')
  }
})
