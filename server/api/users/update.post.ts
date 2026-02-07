import { hashPassword } from '../../utils/hash.js'
import { fail, ok, readBodySafe, requireAuth, usePicmi } from '../../utils/nitro'

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event)
  if (auth) return auth

  try {
    const picmi = await usePicmi(event)

    const body = await readBodySafe<{ username?: string; password?: string }>(event)
    const username = body?.username
    const password = body?.password
    if (!username || !password) return fail(event, 400, 40001, '参数错误')

    await picmi.store.upsertUser(String(username).trim(), hashPassword(String(password)))
    return ok(null)
  } catch {
    return fail(event, 500, 1, '服务异常')
  }
})
