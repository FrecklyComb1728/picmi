import { fail, ok, requireAuth, usePicmi } from '../../utils/nitro'

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event)
  if (auth) return auth

  try {
    const picmi = await usePicmi(event)
    const users = await picmi.store.getUsers()
    return ok({ users })
  } catch {
    return fail(event, 500, 1, '服务异常')
  }
})
