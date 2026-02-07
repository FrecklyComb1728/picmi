import { getQuery } from 'h3'
import { fail, ok, requireAuth, usePicmi } from '../../utils/nitro'

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event)
  if (auth) return auth

  try {
    const picmi = await usePicmi(event)

    const query = getQuery(event) as { username?: string }
    const username = query?.username
    if (!username) return fail(event, 400, 40001, '参数错误')

    await picmi.store.deleteUser(String(username))
    return ok(null)
  } catch {
    return fail(event, 500, 1, '服务异常')
  }
})
