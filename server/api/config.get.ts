import { fail, ok, requireAdmin, usePicmi } from '../utils/nitro'

export default defineEventHandler(async (event) => {
  const auth = await requireAdmin(event)
  if (auth) return auth

  try {
    const picmi = await usePicmi(event)
    const config = await picmi.store.getConfig()
    return ok(config)
  } catch {
    return fail(event, 500, 1, '服务异常')
  }
})
